import { ParliamentConfig } from '../config/index.js';
export type FileEventType = 'add' | 'change' | 'unlink';
export interface FileEvent {
    type: FileEventType;
    path: string;
    relativePath: string;
}
export type FileEventHandler = (event: FileEvent) => void;
export declare class FileWatcher {
    private watcher;
    private projectPath;
    private config;
    private handlers;
    constructor(projectPath: string, config: ParliamentConfig);
    start(): void;
    private handleEvent;
    onEvent(handler: FileEventHandler): void;
    stop(): void;
    updateConfig(config: ParliamentConfig): void;
}
//# sourceMappingURL=watcher.d.ts.map