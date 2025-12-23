import { z } from 'zod';
export const ConfigSchema = z.object({
    api: z.object({
        baseUrl: z.string().url().default('https://api.anthropic.com'),
        apiKey: z.string().min(1),
        model: z.string().default('claude-sonnet-4-20250514'),
    }),
    analysis: z.object({
        targetScore: z.number().min(0).max(100).default(95),
        maxIterationsPerFile: z.number().min(1).max(10).default(3),
        maxIterationsPerSession: z.number().min(1).max(50).default(10),
        debounceMs: z.number().min(100).max(10000).default(2000),
        concurrency: z.number().min(1).max(10).default(3),
    }),
    limits: z.object({
        dailyCostLimit: z.number().min(0).default(5.0),
        maxFileSizeKb: z.number().min(1).default(100),
        maxFilesPerScan: z.number().min(1).default(50),
    }),
    exclude: z.object({
        patterns: z.array(z.string()).default([
            'node_modules/**',
            '.git/**',
            'dist/**',
            'build/**',
            '*.min.js',
            '*.min.css',
            '*.map',
            '*.lock',
            'package-lock.json',
            'yarn.lock',
            'pnpm-lock.yaml',
            '.parliament/**',
            'coverage/**',
        ]),
        extensions: z.array(z.string()).default([]),
    }),
    weights: z.object({
        architect: z.number().min(0).max(2).default(1.0),
        critic: z.number().min(0).max(2).default(1.2),
        pragmatist: z.number().min(0).max(2).default(0.8),
    }),
    dashboard: z.object({
        enabled: z.boolean().default(true),
        port: z.number().min(1024).max(65535).default(3377),
    }),
    safeguards: z.object({
        minConfidenceToSurface: z.number().min(0).max(1).default(0.7),
        requireTestsPass: z.boolean().default(false),
        allowUserOverride: z.boolean().default(true),
        deadlockResolution: z.enum(['architect', 'critic', 'pragmatist']).default('pragmatist'),
    }),
});
export const defaultConfig = {
    api: {
        baseUrl: 'https://api.anthropic.com',
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-sonnet-4-20250514',
    },
    analysis: {
        targetScore: 95,
        maxIterationsPerFile: 3,
        maxIterationsPerSession: 10,
        debounceMs: 2000,
        concurrency: 3,
    },
    limits: {
        dailyCostLimit: 5.0,
        maxFileSizeKb: 100,
        maxFilesPerScan: 50,
    },
    exclude: {
        patterns: [
            'node_modules/**',
            '.git/**',
            'dist/**',
            'build/**',
            '*.min.js',
            '*.min.css',
            '*.map',
            '*.lock',
            'package-lock.json',
            'yarn.lock',
            'pnpm-lock.yaml',
            '.parliament/**',
            'coverage/**',
        ],
        extensions: [],
    },
    weights: {
        architect: 1.0,
        critic: 1.2,
        pragmatist: 0.8,
    },
    dashboard: {
        enabled: true,
        port: 3377,
    },
    safeguards: {
        minConfidenceToSurface: 0.7,
        requireTestsPass: false,
        allowUserOverride: true,
        deadlockResolution: 'pragmatist',
    },
};
//# sourceMappingURL=schema.js.map