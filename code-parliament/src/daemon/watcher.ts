import chokidar, { FSWatcher } from 'chokidar';
import { relative } from 'path';
import { ParliamentConfig } from '../config/index.js';
import { isCodeFile } from '../utils/language.js';
import { logger } from '../utils/logger.js';

const log = logger.child('watcher');

export type FileEventType = 'add' | 'change' | 'unlink';

export interface FileEvent {
  type: FileEventType;
  path: string;
  relativePath: string;
}

export type FileEventHandler = (event: FileEvent) => void;

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private projectPath: string;
  private config: ParliamentConfig;
  private handlers: FileEventHandler[] = [];

  constructor(projectPath: string, config: ParliamentConfig) {
    this.projectPath = projectPath;
    this.config = config;
  }

  start(): void {
    if (this.watcher) {
      log.warn('Watcher already running');
      return;
    }

    const ignored = [
      ...this.config.exclude.patterns,
      /^\./,  // Hidden files
      /node_modules/,
      /\.git/,
    ];

    this.watcher = chokidar.watch(this.projectPath, {
      ignored,
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (path) => this.handleEvent('add', path))
      .on('change', (path) => this.handleEvent('change', path))
      .on('unlink', (path) => this.handleEvent('unlink', path))
      .on('error', (error) => log.error('Watcher error:', error))
      .on('ready', () => log.info('Watcher ready'));

    log.info(`Watching ${this.projectPath}`);
  }

  private handleEvent(type: FileEventType, path: string): void {
    // Only process code files
    if (!isCodeFile(path)) {
      return;
    }

    // Check file size limit (skip large files)
    // This is handled in the analyzer

    const relativePath = relative(this.projectPath, path);
    const event: FileEvent = { type, path, relativePath };

    log.debug(`${type}: ${relativePath}`);

    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        log.error('Handler error:', error);
      }
    }
  }

  onEvent(handler: FileEventHandler): void {
    this.handlers.push(handler);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      log.info('Watcher stopped');
    }
  }

  updateConfig(config: ParliamentConfig): void {
    this.config = config;
    // Restart watcher with new config
    if (this.watcher) {
      this.stop();
      this.start();
    }
  }
}
