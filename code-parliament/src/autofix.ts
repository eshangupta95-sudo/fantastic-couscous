#!/usr/bin/env node
/**
 * Code Parliament - Zero-Friction Auto-Fix
 *
 * This runs as a PostToolUse hook. When Claude writes a file:
 * 1. Parliament reads and analyzes the actual file
 * 2. If issues found, returns a message that makes Claude fix them immediately
 * 3. No user interaction needed - fully automatic
 *
 * Setup in ~/.claude/settings.json:
 * {
 *   "hooks": {
 *     "PostToolUse": [
 *       {
 *         "matcher": "Edit|Write|MultiEdit",
 *         "command": "npx -y code-parliament-autofix",
 *         "timeout": 10000
 *       }
 *     ]
 *   }
 * }
 *
 * Edge cases handled:
 * - Loop detection: Won't analyze same file twice within 5 seconds
 * - Ignore comments: Add "parliament-ignore" to skip a line
 * - Only analyzes code files (not config/markdown)
 * - Max 1 fix cycle per file to prevent infinite loops
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Loop detection: track recently analyzed files
const LOCK_DIR = join(tmpdir(), 'parliament-locks');
const LOCK_DURATION_MS = 5000; // 5 seconds cooldown

function getLockFile(filePath: string): string {
  const safeName = filePath.replace(/[^a-zA-Z0-9]/g, '_');
  return join(LOCK_DIR, `${safeName}.lock`);
}

function isRecentlyAnalyzed(filePath: string): boolean {
  try {
    mkdirSync(LOCK_DIR, { recursive: true });
    const lockFile = getLockFile(filePath);
    if (!existsSync(lockFile)) return false;

    const lockTime = parseInt(readFileSync(lockFile, 'utf-8'), 10);
    return Date.now() - lockTime < LOCK_DURATION_MS;
  } catch {
    return false;
  }
}

function markAsAnalyzed(filePath: string): void {
  try {
    mkdirSync(LOCK_DIR, { recursive: true });
    writeFileSync(getLockFile(filePath), Date.now().toString());
  } catch {
    // Ignore errors
  }
}

// Code extensions to analyze
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php',
]);

interface Issue {
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  problem: string;
  exactFix: string; // The exact code fix Claude should apply
}

// Analyze file and return concrete fixes
function analyzeFile(filePath: string): Issue[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues: Issue[] = [];

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // Skip lines with parliament-ignore comment
    const prevLine = idx > 0 ? lines[idx - 1] : '';
    if (line.includes('parliament-ignore') || prevLine.includes('parliament-ignore-next-line')) {
      return;
    }

    // Critical: Empty catch blocks (swallows errors)
    if (trimmed.match(/catch\s*\([^)]*\)\s*\{\s*\}/) ||
        (trimmed.includes('catch') && lines[idx + 1]?.trim() === '}')) {
      issues.push({
        line: lineNum,
        severity: 'critical',
        problem: 'Empty catch block swallows errors silently',
        exactFix: `Add error logging: console.error('Error:', error);`,
      });
    }

    // High: console.log in production code
    if (line.includes('console.log(') && !line.includes('//')) {
      issues.push({
        line: lineNum,
        severity: 'high',
        problem: 'Debug console.log should not be in production code',
        exactFix: 'Remove this console.log statement',
      });
    }

    // High: Using 'any' type
    if (line.includes(': any') && !line.includes('//')) {
      const match = line.match(/(\w+)\s*:\s*any/);
      if (match) {
        issues.push({
          line: lineNum,
          severity: 'high',
          problem: `"any" type on "${match[1]}" removes type safety`,
          exactFix: `Replace "any" with the appropriate type (string, number, object, etc.)`,
        });
      }
    }

    // Medium: TODO/FIXME comments
    if (trimmed.match(/\/\/\s*(TODO|FIXME|HACK|XXX):/i)) {
      issues.push({
        line: lineNum,
        severity: 'medium',
        problem: 'Unresolved TODO/FIXME comment',
        exactFix: 'Implement the TODO or remove if already done',
      });
    }

    // Medium: Hardcoded secrets/keys
    if (line.match(/(password|secret|api.?key|token)\s*[:=]\s*['"][^'"]+['"]/i) &&
        !line.includes('process.env')) {
      issues.push({
        line: lineNum,
        severity: 'critical',
        problem: 'Possible hardcoded secret/credential',
        exactFix: 'Move to environment variable: process.env.YOUR_SECRET',
      });
    }
  });

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

// Generate Claude instruction that triggers automatic fix
function generateAutoFixInstruction(filePath: string, issues: Issue[]): string {
  if (issues.length === 0) return '';

  // Only report critical and high severity issues for auto-fix
  const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'high');

  if (criticalIssues.length === 0) return '';

  let instruction = `\n\n⚠️ **Parliament found ${criticalIssues.length} issue(s) that need immediate fixing in \`${filePath}\`:**\n\n`;

  criticalIssues.slice(0, 3).forEach((issue, i) => {
    const icon = issue.severity === 'critical' ? '🔴' : '🟠';
    instruction += `${i + 1}. ${icon} **Line ${issue.line}**: ${issue.problem}\n`;
    instruction += `   → **Fix**: ${issue.exactFix}\n\n`;
  });

  // This phrasing makes Claude automatically act
  instruction += `**Apply these fixes now using the Edit tool.**`;

  return instruction;
}

async function main() {
  // Read hook input from stdin
  let inputData = '';

  await new Promise<void>((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { inputData += chunk; });
    process.stdin.on('end', resolve);
    setTimeout(resolve, 500); // Timeout
  });

  let input: any = null;
  try {
    input = JSON.parse(inputData);
  } catch {
    // No valid input
    console.log(JSON.stringify({ decision: 'approve' }));
    return;
  }

  const toolName = input?.tool_name;
  const filePath = input?.tool_input?.file_path;

  // Only process file write operations
  if (!['Edit', 'Write', 'MultiEdit'].includes(toolName)) {
    console.log(JSON.stringify({ decision: 'approve' }));
    return;
  }

  // Check if it's a code file
  const ext = filePath?.slice(filePath.lastIndexOf('.'));
  if (!ext || !CODE_EXTENSIONS.has(ext)) {
    console.log(JSON.stringify({ decision: 'approve' }));
    return;
  }

  // Loop detection: skip if recently analyzed (prevents infinite fix loops)
  if (isRecentlyAnalyzed(filePath)) {
    // File was just analyzed - this is likely a fix cycle, verify and report
    const issues = analyzeFile(filePath);
    const remaining = issues.filter(i => i.severity === 'critical' || i.severity === 'high');

    if (remaining.length === 0) {
      console.log(JSON.stringify({
        decision: 'approve',
        message: `✅ Parliament verified: \`${filePath}\` - all issues resolved!`,
      }));
    } else {
      // Still has issues but we won't loop - just report
      console.log(JSON.stringify({
        decision: 'approve',
        message: `⚠️ Parliament: \`${filePath}\` still has ${remaining.length} issue(s). Review manually or add \`parliament-ignore\` comment to skip.`,
      }));
    }
    return;
  }

  // Mark file as analyzed (for loop detection)
  markAsAnalyzed(filePath);

  // Analyze the file
  const issues = analyzeFile(filePath);

  // Generate auto-fix instruction
  const instruction = generateAutoFixInstruction(filePath, issues);

  if (instruction) {
    // Issues found - return instruction for Claude to auto-fix
    console.log(JSON.stringify({
      decision: 'approve',
      message: instruction,
    }));
  } else {
    // No issues - show success message
    const fileName = filePath.split('/').pop();
    console.log(JSON.stringify({
      decision: 'approve',
      message: `✅ Parliament: \`${fileName}\` looks good!`,
    }));
  }
}

main().catch(() => {
  console.log(JSON.stringify({ decision: 'approve' }));
});
