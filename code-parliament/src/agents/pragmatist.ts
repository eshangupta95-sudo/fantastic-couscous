import { BaseAgent, AnalysisContext } from './base.js';
import { ParliamentConfig } from '../config/index.js';

export class PragmatistAgent extends BaseAgent {
  constructor(config: ParliamentConfig) {
    super(config, 'pragmatist');
  }

  protected buildUserPrompt(context: AnalysisContext): string {
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

## Your Task as The Pragmatist

Analyze this code from a practical perspective:
1. **Simplicity**: Is this overengineered? Could it be simpler?
2. **Readability**: Can a junior dev understand this at 3am?
3. **Practicality**: Does it solve the actual problem? Are we bikeshedding?
4. **Maintainability**: Can this be easily modified and debugged?

Push back on unnecessary complexity. Value working code over perfect code.

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
      "category": "complexity|readability|practicality|maintainability",
      "description": "<description>",
      "line": <optional>,
      "suggestion": "<how to simplify>"
    }
  ]
}
\`\`\`

Only output the JSON, no additional text.
`;
  }
}
