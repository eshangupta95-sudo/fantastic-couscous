import { z } from 'zod';
import { Alert } from '../cache/index.js';
import { ParliamentDaemon } from '../daemon/index.js';
export declare const StatusInputSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare const VerdictInputSchema: z.ZodObject<{
    file: z.ZodString;
}, "strip", z.ZodTypeAny, {
    file: string;
}, {
    file: string;
}>;
export declare const DebateInputSchema: z.ZodObject<{
    topic: z.ZodString;
    files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    topic: string;
    files?: string[] | undefined;
}, {
    topic: string;
    files?: string[] | undefined;
}>;
export declare const IgnoreInputSchema: z.ZodObject<{
    file: z.ZodString;
    rule: z.ZodString;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    file: string;
    rule: string;
    reason: string;
}, {
    file: string;
    rule: string;
    reason: string;
}>;
export declare const ConfigInputSchema: z.ZodObject<{
    baseUrl: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    targetScore: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    model?: string | undefined;
    targetScore?: number | undefined;
}, {
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    model?: string | undefined;
    targetScore?: number | undefined;
}>;
export interface StatusResponse {
    approved: boolean;
    score: number;
    target: number;
    filesAnalyzed: number;
    filesAboveTarget: number;
    filesBelowTarget: number;
    priorityFixes: Array<{
        file: string;
        score: number;
        topIssue: string;
        suggestion?: string;
    }>;
    pendingAlerts: number;
    lastUpdated: string;
}
export interface VerdictResponse {
    file: string;
    found: boolean;
    scores?: {
        architect: number;
        critic: number;
        pragmatist: number;
        final: number;
    };
    reasoning?: {
        architect: string;
        critic: string;
        pragmatist: string;
    };
    issues?: Array<{
        severity: string;
        category: string;
        description: string;
        suggestion?: string;
    }>;
    suggestions?: string[];
    verdict?: string;
}
export interface DebateResponse {
    topic: string;
    transcript: Array<{
        agent: string;
        message: string;
    }>;
    resolution: string;
    finalScore: number;
}
export interface ConfigResponse {
    updated: boolean;
    config: {
        baseUrl: string;
        model: string;
        targetScore: number;
        hasApiKey: boolean;
    };
}
export declare function createToolHandlers(daemon: ParliamentDaemon): {
    parliament_status: () => Promise<StatusResponse>;
    parliament_verdict: (input: z.infer<typeof VerdictInputSchema>) => Promise<VerdictResponse>;
    parliament_debate: (input: z.infer<typeof DebateInputSchema>) => Promise<DebateResponse>;
    parliament_ignore: (input: z.infer<typeof IgnoreInputSchema>) => Promise<{
        acknowledged: boolean;
    }>;
    parliament_config: (input: z.infer<typeof ConfigInputSchema>) => Promise<ConfigResponse>;
    parliament_alerts: () => Promise<{
        alerts: Alert[];
        cleared: boolean;
    }>;
};
export declare const toolDefinitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            file?: undefined;
            topic?: undefined;
            files?: undefined;
            rule?: undefined;
            reason?: undefined;
            baseUrl?: undefined;
            model?: undefined;
            apiKey?: undefined;
            targetScore?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            file: {
                type: string;
                description: string;
            };
            topic?: undefined;
            files?: undefined;
            rule?: undefined;
            reason?: undefined;
            baseUrl?: undefined;
            model?: undefined;
            apiKey?: undefined;
            targetScore?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            topic: {
                type: string;
                description: string;
            };
            files: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            file?: undefined;
            rule?: undefined;
            reason?: undefined;
            baseUrl?: undefined;
            model?: undefined;
            apiKey?: undefined;
            targetScore?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            file: {
                type: string;
                description: string;
            };
            rule: {
                type: string;
                description: string;
            };
            reason: {
                type: string;
                description: string;
            };
            topic?: undefined;
            files?: undefined;
            baseUrl?: undefined;
            model?: undefined;
            apiKey?: undefined;
            targetScore?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            baseUrl: {
                type: string;
                description: string;
            };
            model: {
                type: string;
                description: string;
            };
            apiKey: {
                type: string;
                description: string;
            };
            targetScore: {
                type: string;
                description: string;
            };
            file?: undefined;
            topic?: undefined;
            files?: undefined;
            rule?: undefined;
            reason?: undefined;
        };
        required: never[];
    };
})[];
//# sourceMappingURL=tools.d.ts.map