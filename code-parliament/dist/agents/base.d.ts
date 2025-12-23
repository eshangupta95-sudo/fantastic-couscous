import Anthropic from '@anthropic-ai/sdk';
import { AgentVerdict, Issue } from '../cache/types.js';
import { ParliamentConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { TokenUsage } from '../utils/cost.js';
export type AgentType = 'architect' | 'critic' | 'pragmatist';
export interface AnalysisContext {
    filePath: string;
    content: string;
    language: string;
    languageContext: string;
    projectContext?: string;
}
export interface AnalysisResult {
    verdict: AgentVerdict;
    usage: TokenUsage;
    cost: number;
}
export declare abstract class BaseAgent {
    protected client: Anthropic;
    protected config: ParliamentConfig;
    protected systemPrompt: string;
    protected agentType: AgentType;
    protected log: ReturnType<typeof logger.child>;
    constructor(config: ParliamentConfig, agentType: AgentType);
    analyze(context: AnalysisContext): Promise<AnalysisResult>;
    protected buildUserPrompt(context: AnalysisContext): string;
    protected parseResponse(text: string): AgentVerdict;
    protected normalizeIssues(issues: any[]): Issue[];
    protected normalizeSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low';
    protected clamp(value: number, min: number, max: number): number;
    protected capitalize(str: string): string;
    getType(): AgentType;
    updateConfig(config: ParliamentConfig): void;
}
//# sourceMappingURL=base.d.ts.map