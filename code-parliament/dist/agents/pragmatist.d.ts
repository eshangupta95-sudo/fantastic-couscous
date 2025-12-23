import { BaseAgent, AnalysisContext } from './base.js';
import { ParliamentConfig } from '../config/index.js';
export declare class PragmatistAgent extends BaseAgent {
    constructor(config: ParliamentConfig);
    protected buildUserPrompt(context: AnalysisContext): string;
}
//# sourceMappingURL=pragmatist.d.ts.map