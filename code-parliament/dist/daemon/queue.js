import PQueue from 'p-queue';
import { logger } from '../utils/logger.js';
const log = logger.child('queue');
export class JobQueue {
    queue;
    pending = new Map();
    debounceTimers = new Map();
    debounceMs;
    constructor(concurrency = 3, debounceMs = 2000) {
        this.queue = new PQueue({ concurrency });
        this.debounceMs = debounceMs;
        log.info(`Queue initialized with concurrency ${concurrency}, debounce ${debounceMs}ms`);
    }
    add(filePath, priority = 'normal', handler) {
        // Clear existing debounce timer for this file
        const existingTimer = this.debounceTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        // Set up debounced execution
        const timer = setTimeout(() => {
            this.debounceTimers.delete(filePath);
            this.enqueue(filePath, priority, handler);
        }, priority === 'high' ? 0 : this.debounceMs);
        this.debounceTimers.set(filePath, timer);
    }
    enqueue(filePath, priority, handler) {
        // Skip if already pending
        if (this.pending.has(filePath)) {
            log.debug(`Skipping ${filePath}, already in queue`);
            return;
        }
        const job = {
            id: `${filePath}-${Date.now()}`,
            filePath,
            priority,
            createdAt: Date.now(),
        };
        this.pending.set(filePath, job);
        const priorityValue = { high: 0, normal: 1, low: 2 }[priority];
        this.queue.add(async () => {
            try {
                log.debug(`Processing ${filePath}`);
                await handler();
            }
            catch (error) {
                log.error(`Error processing ${filePath}:`, error);
            }
            finally {
                this.pending.delete(filePath);
            }
        }, { priority: priorityValue });
        log.debug(`Queued ${filePath} with priority ${priority}`);
    }
    get size() {
        return this.queue.size + this.queue.pending;
    }
    get pendingCount() {
        return this.pending.size;
    }
    async waitForIdle() {
        await this.queue.onIdle();
    }
    clear() {
        this.queue.clear();
        this.pending.clear();
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }
}
//# sourceMappingURL=queue.js.map