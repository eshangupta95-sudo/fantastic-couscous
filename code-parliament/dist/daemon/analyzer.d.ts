import { ParliamentConfig } from '../config/index.js';
import { SQLiteCache, FileVerdict } from '../cache/index.js';
export interface AnalysisStats {
    filesAnalyzed: number;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
}
export declare class Analyzer {
    private config;
    private cache;
    private architect;
    private critic;
    private pragmatist;
    private resolver;
    private stats;
    private iterationCount;
    constructor(config: ParliamentConfig, cache: SQLiteCache);
    analyzeFile(filePath: string): Promise<FileVerdict | null>;
    getStats(): AnalysisStats;
    resetIterations(): void;
    updateConfig(config: ParliamentConfig): void;
}
//# sourceMappingURL=analyzer.d.ts.map