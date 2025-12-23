#!/usr/bin/env node
/**
 * Code Parliament - File Watcher Daemon
 *
 * Watches your project for file changes and maintains a live cache of verdicts.
 * Run in background: npx code-parliament-daemon /path/to/project &
 *
 * Features:
 * - Watches all code files for changes (add, edit, delete)
 * - Analyzes changed files automatically
 * - Stores verdicts in a JSON cache file
 * - Skips node_modules, .git, dist, etc.
 * - Can run alongside Claude Code
 */

import { watch, FSWatcher } from 'chokidar';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname, relative } from 'path';
import { homedir } from 'os';

// Cache location
const CACHE_DIR = join(homedir(), '.parliament');
const CACHE_FILE = join(CACHE_DIR, 'verdicts.json');

// Code extensions to watch
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php',
]);

// Directories to ignore
const IGNORED_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', '__pycache__', 'venv', '.venv', 'target',
];

interface Issue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  line?: number;
  description: string;
  suggestion: string;
}

interface Verdict {
  score: number;
  issues: Issue[];
  analyzedAt: string;
  fileHash: string;
}

interface CacheData {
  projectPath: string;
  verdicts: Record<string, Verdict>;
  lastUpdated: string;
  stats: {
    filesWatched: number;
    filesAnalyzed: number;
    totalIssues: number;
  };
}

// Simple hash function for change detection
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// Analyze file content (heuristic)
function analyzeFile(content: string): { score: number; issues: Issue[] } {
  const issues: Issue[] = [];
  let score = 100;
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // Skip ignored lines
    if (line.includes('parliament-ignore')) return;

    // Empty catch blocks
    if (trimmed.match(/catch\s*\([^)]*\)\s*\{\s*\}/) ||
        (trimmed.includes('catch') && lines[idx + 1]?.trim() === '}')) {
      issues.push({
        severity: 'critical',
        line: lineNum,
        description: 'Empty catch block swallows errors',
        suggestion: 'Add error handling or logging',
      });
      score -= 15;
    }

    // console.log
    if (line.includes('console.log(') && !line.includes('//')) {
      issues.push({
        severity: 'low',
        line: lineNum,
        description: 'Debug console.log found',
        suggestion: 'Remove before production',
      });
      score -= 3;
    }

    // any type
    if (line.includes(': any') && !line.includes('//')) {
      issues.push({
        severity: 'medium',
        line: lineNum,
        description: 'Using "any" type',
        suggestion: 'Add proper type annotation',
      });
      score -= 5;
    }

    // TODO/FIXME
    if (trimmed.match(/\/\/\s*(TODO|FIXME|HACK|XXX):/i)) {
      issues.push({
        severity: 'low',
        line: lineNum,
        description: 'Unresolved TODO/FIXME',
        suggestion: 'Address or create ticket',
      });
      score -= 2;
    }

    // Hardcoded secrets
    if (line.match(/(password|secret|api.?key|token)\s*[:=]\s*['"][^'"]+['"]/i) &&
        !line.includes('process.env')) {
      issues.push({
        severity: 'critical',
        line: lineNum,
        description: 'Possible hardcoded secret',
        suggestion: 'Use environment variable',
      });
      score -= 20;
    }
  });

  return {
    score: Math.max(0, Math.min(100, score)),
    issues: issues.slice(0, 10),
  };
}

