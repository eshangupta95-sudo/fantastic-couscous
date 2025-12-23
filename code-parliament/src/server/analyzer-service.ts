/**
 * Scalable Analyzer Service (OpenAI-Compatible)
 *
 * Works with ANY OpenAI-compatible API:
 * - OpenAI
 * - Anthropic (via OpenAI-compatible endpoint)
 * - OpenRouter
 * - Ollama
 * - LM Studio
 * - Azure OpenAI
 * - Together AI
 * - Any other compatible provider
 */

import PQueue from 'p-queue';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = logger.child('analyzer-service');

// Provider presets
export const PROVIDERS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    models: { architect: 'gpt-4o', critic: 'gpt-4o', pragmatist: 'gpt-4o-mini' },
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    models: { architect: 'claude-sonnet-4-20250514', critic: 'claude-sonnet-4-20250514', pragmatist: 'claude-haiku-4-20250514' },
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    models: { architect: 'anthropic/claude-3.5-sonnet', critic: 'anthropic/claude-3.5-sonnet', pragmatist: 'anthropic/claude-3-haiku' },
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    models: { architect: 'llama3', critic: 'llama3', pragmatist: 'llama3' },
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1',
    models: { architect: 'meta-llama/Llama-3-70b-chat-hf', critic: 'meta-llama/Llama-3-70b-chat-hf', pragmatist: 'meta-llama/Llama-3-8b-chat-hf' },
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    models: { architect: 'llama-3.1-70b-versatile', critic: 'llama-3.1-70b-versatile', pragmatist: 'llama-3.1-8b-instant' },
  },
};

export interface AgentModels {
  architect: string;
  critic: string;
  pragmatist: string;
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  models: AgentModels;
  headers?: Record<string, string>;
}

export interface FileInput {
  path: string;
  content: string;
  language?: string;
}

export interface AgentVerdict {
  score: number;
  reasoning: string;
  issues: Array<{
    severity: string;
    category: string;
    description: string;
    line?: number;
    suggestion?: string;
  }>;
  confidence: number;
}

export interface AnalysisResult {
  file: string;
  scores: {
    architect: number;
    critic: number;
    pragmatist: number;
    final: number;
  };
  verdicts: {
    architect: AgentVerdict;
    critic: AgentVerdict;
    pragmatist: AgentVerdict;
  };
  suggestions: string[];
  tokenUsage: {
    input: number;
    output: number;
  };
}

