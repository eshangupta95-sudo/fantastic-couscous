export interface Job {
    id: string;
    filePath: string;
    priority: 'high' | 'normal' | 'low';
    createdAt: number;
}
export declare class JobQueue {
    private queue;
    private pending;
    private debounceTimers;
    private debounceMs;
    constructor(concurrency?: number, debounceMs?: number);
    add(filePath: string, priority: "high" | "normal" | "low" | undefined, handler: () => Promise<void>): void;
    private enqueue;
    get size(): number;
    get pendingCount(): number;
    waitForIdle(): Promise<void>;
    clear(): void;
}
//# sourceMappingURL=queue.d.ts.map