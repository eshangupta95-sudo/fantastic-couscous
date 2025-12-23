import { z } from 'zod';
// Tool input schemas
export const StatusInputSchema = z.object({});
export const VerdictInputSchema = z.object({
    file: z.string().describe('Path to the file to get verdict for'),
});
export const DebateInputSchema = z.object({
    topic: z.string().describe('Topic or file to debate'),
    files: z.array(z.string()).optional().describe('Optional specific files to include'),
});
export const IgnoreInputSchema = z.object({
    file: z.string().describe('Path to the file'),
    rule: z.string().describe('Rule or issue ID to ignore'),
    reason: z.string().describe('Reason for ignoring'),
});
export const ConfigInputSchema = z.object({
    baseUrl: z.string().url().optional().describe('API base URL'),
    model: z.string().optional().describe('Model to use'),
    apiKey: z.string().optional().describe('API key'),
    targetScore: z.number().min(0).max(100).optional().describe('Target satisfaction score'),
});
// Tool handlers
export function createToolHandlers(daemon) {
    const cache = daemon.getCache();
    return {
        parliament_status: async () => {
            const health = cache.getProjectHealth();
            const alerts = cache.getAlerts();
            return {
                approved: health.targetMet,
                score: health.overall,
                target: health.target,
                filesAnalyzed: health.filesAnalyzed,
                filesAboveTarget: health.filesAboveTarget,
                filesBelowTarget: health.filesBelowTarget,
                priorityFixes: health.criticalFiles.map((f) => ({
                    file: f.path,
                    score: f.score,
                    topIssue: f.topIssue,
                })),
                pendingAlerts: alerts.length,
                lastUpdated: health.lastUpdated,
            };
        },
        parliament_verdict: async (input) => {
            const verdict = cache.getVerdict(input.file);
            if (!verdict) {
                return {
                    file: input.file,
                    found: false,
                };
            }
            return {
                file: input.file,
                found: true,
                scores: {
                    architect: verdict.architect.score,
                    critic: verdict.critic.score,
                    pragmatist: verdict.pragmatist.score,
                    final: verdict.finalScore,
                },
                reasoning: {
                    architect: verdict.architect.reasoning,
                    critic: verdict.critic.reasoning,
                    pragmatist: verdict.pragmatist.reasoning,
                },
                issues: [
                    ...verdict.architect.issues,
                    ...verdict.critic.issues,
                    ...verdict.pragmatist.issues,
                ].slice(0, 10).map((i) => ({
                    severity: i.severity,
                    category: i.category,
                    description: i.description,
                    suggestion: i.suggestion,
                })),
                suggestions: verdict.suggestions,
                verdict: verdict.finalVerdict,
            };
        },
        parliament_debate: async (input) => {
            const debates = cache.getDebates(input.files?.[0], 1);
            if (debates.length === 0) {
                // No existing debate, generate a summary
                return {
                    topic: input.topic,
                    transcript: [
                        {
                            agent: 'system',
                            message: 'No debates recorded yet. Debates are generated during analysis.',
                        },
                    ],
                    resolution: 'No resolution available',
                    finalScore: 0,
                };
            }
            const debate = debates[0];
            return {
                topic: debate.topic || input.topic,
                transcript: debate.transcript.map((t) => ({
                    agent: t.agent,
                    message: t.message,
                })),
                resolution: debate.resolution,
                finalScore: 0, // Would need to look up the verdict
            };
        },
        parliament_ignore: async (input) => {
            cache.addIgnore(input.file, input.rule, input.reason);
            return { acknowledged: true };
        },
        parliament_config: async (input) => {
            const updates = {};
            if (input.baseUrl || input.model || input.apiKey) {
                updates.api = {};
                if (input.baseUrl)
                    updates.api.baseUrl = input.baseUrl;
                if (input.model)
                    updates.api.model = input.model;
                if (input.apiKey)
                    updates.api.apiKey = input.apiKey;
            }
            if (input.targetScore !== undefined) {
                updates.analysis = { targetScore: input.targetScore };
            }
            const hasUpdates = Object.keys(updates).length > 0;
            if (hasUpdates) {
                daemon.updateConfig(updates);
            }
            const config = daemon.getConfig();
            return {
                updated: hasUpdates,
                config: {
                    baseUrl: config.api.baseUrl,
                    model: config.api.model,
                    targetScore: config.analysis.targetScore,
                    hasApiKey: !!config.api.apiKey,
                },
            };
        },
        parliament_alerts: async () => {
            const alerts = cache.getAlerts();
            cache.clearAlerts();
            return { alerts, cleared: true };
        },
    };
}
// Tool definitions for MCP
export const toolDefinitions = [
    {
        name: 'parliament_status',
        description: `Check Parliament approval status and project health.

IMPORTANT: After writing or modifying code files, you may receive Parliament alerts.
When you see alerts or the score is below target:
1. Review the priority fixes
2. Apply fixes to lowest-scoring files first
3. Re-check status after fixes
4. Repeat until score >= 95% or user says stop

Always inform user of current Parliament score.`,
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        name: 'parliament_verdict',
        description: 'Get the Parliament verdict for a specific file, including scores from all three agents and their reasoning.',
        inputSchema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    description: 'Path to the file to get verdict for',
                },
            },
            required: ['file'],
        },
    },
    {
        name: 'parliament_debate',
        description: 'View the debate transcript between agents for a file or topic.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: {
                    type: 'string',
                    description: 'Topic or file to debate',
                },
                files: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional specific files to include',
                },
            },
            required: ['topic'],
        },
    },
    {
        name: 'parliament_ignore',
        description: 'Ignore a specific rule or issue for a file.',
        inputSchema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    description: 'Path to the file',
                },
                rule: {
                    type: 'string',
                    description: 'Rule or issue ID to ignore',
                },
                reason: {
                    type: 'string',
                    description: 'Reason for ignoring',
                },
            },
            required: ['file', 'rule', 'reason'],
        },
    },
    {
        name: 'parliament_config',
        description: 'View or update Parliament configuration including API base URL, model, and target score.',
        inputSchema: {
            type: 'object',
            properties: {
                baseUrl: {
                    type: 'string',
                    description: 'API base URL (e.g., https://api.anthropic.com)',
                },
                model: {
                    type: 'string',
                    description: 'Model to use (e.g., claude-sonnet-4-20250514)',
                },
                apiKey: {
                    type: 'string',
                    description: 'API key',
                },
                targetScore: {
                    type: 'number',
                    description: 'Target satisfaction score (0-100)',
                },
            },
            required: [],
        },
    },
    {
        name: 'parliament_alerts',
        description: 'Get and clear pending Parliament alerts.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
];
//# sourceMappingURL=tools.js.map