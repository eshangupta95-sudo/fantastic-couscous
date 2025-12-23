import { AgentVerdict, Issue } from '../cache/types.js';
import { ParliamentConfig } from '../config/index.js';
export interface AgentVerdicts {
    architect: AgentVerdict;
    critic: AgentVerdict;
    pragmatist: AgentVerdict;
}
export interface VotingResult {
    finalScore: number;
    finalVerdict: string;
    consensus: boolean;
    dissent: string[];
    weightedScores: {
        architect: number;
        critic: number;
        pragmatist: number;
    };
}
export declare function calculateWeightedScore(verdicts: AgentVerdicts, weights: ParliamentConfig['weights']): VotingResult;
export declare function mergeIssues(verdicts: AgentVerdicts): Issue[];
export declare function generateSuggestions(verdicts: AgentVerdicts, config: ParliamentConfig): string[];
//# sourceMappingURL=voting.d.ts.map