import chokidar from 'chokidar';
import { relative } from 'path';
import { isCodeFile } from '../utils/language.js';
import { logger } from '../utils/logger.js';
const log = logger.child('watcher');
export class FileWatcher {
    watcher = null;
    projectPath;
    config;
    handlers = [];
    constructor(projectPath, config) {
        this.projectPath = projectPath;
        this.config = config;
    }
    start() {
        if (this.watcher) {
            log.warn('Watcher already running');
            return;
        }
        const ignored = [
            ...this.config.exclude.patterns,
            /^\./, // Hidden files
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
    handleEvent(type, path) {
        // Only process code files
        if (!isCodeFile(path)) {
            return;
        }
        // Check file size limit (skip large files)
        // This is handled in the analyzer
        const relativePath = relative(this.projectPath, path);
        const event = { type, path, relativePath };
        log.debug(`${type}: ${relativePath}`);
        for (const handler of this.handlers) {
            try {
                handler(event);
            }
            catch (error) {
                log.error('Handler error:', error);
            }
        }
    }
    onEvent(handler) {
        this.handlers.push(handler);
    }
    stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            log.info('Watcher stopped');
        }
    }
    updateConfig(config) {
        this.config = config;
        // Restart watcher with new config
        if (this.watcher) {
            this.stop();
            this.start();
        }
    }
}
//# sourceMappingURL=watcher.js.map