import { BaseAgent, AnalysisContext } from './base.js';
import { ParliamentConfig } from '../config/index.js';
export declare class CriticAgent extends BaseAgent {
    constructor(config: ParliamentConfig);
    protected buildUserPrompt(context: AnalysisContext): string;
}
//# sourceMappingURL=critic.d.ts.map