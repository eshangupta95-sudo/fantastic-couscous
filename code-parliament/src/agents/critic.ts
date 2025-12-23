import { BaseAgent, AnalysisContext } from './base.js';
import { ParliamentConfig } from '../config/index.js';

export class CriticAgent extends BaseAgent {
  constructor(config: ParliamentConfig) {
    super(config, 'critic');
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

## Your Task as The Critic

Analyze this code focusing on finding problems:
1. **Bugs**: Runtime errors, null references, off-by-one errors, race conditions?
2. **Security**: SQL injection, XSS, hardcoded secrets, auth issues?
3. **Edge Cases**: Empty input, large input, unicode, concurrent access?
4. **Error Handling**: Are errors caught and handled properly?

Be thorough. Assume the code is guilty until proven innocent.

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
      "category": "bug|security|edge-case|error-handling",
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