// In-memory cache (Redis in production)
const resultCache = new Map<string, { result: AnalysisResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export class AnalyzerService {
  private config: ProviderConfig;
  private queue: PQueue;
  private prompts: { architect: string; critic: string; pragmatist: string };

  constructor(config: ProviderConfig, concurrency: number = 50) {
    this.config = config;

    // Queue for rate limiting and concurrency
    this.queue = new PQueue({
      concurrency,
      intervalCap: 100,
      interval: 60000,
    });

    // Load prompts
    this.prompts = {
      architect: this.loadPrompt('architect'),
      critic: this.loadPrompt('critic'),
      pragmatist: this.loadPrompt('pragmatist'),
    };

    log.info(`Analyzer service initialized: ${config.baseUrl}`);
  }

  private loadPrompt(agent: string): string {
    try {
      const promptPath = join(__dirname, '..', 'agents', 'prompts', `${agent}.md`);
      return readFileSync(promptPath, 'utf-8');
    } catch {
      return `You are The ${agent.charAt(0).toUpperCase() + agent.slice(1)}, a code reviewer. Analyze code and rate it 0-100.`;
    }
  }

  // OpenAI-compatible API call
  private async callLLM(
    model: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ content: string; tokens: { input: number; output: number } }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...this.config.headers,
    };

    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    };

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content || '',
      tokens: {
        input: data.usage?.prompt_tokens || 0,
        output: data.usage?.completion_tokens || 0,
      },
    };
  }

  // Analyze multiple files
  async analyzeFiles(userId: string, files: FileInput[]): Promise<AnalysisResult[]> {
    log.info(`Analyzing ${files.length} files for user ${userId}`);

    const results = await Promise.all(
      files.map(file => this.analyzeFile(userId, file))
    );

    return results;
  }

  // Analyze single file
  async analyzeFile(userId: string, file: FileInput): Promise<AnalysisResult> {
    const cacheKey = `${userId}:${file.path}:${this.hashContent(file.content)}`;
    const cached = resultCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.result;
    }

    const result = await this.queue.add(async () => {
      return this.performAnalysis(file);
    });

    resultCache.set(cacheKey, { result: result!, timestamp: Date.now() });

    if (resultCache.size > 10000) {
      this.cleanCache();
    }

    return result!;
  }

  private async performAnalysis(file: FileInput): Promise<AnalysisResult> {
    const startTime = Date.now();
    const language = file.language || this.detectLanguage(file.path);

    // Run all 3 agents in parallel
    const [architectResult, criticResult, pragmatistResult] = await Promise.all([
      this.runAgent('architect', file, language),
      this.runAgent('critic', file, language),
      this.runAgent('pragmatist', file, language),
    ]);

    // Weighted final score
    const weights = { architect: 1.0, critic: 1.2, pragmatist: 0.8 };
    const totalWeight = weights.architect + weights.critic + weights.pragmatist;
    const finalScore = Math.round(
      (architectResult.verdict.score * weights.architect +
        criticResult.verdict.score * weights.critic +
        pragmatistResult.verdict.score * weights.pragmatist) /
        totalWeight
    );

    const tokenUsage = {
      input: architectResult.tokens.input + criticResult.tokens.input + pragmatistResult.tokens.input,
      output: architectResult.tokens.output + criticResult.tokens.output + pragmatistResult.tokens.output,
    };

    const allIssues = [
      ...architectResult.verdict.issues,
      ...criticResult.verdict.issues,
      ...pragmatistResult.verdict.issues,
    ].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.severity as keyof typeof order] || 3) - (order[b.severity as keyof typeof order] || 3);
    });

    const suggestions = allIssues.slice(0, 5).filter(i => i.suggestion).map(i => i.suggestion!);

    log.info(`Analyzed ${file.path} in ${Date.now() - startTime}ms, score: ${finalScore}`);

    return {
      file: file.path,
      scores: {
        architect: architectResult.verdict.score,
        critic: criticResult.verdict.score,
        pragmatist: pragmatistResult.verdict.score,
        final: finalScore,
      },
      verdicts: {
        architect: architectResult.verdict,
        critic: criticResult.verdict,
        pragmatist: pragmatistResult.verdict,
      },
      suggestions,
      tokenUsage,
    };
  }

  private async runAgent(
    agent: 'architect' | 'critic' | 'pragmatist',
    file: FileInput,
    language: string
  ): Promise<{ verdict: AgentVerdict; tokens: { input: number; output: number } }> {
    const model = this.config.models[agent];
    const systemPrompt = this.prompts[agent];

    const userPrompt = `
## File to Review

**Path**: ${file.path}
**Language**: ${language}

## Code

\`\`\`${language}
${file.content}
\`\`\`

## Instructions

Analyze this code. Respond with JSON only:
\`\`\`json
{
  "score": <0-100>,
  "confidence": <0-1>,
  "reasoning": "<your assessment>",
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "<category>",
      "description": "<description>",
      "line": <optional line number>,
      "suggestion": "<how to fix>"
    }
  ]
}
\`\`\`
`;

    try {
      const response = await this.callLLM(model, systemPrompt, userPrompt);
      const verdict = this.parseVerdict(response.content);

      return { verdict, tokens: response.tokens };
    } catch (error) {
      log.error(`Agent ${agent} failed:`, error);
      return {
        verdict: { score: 50, reasoning: 'Analysis failed', issues: [], confidence: 0 },
        tokens: { input: 0, output: 0 },
      };
    }
  }

  private parseVerdict(text: string): AgentVerdict {
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
      const parsed = JSON.parse(jsonStr);

      return {
        score: Math.min(100, Math.max(0, parsed.score || 50)),
        reasoning: parsed.reasoning || 'No reasoning provided',
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      };
    } catch {
      return { score: 50, reasoning: 'Failed to parse response', issues: [], confidence: 0 };
    }
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private detectLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
      swift: 'swift', rb: 'ruby', php: 'php', cs: 'csharp', cpp: 'cpp', c: 'c',
    };
    return map[ext || ''] || 'unknown';
  }

  private cleanCache(): void {
    const now = Date.now();
    for (const [key, value] of resultCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        resultCache.delete(key);
      }
    }
  }

  async getStatus(userId: string): Promise<any> {
    return { filesAnalyzed: 0, averageScore: 0, recentFiles: [] };
  }

  async getVerdict(userId: string, filePath: string): Promise<AnalysisResult | null> {
    for (const [key, value] of resultCache.entries()) {
      if (key.startsWith(`${userId}:${filePath}:`)) {
        return value.result;
      }
    }
    return null;
  }

  async getConfig(userId: string): Promise<{ provider: string; models: AgentModels }> {
    return { provider: this.config.baseUrl, models: this.config.models };
  }

  updateConfig(config: Partial<ProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
