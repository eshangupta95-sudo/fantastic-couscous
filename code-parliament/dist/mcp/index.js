import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { createToolHandlers, toolDefinitions } from './tools.js';
import { logger } from '../utils/logger.js';
const log = logger.child('mcp');
export async function startMCPServer(daemon) {
    const server = new Server({
        name: 'code-parliament',
        version: '1.0.0',
    }, {
        capabilities: {
            tools: {},
            resources: {},
        },
    });
    const handlers = createToolHandlers(daemon);
    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: toolDefinitions,
        };
    });
    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        log.debug(`Tool call: ${name}`, args);
        try {
            let result;
            switch (name) {
                case 'parliament_status':
                    result = await handlers.parliament_status();
                    break;
                case 'parliament_verdict':
                    result = await handlers.parliament_verdict(args);
                    break;
                case 'parliament_debate':
                    result = await handlers.parliament_debate(args);
                    break;
                case 'parliament_ignore':
                    result = await handlers.parliament_ignore(args);
                    break;
                case 'parliament_config':
                    result = await handlers.parliament_config(args);
                    break;
                case 'parliament_alerts':
                    result = await handlers.parliament_alerts();
                    break;
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            log.error(`Tool error: ${name}`, error);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: true,
                            message: error instanceof Error ? error.message : 'Unknown error',
                        }),
                    },
                ],
                isError: true,
            };
        }
    });
    // List available resources
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
            resources: [
                {
                    uri: 'parliament://health',
                    name: 'Project Health',
                    description: 'Current project health and scores',
                    mimeType: 'application/json',
                },
                {
                    uri: 'parliament://config',
                    name: 'Configuration',
                    description: 'Current Parliament configuration',
                    mimeType: 'application/json',
                },
                {
                    uri: 'parliament://alerts',
                    name: 'Pending Alerts',
                    description: 'Pending code review alerts',
                    mimeType: 'application/json',
                },
            ],
        };
    });
    // Read resources
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;
        const cache = daemon.getCache();
        let content;
        switch (uri) {
            case 'parliament://health':
                content = cache.getProjectHealth();
                break;
            case 'parliament://config':
                const config = daemon.getConfig();
                content = {
                    baseUrl: config.api.baseUrl,
                    model: config.api.model,
                    targetScore: config.analysis.targetScore,
                    weights: config.weights,
                };
                break;
            case 'parliament://alerts':
                content = cache.getAlerts();
                break;
            default:
                throw new Error(`Unknown resource: ${uri}`);
        }
        return {
            contents: [
                {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify(content, null, 2),
                },
            ],
        };
    });
    // Connect via stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log.info('MCP server started');
}
export * from './tools.js';
//# sourceMappingURL=index.js.map