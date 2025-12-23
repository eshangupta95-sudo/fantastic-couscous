import { ConfigManager } from '../config/index.js';
import { SQLiteCache } from '../cache/index.js';
import { FileWatcher } from './watcher.js';
import { JobQueue } from './queue.js';
import { Analyzer } from './analyzer.js';
import { logger } from '../utils/logger.js';
const log = logger.child('daemon');
export class ParliamentDaemon {
    configManager;
    config;
    cache;
    watcher;
    queue;
    analyzer;
    running = false;
    constructor(options) {
        this.configManager = new ConfigManager(options.projectPath);
        if (options.config) {
            this.configManager.update(options.config);
        }
        this.config = this.configManager.get();
        this.configManager.ensureProjectDir();
        this.cache = new SQLiteCache(this.configManager.getDbPath(), this.config.analysis.targetScore);
        this.watcher = new FileWatcher(options.projectPath, this.config);
        this.queue = new JobQueue(this.config.analysis.concurrency, this.config.analysis.debounceMs);
        this.analyzer = new Analyzer(this.config, this.cache);
        // Wire up file events to the job queue
        this.watcher.onEvent((event) => this.handleFileEvent(event));
    }
    handleFileEvent(event) {
        if (event.type === 'unlink') {
            // File deleted, no need to analyze
            return;
        }
        const priority = event.type === 'add' ? 'normal' : 'high';
        this.queue.add(event.path, priority, async () => {
            await this.analyzer.analyzeFile(event.path);
        });
    }
    start() {
        if (this.running) {
            log.warn('Daemon already running');
            return;
        }
        log.info('Starting Parliament daemon...');
        this.running = true;
        this.watcher.start();
        log.info('Parliament daemon started');
    }
    stop() {
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
    async analyzeFile(filePath) {
        await this.analyzer.analyzeFile(filePath);
    }
    getConfig() {
        return this.config;
    }
    updateConfig(updates) {
        this.config = this.configManager.update(updates);
        this.watcher.updateConfig(this.config);
        this.analyzer.updateConfig(this.config);
        return this.config;
    }
    getCache() {
        return this.cache;
    }
    getStats() {
        return {
            ...this.analyzer.getStats(),
            queueSize: this.queue.size,
            queuePending: this.queue.pendingCount,
        };
    }
    isRunning() {
        return this.running;
    }
}
export * from './watcher.js';
export * from './queue.js';
export * from './analyzer.js';
//# sourceMappingURL=index.js.map