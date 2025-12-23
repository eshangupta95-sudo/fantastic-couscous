declare class Logger {
    private level;
    private prefix;
    constructor(prefix?: string);
    private shouldLog;
    private formatMessage;
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    child(prefix: string): Logger;
}
export declare const logger: Logger;
export { Logger };
//# sourceMappingURL=logger.d.ts.map