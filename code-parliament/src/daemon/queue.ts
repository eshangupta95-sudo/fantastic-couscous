import PQueue from 'p-queue';
import { logger } from '../utils/logger.js';

const log = logger.child('queue');

export interface Job {
  id: string;
  filePath: string;
  priority: 'high' | 'normal' | 'low';
  createdAt: number;
}

export class JobQueue {
  private queue: PQueue;
  private pending: Map<string, Job> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number;

  constructor(concurrency: number = 3, debounceMs: number = 2000) {
    this.queue = new PQueue({ concurrency });
    this.debounceMs = debounceMs;

    log.info(`Queue initialized with concurrency ${concurrency}, debounce ${debounceMs}ms`);
  }

  add(
    filePath: string,
    priority: 'high' | 'normal' | 'low' = 'normal',
    handler: () => Promise<void>
  ): void {
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

  private enqueue(
    filePath: string,
    priority: 'high' | 'normal' | 'low',
    handler: () => Promise<void>
  ): void {
    // Skip if already pending
    if (this.pending.has(filePath)) {
      log.debug(`Skipping ${filePath}, already in queue`);
      return;
    }

    const job: Job = {
      id: `${filePath}-${Date.now()}`,
      filePath,
      priority,
      createdAt: Date.now(),
    };

    this.pending.set(filePath, job);

    const priorityValue = { high: 0, normal: 1, low: 2 }[priority];

    this.queue.add(
      async () => {
        try {
          log.debug(`Processing ${filePath}`);
          await handler();
        } catch (error) {
          log.error(`Error processing ${filePath}:`, error);
        } finally {
          this.pending.delete(filePath);
        }
      },
      { priority: priorityValue }
    );

    log.debug(`Queued ${filePath} with priority ${priority}`);
  }

  get size(): number {
    return this.queue.size + this.queue.pending;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  async waitForIdle(): Promise<void> {
    await this.queue.onIdle();
  }

  clear(): void {
    this.queue.clear();
    this.pending.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
