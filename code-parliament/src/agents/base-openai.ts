/**
 * Base Agent using OpenAI-compatible API
 *
 * This replaces the Anthropic SDK version to work with any provider.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type AgentType = 'architect' | 'critic' | 'pragmatist';

export interface AnalysisContext {
  filePath: string;
  content: string;
  language: string;
  languageContext?: string;
  projectContext?: string;
}

export interface Issue {
  id?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  line?: number;
  suggestion?: string;
  confidence?: number;
}

export interface AgentVerdict {
  score: number;
  confidence: number;
  reasoning: string;
  issues: Issue[];
}

export interface AnalysisResult {
  verdict: AgentVerdict;
  usage: { inputTokens: number; outputTokens: number };
  cost: number;
}

export interface AgentConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class BaseAgent {
  protected config: AgentConfig;
  protected systemPrompt: string;
  protected agentType: AgentType;
  protected log: ReturnType<typeof logger.child>;

  constructor(config: AgentConfig, agentType: AgentType) {
    this.config = config;
    this.agentType = agentType;
    this.log = logger.child(agentType);

    // Load system prompt
    try {
      const promptPath = join(__dirname, 'prompts', `${agentType}.md`);
      this.systemPrompt = readFileSync(promptPath, 'utf-8');
    } catch {
      this.systemPrompt = `You are The ${this.capitalize(agentType)}, a code reviewer. Analyze code and rate it 0-100.`;
    }
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const userPrompt = this.buildUserPrompt(context);

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 2048,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      const usage = {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      };

      const content = data.choices[0]?.message?.content || '';
      const verdict = this.parseResponse(content);

      this.log.debug(
        `Analyzed ${context.filePath} in ${Date.now() - startTime}ms, score: ${verdict.score}`
      );

      return {
        verdict,
        usage,
        cost: this.calculateCost(usage),
      };
    } catch (error) {
      this.log.error(`Failed to analyze ${context.filePath}:`, error);
      throw error;
    }
  }

  protected buildUserPrompt(context: AnalysisContext): string {
    return `
## File to Review

**Path**: ${context.filePath}
**Language**: ${context.language}
${context.languageContext ? `**Language Context**: ${context.languageContext}` : ''}
${context.projectContext ? `**Project Context**: ${context.projectContext}` : ''}

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

  protected parseResponse(text: string): AgentVerdict {
    let jsonStr = text;

    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonStr);

      return {
        score: this.clamp(parsed.score || 0, 0, 100),
        confidence: this.clamp(parsed.confidence || 0.5, 0, 1),
        reasoning: parsed.reasoning || 'No reasoning provided',
        issues: this.normalizeIssues(parsed.issues || []),
      };
    } catch {
      this.log.error('Failed to parse agent response:', text);
      return {
        score: 50,
        confidence: 0.3,
        reasoning: 'Failed to parse agent response',
        issues: [],
      };
    }
  }

  protected normalizeIssues(issues: unknown[]): Issue[] {
    return (issues as Record<string, unknown>[]).map((issue, index) => ({
      id: (issue.id as string) || `${this.agentType}-${index}`,
      severity: this.normalizeSeverity(issue.severity as string),
      category: (issue.category as string) || 'general',
      description: (issue.description as string) || 'No description',
      line: issue.line as number | undefined,
      suggestion: issue.suggestion as string | undefined,
      confidence: (issue.confidence as number) || 0.8,
    }));
  }

  protected normalizeSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    const normalized = (severity || 'medium').toLowerCase();
    if (['critical', 'high', 'medium', 'low'].includes(normalized)) {
      return normalized as 'critical' | 'high' | 'medium' | 'low';
    }
    return 'medium';
  }

  protected clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  protected capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  protected calculateCost(usage: { inputTokens: number; outputTokens: number }): number {
    // Approximate cost calculation (adjust for specific models)
    const inputCost = (usage.inputTokens / 1000000) * 3; // $3/1M tokens
    const outputCost = (usage.outputTokens / 1000000) * 15; // $15/1M tokens
    return inputCost + outputCost;
  }

  getType(): AgentType {
    return this.agentType;
  }

  updateConfig(config: AgentConfig): void {
    this.config = config;
  }
}
