import { z } from 'zod';
export declare const ConfigSchema: z.ZodObject<{
    api: z.ZodObject<{
        baseUrl: z.ZodDefault<z.ZodString>;
        apiKey: z.ZodString;
        model: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        baseUrl: string;
        apiKey: string;
        model: string;
    }, {
        apiKey: string;
        baseUrl?: string | undefined;
        model?: string | undefined;
    }>;
    analysis: z.ZodObject<{
        targetScore: z.ZodDefault<z.ZodNumber>;
        maxIterationsPerFile: z.ZodDefault<z.ZodNumber>;
        maxIterationsPerSession: z.ZodDefault<z.ZodNumber>;
        debounceMs: z.ZodDefault<z.ZodNumber>;
        concurrency: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        targetScore: number;
        maxIterationsPerFile: number;
        maxIterationsPerSession: number;
        debounceMs: number;
        concurrency: number;
    }, {
        targetScore?: number | undefined;
        maxIterationsPerFile?: number | undefined;
        maxIterationsPerSession?: number | undefined;
        debounceMs?: number | undefined;
        concurrency?: number | undefined;
    }>;
    limits: z.ZodObject<{
        dailyCostLimit: z.ZodDefault<z.ZodNumber>;
        maxFileSizeKb: z.ZodDefault<z.ZodNumber>;
        maxFilesPerScan: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        dailyCostLimit: number;
        maxFileSizeKb: number;
        maxFilesPerScan: number;
    }, {
        dailyCostLimit?: number | undefined;
        maxFileSizeKb?: number | undefined;
        maxFilesPerScan?: number | undefined;
    }>;
    exclude: z.ZodObject<{
        patterns: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        extensions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        patterns: string[];
        extensions: string[];
    }, {
        patterns?: string[] | undefined;
        extensions?: string[] | undefined;
    }>;
    weights: z.ZodObject<{
        architect: z.ZodDefault<z.ZodNumber>;
        critic: z.ZodDefault<z.ZodNumber>;
        pragmatist: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        architect: number;
        critic: number;
        pragmatist: number;
    }, {
        architect?: number | undefined;
        critic?: number | undefined;
        pragmatist?: number | undefined;
    }>;
    dashboard: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        port: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        port: number;
    }, {
        enabled?: boolean | undefined;
        port?: number | undefined;
    }>;
    safeguards: z.ZodObject<{
        minConfidenceToSurface: z.ZodDefault<z.ZodNumber>;
        requireTestsPass: z.ZodDefault<z.ZodBoolean>;
        allowUserOverride: z.ZodDefault<z.ZodBoolean>;
        deadlockResolution: z.ZodDefault<z.ZodEnum<["architect", "critic", "pragmatist"]>>;
    }, "strip", z.ZodTypeAny, {
        minConfidenceToSurface: number;
        requireTestsPass: boolean;
        allowUserOverride: boolean;
        deadlockResolution: "architect" | "critic" | "pragmatist";
    }, {
        minConfidenceToSurface?: number | undefined;
        requireTestsPass?: boolean | undefined;
        allowUserOverride?: boolean | undefined;
        deadlockResolution?: "architect" | "critic" | "pragmatist" | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    api: {
        baseUrl: string;
        apiKey: string;
        model: string;
    };
    analysis: {
        targetScore: number;
        maxIterationsPerFile: number;
        maxIterationsPerSession: number;
        debounceMs: number;
        concurrency: number;
    };
    limits: {
        dailyCostLimit: number;
        maxFileSizeKb: number;
        maxFilesPerScan: number;
    };
    exclude: {
        patterns: string[];
        extensions: string[];
    };
    weights: {
        architect: number;
        critic: number;
        pragmatist: number;
    };
    dashboard: {
        enabled: boolean;
        port: number;
    };
    safeguards: {
        minConfidenceToSurface: number;
        requireTestsPass: boolean;
        allowUserOverride: boolean;
        deadlockResolution: "architect" | "critic" | "pragmatist";
    };
}, {
    api: {
        apiKey: string;
        baseUrl?: string | undefined;
        model?: string | undefined;
    };
    analysis: {
        targetScore?: number | undefined;
        maxIterationsPerFile?: number | undefined;
        maxIterationsPerSession?: number | undefined;
        debounceMs?: number | undefined;
        concurrency?: number | undefined;
    };
    limits: {
        dailyCostLimit?: number | undefined;
        maxFileSizeKb?: number | undefined;
        maxFilesPerScan?: number | undefined;
    };
    exclude: {
        patterns?: string[] | undefined;
        extensions?: string[] | undefined;
    };
    weights: {
        architect?: number | undefined;
        critic?: number | undefined;
        pragmatist?: number | undefined;
    };
    dashboard: {
        enabled?: boolean | undefined;
        port?: number | undefined;
    };
    safeguards: {
        minConfidenceToSurface?: number | undefined;
        requireTestsPass?: boolean | undefined;
        allowUserOverride?: boolean | undefined;
        deadlockResolution?: "architect" | "critic" | "pragmatist" | undefined;
    };
}>;
export type ParliamentConfig = z.infer<typeof ConfigSchema>;
export declare const defaultConfig: ParliamentConfig;
//# sourceMappingURL=schema.d.ts.map