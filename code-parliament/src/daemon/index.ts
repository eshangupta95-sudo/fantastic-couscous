import { ConfigManager, ParliamentConfig } from '../config/index.js';
import { SQLiteCache } from '../cache/index.js';
import { FileWatcher, FileEvent } from './watcher.js';
import { JobQueue } from './queue.js';
import { Analyzer } from './analyzer.js';
import { logger } from '../utils/logger.js';

const log = logger.child('daemon');

export interface DaemonOptions {
  projectPath: string;
  config?: Partial<ParliamentConfig>;
}

export class ParliamentDaemon {
  private configManager: ConfigManager;
  private config: ParliamentConfig;
  private cache: SQLiteCache;
  private watcher: FileWatcher;
  private queue: JobQueue;
  private analyzer: Analyzer;
  private running: boolean = false;

  constructor(options: DaemonOptions) {
    this.configManager = new ConfigManager(options.projectPath);

    if (options.config) {
      this.configManager.update(options.config);
    }

    this.config = this.configManager.get();
    this.configManager.ensureProjectDir();

    this.cache = new SQLiteCache(
      this.configManager.getDbPath(),
      this.config.analysis.targetScore
    );

    this.watcher = new FileWatcher(options.projectPath, this.config);
    this.queue = new JobQueue(
      this.config.analysis.concurrency,
      this.config.analysis.debounceMs
    );
    this.analyzer = new Analyzer(this.config, this.cache);

    // Wire up file events to the job queue
    this.watcher.onEvent((event) => this.handleFileEvent(event));
  }

  private handleFileEvent(event: FileEvent): void {
    if (event.type === 'unlink') {
      // File deleted, no need to analyze
      return;
    }

    const priority = event.type === 'add' ? 'normal' : 'high';

    this.queue.add(event.path, priority, async () => {
      await this.analyzer.analyzeFile(event.path);
    });
  }

  start(): void {
    if (this.running) {
      log.warn('Daemon already running');
      return;
    }

    log.info('Starting Parliament daemon...');
    this.running = true;
    this.watcher.start();
    log.info('Parliament daemon started');
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    log.info('Stopping Parliament daemon...');
    this.watcher.stop();
    this.queue.clear();
    this.cache.close();
    this.running = false;
    log.info('Parliament daemon stopped');
  }

  async analyzeFile(filePath: string): Promise<void> {
    await this.analyzer.analyzeFile(filePath);
  }

  getConfig(): ParliamentConfig {
    return this.config;
  }

  updateConfig(updates: Partial<ParliamentConfig>): ParliamentConfig {
    this.config = this.configManager.update(updates);
    this.watcher.updateConfig(this.config);
    this.analyzer.updateConfig(this.config);
    return this.config;
  }

  getCache(): SQLiteCache {
    return this.cache;
  }

  getStats() {
    return {
      ...this.analyzer.getStats(),
      queueSize: this.queue.size,
      queuePending: this.queue.pendingCount,
    };
  }

  isRunning(): boolean {
    return this.running;
  }
}

export * from './watcher.js';
export * from './queue.js';
export * from './analyzer.js';
