import { extname } from 'path';

export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'csharp'
  | 'cpp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'html'
  | 'css'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'unknown';

const EXTENSION_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyw': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c': 'cpp',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.mdx': 'markdown',
};

export function detectLanguage(filePath: string): Language {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] || 'unknown';
}

export function isCodeFile(filePath: string): boolean {
  const lang = detectLanguage(filePath);
  return !['unknown', 'markdown', 'json', 'yaml'].includes(lang);
}

export function getLanguageContext(language: Language): string {
  const contexts: Record<Language, string> = {
    typescript: 'TypeScript with strict mode, prefer interfaces over types, use const assertions',
    javascript: 'Modern JavaScript (ES2022+), prefer const/let, use async/await',
    python: 'Python 3.10+, use type hints, follow PEP 8',
    go: 'Go 1.21+, follow effective Go guidelines, handle errors explicitly',
    rust: 'Rust with idiomatic patterns, prefer Result over panic, use lifetimes correctly',
    java: 'Java 17+, use records where appropriate, prefer streams',
    csharp: 'C# 12+, use nullable reference types, prefer LINQ',
    cpp: 'Modern C++ (C++20), use smart pointers, RAII',
    ruby: 'Ruby 3+, follow Ruby style guide',
    php: 'PHP 8.2+, use strict types, follow PSR-12',
    swift: 'Swift 5.9+, use optionals correctly, protocol-oriented',
    kotlin: 'Kotlin 1.9+, use coroutines, null safety',
    html: 'Semantic HTML5, accessibility best practices',
    css: 'Modern CSS, CSS variables, logical properties',
    json: 'Valid JSON structure',
    yaml: 'Valid YAML structure',
    markdown: 'Clean markdown formatting',
    unknown: 'General programming best practices',
  };
  return contexts[language];
}