// Load cache from disk
function loadCache(): CacheData | null {
  try {
    if (existsSync(CACHE_FILE)) {
      return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Save cache to disk
function saveCache(cache: CacheData): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('Failed to save cache:', err);
  }
}

// Main daemon class
class ParliamentDaemon {
  private projectPath: string;
  private watcher: FSWatcher | null = null;
  private cache: CacheData;
  private filesWatched = 0;

  constructor(projectPath: string) {
    this.projectPath = projectPath;

    // Load existing cache or create new
    const existingCache = loadCache();
    if (existingCache && existingCache.projectPath === projectPath) {
      this.cache = existingCache;
      console.log(`Loaded ${Object.keys(this.cache.verdicts).length} cached verdicts`);
    } else {
      this.cache = {
        projectPath,
        verdicts: {},
        lastUpdated: new Date().toISOString(),
        stats: {
          filesWatched: 0,
          filesAnalyzed: 0,
          totalIssues: 0,
        },
      };
    }
  }

  start(): void {
    console.log(`\n🏛️  Parliament Daemon starting...`);
    console.log(`📁 Watching: ${this.projectPath}`);
    console.log(`💾 Cache: ${CACHE_FILE}\n`);

    // Build ignore pattern
    const ignorePattern = (path: string) => {
      return IGNORED_DIRS.some(dir => path.includes(`/${dir}/`) || path.includes(`\\${dir}\\`));
    };

    this.watcher = watch(this.projectPath, {
      ignored: [ignorePattern, /(^|[\/\\])\../], // Ignore hidden files
      persistent: true,
      ignoreInitial: false, // Analyze existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (path) => this.handleFile(path, 'added'))
      .on('change', (path) => this.handleFile(path, 'changed'))
      .on('unlink', (path) => this.handleDelete(path))
      .on('ready', () => {
        console.log(`\n✅ Initial scan complete. Watching ${this.filesWatched} files.`);
        console.log(`📊 ${Object.keys(this.cache.verdicts).length} files analyzed`);
        this.updateStats();
        this.printSummary();
        console.log(`\n👀 Watching for changes... (Ctrl+C to stop)\n`);
      })
      .on('error', (err) => console.error('Watch error:', err));
  }

  private handleFile(filePath: string, action: 'added' | 'changed'): void {
    // Check if it's a code file
    const ext = extname(filePath);
    if (!CODE_EXTENSIONS.has(ext)) return;

    this.filesWatched++;

    try {
      const content = readFileSync(filePath, 'utf-8');
      const fileHash = hashContent(content);

      // Skip if unchanged
      const existing = this.cache.verdicts[filePath];
      if (existing && existing.fileHash === fileHash) {
        return;
      }

      // Analyze
      const result = analyzeFile(content);
      const relPath = relative(this.projectPath, filePath);

      this.cache.verdicts[filePath] = {
        score: result.score,
        issues: result.issues,
        analyzedAt: new Date().toISOString(),
        fileHash,
      };

      // Log if issues found
      if (result.issues.length > 0) {
        const icon = result.score >= 70 ? '⚠️' : '❌';
        console.log(`${icon} ${action}: ${relPath} - Score: ${result.score}/100, ${result.issues.length} issue(s)`);
      } else if (action === 'changed') {
        console.log(`✅ ${action}: ${relPath} - Score: ${result.score}/100`);
      }

      this.saveCache();
    } catch {
      // Skip files we can't read
    }
  }

  private handleDelete(filePath: string): void {
    if (this.cache.verdicts[filePath]) {
      delete this.cache.verdicts[filePath];
      const relPath = relative(this.projectPath, filePath);
      console.log(`🗑️  deleted: ${relPath}`);
      this.saveCache();
    }
  }

  private updateStats(): void {
    const verdicts = Object.values(this.cache.verdicts);
    this.cache.stats = {
      filesWatched: this.filesWatched,
      filesAnalyzed: verdicts.length,
      totalIssues: verdicts.reduce((sum, v) => sum + v.issues.length, 0),
    };
    this.cache.lastUpdated = new Date().toISOString();
  }

  private saveCache(): void {
    this.updateStats();
    saveCache(this.cache);
  }

  private printSummary(): void {
    const verdicts = Object.values(this.cache.verdicts);
    if (verdicts.length === 0) return;

    const avgScore = Math.round(
      verdicts.reduce((sum, v) => sum + v.score, 0) / verdicts.length
    );
    const criticalFiles = verdicts.filter(v =>
      v.issues.some(i => i.severity === 'critical')
    ).length;

    console.log(`\n📊 Summary:`);
    console.log(`   Average Score: ${avgScore}/100`);
    console.log(`   Total Issues: ${this.cache.stats.totalIssues}`);
    console.log(`   Critical Files: ${criticalFiles}`);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      console.log('\n🛑 Parliament Daemon stopped');
    }
  }
}

// CLI entry point
async function main() {
  const projectPath = process.argv[2] || process.cwd();

  if (!existsSync(projectPath)) {
    console.error(`Error: Directory not found: ${projectPath}`);
    process.exit(1);
  }

  const daemon = new ParliamentDaemon(projectPath);

  // Handle shutdown
  process.on('SIGINT', () => {
    daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    daemon.stop();
    process.exit(0);
  });

  daemon.start();
}

main().catch(console.error);
