import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { ConfigSchema, ParliamentConfig, defaultConfig } from './schema.js';

const CONFIG_DIR = join(homedir(), '.parliament');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export class ConfigManager {
  private config: ParliamentConfig;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.config = this.loadConfig();
  }

  private loadConfig(): ParliamentConfig {
    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Check for project-level config first
    const projectConfig = join(this.projectPath, '.parliament', 'config.json');

    let fileConfig: Partial<ParliamentConfig> = {};

    if (existsSync(projectConfig)) {
      try {
        fileConfig = JSON.parse(readFileSync(projectConfig, 'utf-8'));
      } catch (e) {
        console.warn('Invalid project config, using defaults');
      }
    } else if (existsSync(CONFIG_FILE)) {
      try {
        fileConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      } catch (e) {
        console.warn('Invalid global config, using defaults');
      }
    }

    // Merge with defaults and validate
    const merged = this.deepMerge(defaultConfig, fileConfig);

    // Override API key from environment if present
    if (process.env.ANTHROPIC_API_KEY) {
      merged.api.apiKey = process.env.ANTHROPIC_API_KEY;
    }

    // Override base URL from environment if present
    if (process.env.ANTHROPIC_BASE_URL) {
      merged.api.baseUrl = process.env.ANTHROPIC_BASE_URL;
    }

    const result = ConfigSchema.safeParse(merged);
    if (!result.success) {
      console.warn('Config validation failed, using defaults:', result.error.issues);
      return defaultConfig;
    }

    return result.data;
  }

  private deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      if (source[key] !== undefined) {
        if (
          typeof source[key] === 'object' &&
          source[key] !== null &&
          !Array.isArray(source[key])
        ) {
          result[key] = this.deepMerge(
            target[key] as Record<string, any>,
            source[key] as Record<string, any>
          ) as T[Extract<keyof T, string>];
        } else {
          result[key] = source[key] as T[Extract<keyof T, string>];
        }
      }
    }

    return result;
  }

  get(): ParliamentConfig {
    return this.config;
  }

  update(updates: Partial<ParliamentConfig>): ParliamentConfig {
    this.config = this.deepMerge(this.config, updates);
    this.save();
    return this.config;
  }

  updateApi(baseUrl?: string, model?: string, apiKey?: string): ParliamentConfig {
    if (baseUrl) this.config.api.baseUrl = baseUrl;
    if (model) this.config.api.model = model;
    if (apiKey) this.config.api.apiKey = apiKey;
    this.save();
    return this.config;
  }

  private save(): void {
    // Save to project config if project .parliament dir exists
    const projectConfigDir = join(this.projectPath, '.parliament');
    const projectConfig = join(projectConfigDir, 'config.json');

    if (existsSync(projectConfigDir)) {
      writeFileSync(projectConfig, JSON.stringify(this.config, null, 2));
    } else {
      // Save to global config
      writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    }
  }

  getProjectPath(): string {
    return this.projectPath;
  }

  getAlertsFile(): string {
    return join(CONFIG_DIR, 'alerts.json');
  }

  getDbPath(): string {
    return join(this.projectPath, '.parliament', 'verdicts.db');
  }

  ensureProjectDir(): void {
    const dir = join(this.projectPath, '.parliament');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export { ParliamentConfig, defaultConfig } from './schema.js';
