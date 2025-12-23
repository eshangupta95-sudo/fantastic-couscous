/**
 * Import Graph Builder
 *
 * Builds a map of imports/exports to understand:
 * - Is this file internal (only called by trusted code)?
 * - Is this a boundary file (handles user input)?
 * - What's the blast radius (how many files import this)?
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve, extname } from 'path';

export interface FileNode {
  path: string;
  imports: string[];      // Files this imports
  importedBy: string[];   // Files that import this
  exports: string[];      // Exported symbols
  isEntryPoint: boolean;  // No other files import this
  isBoundary: boolean;    // Handles external input (API routes, CLI, etc.)
  blastRadius: number;    // How many files would be affected by a bug here
}

export interface ImportGraph {
  files: Map<string, FileNode>;
  entryPoints: string[];
  boundaries: string[];
}

// Patterns that indicate a file handles external input
const BOUNDARY_PATTERNS = [
  /\/(api|routes|handlers|controllers)\//,
  /\.(handler|controller|route|api)\./,
  /app\.(ts|js)$/,
  /server\.(ts|js)$/,
  /index\.(ts|js)$/,
  /cli\.(ts|js)$/,
];

/**
 * Build import graph for a project
 */
export function buildImportGraph(projectRoot: string): ImportGraph {
  const files = new Map<string, FileNode>();
  const codeFiles = findCodeFiles(projectRoot);

  // First pass: collect all imports
  for (const filePath of codeFiles) {
    const imports = extractImports(filePath, projectRoot);
    const isBoundary = BOUNDARY_PATTERNS.some(p => p.test(filePath));

    files.set(filePath, {
      path: filePath,
      imports,
      importedBy: [],
      exports: [],
      isEntryPoint: false,
      isBoundary,
      blastRadius: 0,
    });
  }

  // Second pass: build reverse map (importedBy)
  for (const [filePath, node] of files) {
    for (const importPath of node.imports) {
      const importedNode = files.get(importPath);
      if (importedNode) {
        importedNode.importedBy.push(filePath);
      }
    }
  }

  // Third pass: calculate blast radius and entry points
  const entryPoints: string[] = [];
  const boundaries: string[] = [];

  for (const [filePath, node] of files) {
    // Entry points are files that nothing imports
    if (node.importedBy.length === 0) {
      node.isEntryPoint = true;
      entryPoints.push(filePath);
    }

    // Blast radius = transitive count of files that depend on this
    node.blastRadius = calculateBlastRadius(filePath, files);

    if (node.isBoundary) {
      boundaries.push(filePath);
    }
  }

  return { files, entryPoints, boundaries };
}

/**
 * Find all code files in a directory
 */
function findCodeFiles(dir: string, files: string[] = []): string[] {
  const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
  const IGNORE = ['node_modules', '.git', 'dist', 'build', '.next'];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      if (IGNORE.includes(entry)) continue;

      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        findCodeFiles(fullPath, files);
      } else if (stat.isFile() && CODE_EXTENSIONS.has(extname(entry))) {
        files.push(fullPath);
      }
    }
  } catch {
    // Skip inaccessible directories
  }

  return files;
}

/**
 * Extract imports from a file
 */
function extractImports(filePath: string, projectRoot: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const imports: string[] = [];

    // Match ES6 imports: import ... from '...'
    const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      const resolved = resolveImport(match[1], filePath, projectRoot);
      if (resolved) imports.push(resolved);
    }

    // Match require: require('...')
    const requireMatches = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of requireMatches) {
      const resolved = resolveImport(match[1], filePath, projectRoot);
      if (resolved) imports.push(resolved);
    }

    return imports;
  } catch {
    return [];
  }
}

/**
 * Resolve an import path to an absolute file path
 */
function resolveImport(
  importPath: string,
  fromFile: string,
  projectRoot: string
): string | null {
  // Skip external packages
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }

  const fromDir = dirname(fromFile);
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.js'];

  // Try with each extension
  for (const ext of extensions) {
    const fullPath = resolve(fromDir, importPath + ext);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Try without extension (might already have it)
  const direct = resolve(fromDir, importPath);
  if (existsSync(direct)) {
    return direct;
  }

  return null;
}

/**
 * Calculate how many files transitively depend on this file
 */
function calculateBlastRadius(
  filePath: string,
  files: Map<string, FileNode>,
  visited = new Set<string>()
): number {
  if (visited.has(filePath)) return 0;
  visited.add(filePath);

  const node = files.get(filePath);
  if (!node) return 0;

  let count = node.importedBy.length;

  for (const importer of node.importedBy) {
    count += calculateBlastRadius(importer, files, visited);
  }

  return count;
}

/**
 * Get context about a file for smarter analysis
 */
export function getFileContext(graph: ImportGraph, filePath: string): {
  isInternal: boolean;
  isBoundary: boolean;
  blastRadius: number;
  needsValidation: boolean;
  importers: string[];
} {
  const node = graph.files.get(filePath);

  if (!node) {
    return {
      isInternal: false,
      isBoundary: false,
      blastRadius: 0,
      needsValidation: true, // Unknown file, be cautious
      importers: [],
    };
  }

  // Internal files are only imported by other internal files
  const isInternal = !node.isBoundary && node.importedBy.length > 0 &&
    node.importedBy.every(imp => {
      const impNode = graph.files.get(imp);
      return impNode && !impNode.isBoundary;
    });

  // Needs validation if it's a boundary or handles external data
  const needsValidation = node.isBoundary || node.isEntryPoint;

  return {
    isInternal,
    isBoundary: node.isBoundary,
    blastRadius: node.blastRadius,
    needsValidation,
    importers: node.importedBy,
  };
}

/**
 * Summary of project structure
 */
export function getProjectSummary(graph: ImportGraph): {
  totalFiles: number;
  entryPoints: number;
  boundaries: number;
  highBlastFiles: string[]; // Files with blast radius > 5
} {
  const highBlastFiles: string[] = [];

  for (const [path, node] of graph.files) {
    if (node.blastRadius > 5) {
      highBlastFiles.push(path);
    }
  }

  // Sort by blast radius descending
  highBlastFiles.sort((a, b) => {
    const nodeA = graph.files.get(a);
    const nodeB = graph.files.get(b);
    return (nodeB?.blastRadius || 0) - (nodeA?.blastRadius || 0);
  });

  return {
    totalFiles: graph.files.size,
    entryPoints: graph.entryPoints.length,
    boundaries: graph.boundaries.length,
    highBlastFiles: highBlastFiles.slice(0, 10),
  };
}
