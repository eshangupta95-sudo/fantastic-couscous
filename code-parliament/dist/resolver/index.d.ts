import { FileVerdict, Debate } from '../cache/types.js';
import { ParliamentConfig } from '../config/index.js';
import { AgentVerdicts } from './voting.js';
export interface ResolverResult {
    verdict: FileVerdict;
    debate?: Debate;
    iterations: number;
}
export declare class ConflictResolver {
    private config;
    constructor(config: ParliamentConfig);
    resolve(filePath: string, fileHash: string, verdicts: AgentVerdicts): FileVerdict;
    private detectDeadlock;
    private resolveDeadlock;
    generateDebate(filePath: string, topic: string, verdicts: AgentVerdicts): Debate;
    updateConfig(config: ParliamentConfig): void;
}
export * from './voting.js';
//# sourceMappingURL=index.d.ts.map