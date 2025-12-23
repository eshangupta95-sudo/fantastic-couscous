export interface Issue {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    description: string;
    line?: number;
    suggestion?: string;
    confidence: number;
}
export interface AgentVerdict {
    score: number;
    reasoning: string;
    issues: Issue[];
    confidence: number;
}
export interface FileVerdict {
    id?: number;
    filePath: string;
    fileHash: string;
    architect: AgentVerdict;
    critic: AgentVerdict;
    pragmatist: AgentVerdict;
    finalScore: number;
    finalVerdict: string;
    suggestions: string[];
    createdAt?: string;
    updatedAt?: string;
}
export interface Debate {
    id?: number;
    filePath: string;
    topic: string;
    transcript: DebateMessage[];
    resolution: string;
    createdAt?: string;
}
export interface DebateMessage {
    agent: 'architect' | 'critic' | 'pragmatist';
    message: string;
    timestamp: string;
}
export interface Alert {
    id: string;
    timestamp: string;
    filePath: string;
    score: number;
    previousScore: number | null;
    topIssue: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    suggestion: string;
}
export interface ProjectHealth {
    overall: number;
    target: number;
    targetMet: boolean;
    filesAnalyzed: number;
    filesAboveTarget: number;
    filesBelowTarget: number;
    criticalFiles: Array<{
        path: string;
        score: number;
        topIssue: string;
    }>;
    lastUpdated: string;
}
export interface CostRecord {
    id?: number;
    date: string;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    createdAt?: string;
}
//# sourceMappingURL=types.d.ts.map