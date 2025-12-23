const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
class Logger {
    level = 'info';
    prefix;
    constructor(prefix = 'Parliament') {
        this.prefix = prefix;
        const envLevel = process.env.LOG_LEVEL;
        if (envLevel && LOG_LEVELS[envLevel] !== undefined) {
            this.level = envLevel;
        }
    }
    shouldLog(level) {
        return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
    }
    formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        const levelIcon = {
            debug: '\u{1F50D}',
            info: '\u{2139}\u{FE0F}',
            warn: '\u{26A0}\u{FE0F}',
            error: '\u{274C}',
        }[level];
        return `[${timestamp}] ${levelIcon} [${this.prefix}] ${message}`;
    }
    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            console.debug(this.formatMessage('debug', message), ...args);
        }
    }
    info(message, ...args) {
        if (this.shouldLog('info')) {
            console.info(this.formatMessage('info', message), ...args);
        }
    }
    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message), ...args);
        }
    }
    error(message, ...args) {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message), ...args);
        }
    }
    child(prefix) {
        return new Logger(`${this.prefix}:${prefix}`);
    }
}
export const logger = new Logger();
export { Logger };
//# sourceMappingURL=logger.js.map