import { readFileSync, statSync } from 'fs';
import { ParliamentConfig } from '../config/index.js';
import { SQLiteCache, FileVerdict } from '../cache/index.js';
import { ArchitectAgent, CriticAgent, PragmatistAgent, AnalysisContext } from '../agents/index.js';
import { ConflictResolver, AgentVerdicts } from '../resolver/index.js';
import { hashContent } from '../utils/hash.js';
import { detectLanguage, getLanguageContext } from '../utils/language.js';
import { logger } from '../utils/logger.js';

const log = logger.child('analyzer');

export interface AnalysisStats {
  filesAnalyzed: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export class Analyzer {
  private config: ParliamentConfig;
  private cache: SQLiteCache;
  private architect: ArchitectAgent;
  private critic: CriticAgent;
  private pragmatist: PragmatistAgent;
  private resolver: ConflictResolver;
  private stats: AnalysisStats;
  private iterationCount: Map<string, number> = new Map();

  constructor(config: ParliamentConfig, cache: SQLiteCache) {
    this.config = config;
    this.cache = cache;

    this.architect = new ArchitectAgent(config);
    this.critic = new CriticAgent(config);
    this.pragmatist = new PragmatistAgent(config);
    this.resolver = new ConflictResolver(config);

    this.stats = {
      filesAnalyzed: 0,
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };
  }

  async analyzeFile(filePath: string): Promise<FileVerdict | null> {
    // Check cost limit
    const todayCost = this.cache.getTodayCost();
    if (todayCost >= this.config.limits.dailyCostLimit) {
      log.warn(`Daily cost limit reached ($${todayCost.toFixed(2)}), skipping analysis`);
      return null;
    }

    // Check iteration limit
    const iterations = this.iterationCount.get(filePath) || 0;
    if (iterations >= this.config.analysis.maxIterationsPerFile) {
      log.warn(`Max iterations reached for ${filePath}, skipping`);
      return null;
    }

    // Check file size
    try {
      const stats = statSync(filePath);
      if (stats.size > this.config.limits.maxFileSizeKb * 1024) {
        log.warn(`File too large: ${filePath} (${Math.round(stats.size / 1024)}KB)`);
        return null;
      }
    } catch (error) {
      log.error(`Cannot stat file ${filePath}:`, error);
      return null;
    }

    // Read file content
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (error) {
      log.error(`Cannot read file ${filePath}:`, error);
      return null;
    }

    // Check if already analyzed with same hash
    const fileHash = hashContent(content);
    const existing = this.cache.getVerdictByHash(filePath, fileHash);
    if (existing) {
      log.debug(`Using cached verdict for ${filePath}`);
      return existing;
    }

    // Build analysis context
    const language = detectLanguage(filePath);
    const languageContext = getLanguageContext(language);
    const context: AnalysisContext = {
      filePath,
      content,
      language,
      languageContext,
    };

    log.info(`Analyzing ${filePath}...`);
    const startTime = Date.now();

    try {
      // Run all three agents in parallel
      const [architectResult, criticResult, pragmatistResult] = await Promise.all([
        this.architect.analyze(context),
        this.critic.analyze(context),
        this.pragmatist.analyze(context),
      ]);

      // Update stats
      const totalCost =
        architectResult.cost + criticResult.cost + pragmatistResult.cost;
      const totalInput =
        architectResult.usage.inputTokens +
        criticResult.usage.inputTokens +
        pragmatistResult.usage.inputTokens;
      const totalOutput =
        architectResult.usage.outputTokens +
        criticResult.usage.outputTokens +
        pragmatistResult.usage.outputTokens;

      this.stats.filesAnalyzed++;
      this.stats.totalCost += totalCost;
      this.stats.totalInputTokens += totalInput;
      this.stats.totalOutputTokens += totalOutput;

      // Record cost
      this.cache.recordCost(totalInput, totalOutput, totalCost);

      // Resolve conflicts and generate final verdict
      const verdicts: AgentVerdicts = {
        architect: architectResult.verdict,
        critic: criticResult.verdict,
        pragmatist: pragmatistResult.verdict,
      };

      const finalVerdict = this.resolver.resolve(filePath, fileHash, verdicts);

      // Save to cache
      this.cache.saveVerdict(finalVerdict);

      // Update iteration count
      this.iterationCount.set(filePath, iterations + 1);

      log.info(
        `Analyzed ${filePath} in ${Date.now() - startTime}ms, score: ${finalVerdict.finalScore}/100, cost: $${totalCost.toFixed(4)}`
      );

      return finalVerdict;
    } catch (error) {
      log.error(`Analysis failed for ${filePath}:`, error);
      return null;
    }
  }

  getStats(): AnalysisStats {
    return { ...this.stats };
  }

  resetIterations(): void {
    this.iterationCount.clear();
  }

  updateConfig(config: ParliamentConfig): void {
    this.config = config;
    this.architect.updateConfig(config);
    this.critic.updateConfig(config);
    this.pragmatist.updateConfig(config);
    this.resolver.updateConfig(config);
  }
}
