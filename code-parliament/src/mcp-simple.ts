#!/usr/bin/env node
/**
 * Code Parliament - Simple MCP Server (MVP)
 *
 * This is the minimal working version that Claude Code can interact with.
 * Run it and add to Claude Code settings to see the interaction in action.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';

// Code extensions to scan
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php',
]);

// Simple in-memory storage for verdicts
const verdicts = new Map<string, any>();

// Recursively find all code files in a directory
function findCodeFiles(dir: string, files: string[] = [], maxFiles = 100): string[] {
  if (files.length >= maxFiles) return files;
  if (!existsSync(dir)) return files;

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      if (files.length >= maxFiles) break;

      // Skip common non-code directories
      if (['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', 'venv'].includes(entry)) {
        continue;
      }

      const fullPath = join(dir, entry);

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          findCodeFiles(fullPath, files, maxFiles);
        } else if (stat.isFile()) {
          const ext = extname(entry);
          if (CODE_EXTENSIONS.has(ext)) {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip files we can't access
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return files;
}

// Mock analysis function (replace with real LLM calls later)
async function analyzeCode(filePath: string, content: string): Promise<{
  score: number;
  issues: Array<{ severity: string; description: string; line?: number; suggestion: string }>;
  summary: string;
}> {
  // Simple heuristic analysis for MVP demo
  const issues: Array<{ severity: string; description: string; line?: number; suggestion: string }> = [];
  let score = 100;

  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Check for console.log
    if (line.includes('console.log') && !line.includes('//')) {
      issues.push({
        severity: 'low',
        description: 'Debug console.log statement found',
        line: lineNum,
        suggestion: 'Remove console.log before production',
      });
      score -= 5;
    }

    // Check for TODO comments
    if (line.includes('TODO') || line.includes('FIXME')) {
      issues.push({
        severity: 'medium',
        description: 'Unresolved TODO/FIXME comment',
        line: lineNum,
        suggestion: 'Address the TODO item or create a ticket',
      });
      score -= 3;
    }

    // Check for very long lines
    if (line.length > 120) {
      issues.push({
        severity: 'low',
        description: 'Line exceeds 120 characters',
        line: lineNum,
        suggestion: 'Break this line into multiple lines for readability',
      });
      score -= 2;
    }

    // Check for any as type
    if (line.includes(': any') || line.includes('as any')) {
      issues.push({
        severity: 'medium',
        description: 'Using "any" type reduces type safety',
        line: lineNum,
        suggestion: 'Replace with a proper type definition',
      });
      score -= 5;
    }

    // Check for empty catch blocks
    if (line.includes('catch') && lines[index + 1]?.trim() === '}') {
      issues.push({
        severity: 'high',
        description: 'Empty catch block swallows errors',
        line: lineNum,
        suggestion: 'Add error handling or logging in the catch block',
      });
      score -= 10;
    }
  });

  // Check file length
  if (lines.length > 500) {
    issues.push({
      severity: 'medium',
      description: 'File is very long (>500 lines)',
      suggestion: 'Consider splitting into smaller modules',
    });
    score -= 10;
  }

  // Ensure score is in valid range
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    issues: issues.slice(0, 10), // Top 10 issues
    summary: score >= 90
      ? 'Code looks great! Minor improvements possible.'
      : score >= 70
        ? 'Code is acceptable but has some issues to address.'
        : 'Code needs significant improvements before shipping.',
  };
}

// Create the MCP server
const server = new Server(
  {
    name: 'code-parliament',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'parliament_analyze',
        description: 'Analyze code files and get quality verdicts from the Parliament. Returns scores, issues, and suggestions for improvement.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the file being analyzed',
            },
            content: {
              type: 'string',
              description: 'The code content to analyze',
            },
          },
          required: ['file_path', 'content'],
        },
      },
      {
        name: 'parliament_status',
        description: 'Get the overall status of all analyzed files and their scores',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'parliament_get_verdict',
        description: 'Get the verdict for a previously analyzed file',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the file',
            },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'parliament_scan_project',
        description: 'Scan an entire project directory and find all files with issues. Use this when adding Parliament to an existing codebase. Returns a prioritized list of files that need attention.',
        inputSchema: {
          type: 'object',
          properties: {
            directory: {
              type: 'string',
              description: 'Path to the project directory to scan',
            },
            max_files: {
              type: 'number',
              description: 'Maximum number of files to scan (default: 50)',
            },
          },
          required: ['directory'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'parliament_analyze': {
      const filePath = args?.file_path as string;
      const content = args?.content as string;

      if (!filePath || !content) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'file_path and content are required' }),
            },
          ],
        };
      }

      const result = await analyzeCode(filePath, content);

      // Store the verdict
      verdicts.set(filePath, {
        ...result,
        analyzedAt: new Date().toISOString(),
      });

      // Format response for Claude
      let response = `## Code Parliament Verdict for ${filePath}\n\n`;
      response += `**Score: ${result.score}/100** ${result.score >= 90 ? '✅' : result.score >= 70 ? '⚠️' : '❌'}\n\n`;
      response += `**Summary:** ${result.summary}\n\n`;

      if (result.issues.length > 0) {
        response += `### Issues Found (${result.issues.length})\n\n`;
        result.issues.forEach((issue, i) => {
          const severityIcon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
          response += `${i + 1}. ${severityIcon} **${issue.severity.toUpperCase()}**`;
          if (issue.line) response += ` (line ${issue.line})`;
          response += `\n   ${issue.description}\n`;
          response += `   💡 *Suggestion:* ${issue.suggestion}\n\n`;
        });
      } else {
        response += '### No Issues Found! 🎉\n';
      }

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    }

    case 'parliament_status': {
      const allVerdicts = Array.from(verdicts.entries());

      if (allVerdicts.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '## Code Parliament Status\n\nNo files have been analyzed yet. Use `parliament_analyze` to analyze a file.',
            },
          ],
        };
      }

      const avgScore = Math.round(
        allVerdicts.reduce((sum, [, v]) => sum + v.score, 0) / allVerdicts.length
      );

      let response = `## Code Parliament Status\n\n`;
      response += `**Files Analyzed:** ${allVerdicts.length}\n`;
      response += `**Average Score:** ${avgScore}/100 ${avgScore >= 90 ? '✅' : avgScore >= 70 ? '⚠️' : '❌'}\n\n`;

      response += `### File Scores\n\n`;
      allVerdicts
        .sort((a, b) => a[1].score - b[1].score) // Lowest first
        .forEach(([path, verdict]) => {
          const icon = verdict.score >= 90 ? '✅' : verdict.score >= 70 ? '⚠️' : '❌';
          response += `- ${icon} **${verdict.score}%** \`${path}\`\n`;
        });

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    }

    case 'parliament_get_verdict': {
      const filePath = args?.file_path as string;

      if (!filePath) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'file_path is required' }),
            },
          ],
        };
      }

      const verdict = verdicts.get(filePath);

      if (!verdict) {
        return {
          content: [
            {
              type: 'text',
              text: `No verdict found for \`${filePath}\`. Use \`parliament_analyze\` first.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(verdict, null, 2),
          },
        ],
      };
    }

    case 'parliament_scan_project': {
      const directory = args?.directory as string;
      const maxFiles = (args?.max_files as number) || 50;

      if (!directory) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'directory is required' }),
            },
          ],
        };
      }

      // Find all code files
      const files = findCodeFiles(directory, [], maxFiles);

      if (files.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `## Parliament Project Scan\n\nNo code files found in \`${directory}\``,
            },
          ],
        };
      }

      // Analyze each file
      const results: Array<{
        file: string;
        score: number;
        issueCount: number;
        criticalCount: number;
      }> = [];

      for (const file of files) {
        try {
          const content = readFileSync(file, 'utf-8');
          const result = await analyzeCode(file, content);

          // Store verdict
          verdicts.set(file, {
            ...result,
            analyzedAt: new Date().toISOString(),
          });

          const criticalCount = result.issues.filter(i => i.severity === 'high').length;

          results.push({
            file: file.replace(directory, '.'),
            score: result.score,
            issueCount: result.issues.length,
            criticalCount,
          });
        } catch {
          // Skip files we can't read
        }
      }

      // Sort by score (lowest first) to prioritize problem files
      results.sort((a, b) => a.score - b.score);

      // Build response
      const avgScore = Math.round(
        results.reduce((sum, r) => sum + r.score, 0) / results.length
      );
      const totalIssues = results.reduce((sum, r) => sum + r.issueCount, 0);
      const criticalFiles = results.filter(r => r.criticalCount > 0);

      let response = `## 🏛️ Parliament Project Scan Complete\n\n`;
      response += `**Directory:** \`${directory}\`\n`;
      response += `**Files Scanned:** ${results.length}\n`;
      response += `**Average Score:** ${avgScore}/100 ${avgScore >= 90 ? '✅' : avgScore >= 70 ? '⚠️' : '❌'}\n`;
      response += `**Total Issues:** ${totalIssues}\n\n`;

      if (criticalFiles.length > 0) {
        response += `### 🔴 Critical Issues (${criticalFiles.length} files)\n\n`;
        response += `These files have high-severity issues that should be fixed first:\n\n`;
        criticalFiles.slice(0, 10).forEach((r, i) => {
          response += `${i + 1}. \`${r.file}\` - Score: ${r.score}/100, ${r.criticalCount} critical issue(s)\n`;
        });
        response += `\n`;
      }

      const problemFiles = results.filter(r => r.score < 70);
      if (problemFiles.length > 0) {
        response += `### ⚠️ Files Needing Attention (score < 70)\n\n`;
        problemFiles.slice(0, 15).forEach((r, i) => {
          response += `${i + 1}. \`${r.file}\` - Score: ${r.score}/100 (${r.issueCount} issues)\n`;
        });
        response += `\n`;
      }

      const goodFiles = results.filter(r => r.score >= 90);
      response += `### ✅ Clean Files: ${goodFiles.length}/${results.length}\n\n`;

      if (totalIssues > 0) {
        response += `---\n\n`;
        response += `**Next Steps:** Ask me to "fix the issues in [filename]" for any file above, `;
        response += `or say "fix all critical issues" to address the most important problems first.\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Unknown tool: ${name}` }),
          },
        ],
      };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Code Parliament MCP server running on stdio');
}

main().catch(console.error);
