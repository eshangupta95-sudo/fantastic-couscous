import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { calculateCost } from '../utils/cost.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
export class BaseAgent {
    client;
    config;
    systemPrompt;
    agentType;
    log;
    constructor(config, agentType) {
        this.config = config;
        this.agentType = agentType;
        this.log = logger.child(agentType);
        // Initialize Anthropic client with custom base URL if provided
        this.client = new Anthropic({
            apiKey: config.api.apiKey,
            baseURL: config.api.baseUrl,
        });
        // Load system prompt
        const promptPath = join(__dirname, 'prompts', `${agentType}.md`);
        this.systemPrompt = readFileSync(promptPath, 'utf-8');
    }
    async analyze(context) {
        const startTime = Date.now();
        const userPrompt = this.buildUserPrompt(context);
        try {
            const response = await this.client.messages.create({
                model: this.config.api.model,
                max_tokens: 2048,
                system: this.systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: userPrompt,
                    },
                ],
            });
            const usage = {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
            };
            const costResult = calculateCost(this.config.api.model, usage);
            const content = response.content[0];
            if (content.type !== 'text') {
                throw new Error('Unexpected response type');
            }
            const verdict = this.parseResponse(content.text);
            this.log.debug(`Analyzed ${context.filePath} in ${Date.now() - startTime}ms, score: ${verdict.score}`);
            return {
                verdict,
                usage,
                cost: costResult.totalCost,
            };
        }
        catch (error) {
            this.log.error(`Failed to analyze ${context.filePath}:`, error);
            throw error;
        }
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

## Instructions

Analyze this code from your perspective as The ${this.capitalize(this.agentType)}.
Provide your verdict as a JSON object with the exact format specified in your system prompt.
Only output the JSON, no additional text.
`;
    }
    parseResponse(text) {
        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = text;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        }
        // Try to find JSON object
        const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            jsonStr = objectMatch[0];
        }
        try {
            const parsed = JSON.parse(jsonStr);
            // Validate and normalize
            return {
                score: this.clamp(parsed.score || 0, 0, 100),
                confidence: this.clamp(parsed.confidence || 0.5, 0, 1),
                reasoning: parsed.reasoning || 'No reasoning provided',
                issues: this.normalizeIssues(parsed.issues || []),
            };
        }
        catch (error) {
            this.log.error('Failed to parse agent response:', text);
            return {
                score: 50,
                confidence: 0.3,
                reasoning: 'Failed to parse agent response',
                issues: [],
            };
        }
    }
    normalizeIssues(issues) {
        return issues.map((issue, index) => ({
            id: issue.id || `${this.agentType}-${index}`,
            severity: this.normalizeSeverity(issue.severity),
            category: issue.category || 'general',
            description: issue.description || 'No description',
            line: issue.line,
            suggestion: issue.suggestion,
            confidence: issue.confidence || 0.8,
        }));
    }
    normalizeSeverity(severity) {
        const normalized = (severity || 'medium').toLowerCase();
        if (['critical', 'high', 'medium', 'low'].includes(normalized)) {
            return normalized;
        }
        return 'medium';
    }
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    getType() {
        return this.agentType;
    }
    updateConfig(config) {
        this.config = config;
        this.client = new Anthropic({
            apiKey: config.api.apiKey,
            baseURL: config.api.baseUrl,
        });
    }
}
//# sourceMappingURL=base.js.map