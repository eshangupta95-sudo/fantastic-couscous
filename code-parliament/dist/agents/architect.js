import { BaseAgent } from './base.js';
export class ArchitectAgent extends BaseAgent {
    constructor(config) {
        super(config, 'architect');
    }
    buildUserPrompt(context) {
        return `
## File to Review

**Path**: ${context.filePath}
**Language**: ${context.language}
**Language Context**: ${context.languageContext}

${context.projectContext ? `**Project Context**: ${context.projectContext}\n` : ''}

## Code

\`\`\`${context.language}
${context.content}
\`\`\`

## Your Task as The Architect

Analyze this code focusing on:
1. **Architecture**: Is the structure sound? Are patterns used appropriately?
2. **Modularity**: Is it well-organized? Clear separation of concerns?
3. **Scalability**: Will this hold up as the project grows?
4. **Technical Debt**: Does this create problems for the future?
5. **Consistency**: Does it fit with typical patterns for this language?

Provide your verdict as a JSON object:
\`\`\`json
{
  "score": <0-100>,
  "confidence": <0-1>,
  "reasoning": "<your overall assessment>",
  "issues": [
    {
      "id": "<unique-id>",
      "severity": "critical|high|medium|low",
      "category": "architecture|scalability|tech-debt|consistency",
      "description": "<description>",
      "line": <optional>,
      "suggestion": "<fix>"
    }
  ]
}
\`\`\`

Only output the JSON, no additional text.
`;
    }
}
//# sourceMappingURL=architect.js.map