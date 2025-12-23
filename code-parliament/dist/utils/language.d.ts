export type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java' | 'csharp' | 'cpp' | 'ruby' | 'php' | 'swift' | 'kotlin' | 'html' | 'css' | 'json' | 'yaml' | 'markdown' | 'unknown';
export declare function detectLanguage(filePath: string): Language;
export declare function isCodeFile(filePath: string): boolean;
export declare function getLanguageContext(language: Language): string;
//# sourceMappingURL=language.d.ts.map