import { BaseAgent, AnalysisContext } from './base.js';
import { ParliamentConfig } from '../config/index.js';
export declare class ArchitectAgent extends BaseAgent {
    constructor(config: ParliamentConfig);
    protected buildUserPrompt(context: AnalysisContext): string;
}
//# sourceMappingURL=architect.d.ts.map