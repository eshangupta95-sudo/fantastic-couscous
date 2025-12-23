import { FileVerdict, Debate, Alert, ProjectHealth, CostRecord } from './types.js';
export declare class SQLiteCache {
    private db;
    private alertsFile;
    private targetScore;
    constructor(dbPath: string, targetScore?: number);
    saveVerdict(verdict: FileVerdict): void;
    private getTopIssue;
    getVerdict(filePath: string): FileVerdict | null;
    getVerdictByHash(filePath: string, fileHash: string): FileVerdict | null;
    private rowToVerdict;
    getAllVerdicts(): FileVerdict[];
    getFilesBelowTarget(): FileVerdict[];
    getProjectHealth(): ProjectHealth;
    addAlert(alert: Alert): void;
    getAlerts(): Alert[];
    clearAlerts(): void;
    saveDebate(debate: Debate): number;
    getDebates(filePath?: string, limit?: number): Debate[];
    addIgnore(filePath: string, rule: string, reason: string): void;
    getIgnores(filePath: string): Array<{
        rule: string;
        reason: string;
    }>;
    isIgnored(filePath: string, rule: string): boolean;
    recordCost(inputTokens: number, outputTokens: number, totalCost: number): void;
    getTodayCost(): number;
    getCostHistory(days?: number): CostRecord[];
    setConfig(key: string, value: string): void;
    getConfig(key: string): string | null;
    close(): void;
}
//# sourceMappingURL=sqlite.d.ts.map