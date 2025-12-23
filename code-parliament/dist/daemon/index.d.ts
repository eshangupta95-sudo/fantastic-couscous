import { ParliamentConfig } from '../config/index.js';
import { SQLiteCache } from '../cache/index.js';
export interface DaemonOptions {
    projectPath: string;
    config?: Partial<ParliamentConfig>;
}
export declare class ParliamentDaemon {
    private configManager;
    private config;
    private cache;
    private watcher;
    private queue;
    private analyzer;
    private running;
    constructor(options: DaemonOptions);
    private handleFileEvent;
    start(): void;
    stop(): void;
    analyzeFile(filePath: string): Promise<void>;
    getConfig(): ParliamentConfig;
    updateConfig(updates: Partial<ParliamentConfig>): ParliamentConfig;
    getCache(): SQLiteCache;
    getStats(): {
        queueSize: number;
        queuePending: number;
        filesAnalyzed: number;
        totalCost: number;
        totalInputTokens: number;
        totalOutputTokens: number;
    };
    isRunning(): boolean;
}
export * from './watcher.js';
export * from './queue.js';
export * from './analyzer.js';
//# sourceMappingURL=index.d.ts.map