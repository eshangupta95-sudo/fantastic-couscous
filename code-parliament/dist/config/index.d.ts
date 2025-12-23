import { ParliamentConfig } from './schema.js';
export declare class ConfigManager {
    private config;
    private projectPath;
    constructor(projectPath: string);
    private loadConfig;
    private deepMerge;
    get(): ParliamentConfig;
    update(updates: Partial<ParliamentConfig>): ParliamentConfig;
    updateApi(baseUrl?: string, model?: string, apiKey?: string): ParliamentConfig;
    private save;
    getProjectPath(): string;
    getAlertsFile(): string;
    getDbPath(): string;
    ensureProjectDir(): void;
}
export { ParliamentConfig, defaultConfig } from './schema.js';
//# sourceMappingURL=index.d.ts.map