/**
 * Hosted MCP Server for SaaS deployment
 *
 * Users connect via SSE (Server-Sent Events) transport
 * instead of running locally via stdio.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { AuthService } from '../auth/service.js';
import { UsageTracker } from '../billing/usage.js';
import { AnalyzerService, ProviderConfig, PROVIDERS } from './analyzer-service.js';
import { logger } from '../utils/logger.js';

const log = logger.child('hosted-server');

export interface HostedServerConfig {
  port: number;
  apiKey: string;
  baseUrl?: string;
  models?: { architect: string; critic: string; pragmatist: string };
  stripeSecretKey?: string;
}

export function createHostedServer(config: HostedServerConfig): Express {
  const app = express();
  const auth = new AuthService();
  const usage = new UsageTracker();

  const providerConfig: ProviderConfig = {
    baseUrl: config.baseUrl || PROVIDERS.openrouter.baseUrl,
    apiKey: config.apiKey,
    models: config.models || PROVIDERS.openrouter.models,
  };
  const analyzer = new AnalyzerService(providerConfig);

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Auth middleware
  const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const apiKey = authHeader.slice(7);
    const user = await auth.validateApiKey(apiKey);

    if (!user) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    // Check if user has active subscription
    if (!user.isActive) {
      res.status(403).json({ error: 'Subscription inactive. Please update billing.' });
      return;
    }

    // Check usage limits
    const withinLimits = await usage.checkLimits(user.id, user.plan);
    if (!withinLimits) {
      res.status(429).json({ error: 'Usage limit exceeded for current plan.' });
      return;
    }

    (req as any).user = user;
    next();
  };

  // MCP SSE endpoint - main connection point for Claude Code
  app.get('/mcp', authenticate, (req: Request, res: Response) => {
    const user = (req as any).user;
    log.info(`SSE connection from user: ${user.id}`);

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', userId: user.id })}\n\n`);

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
      log.info(`SSE connection closed for user: ${user.id}`);
    });
  });

  // MCP tool call endpoint
  app.post('/mcp/tools/:toolName', authenticate, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { toolName } = req.params;
    const args = req.body;

    log.info(`Tool call: ${toolName} from user: ${user.id}`);

    try {
      let result: any;

      switch (toolName) {
        case 'parliament_status':
          result = await analyzer.getStatus(user.id);
          break;

        case 'parliament_analyze':
          const { files } = args;
          if (!files || !Array.isArray(files)) {
            res.status(400).json({ error: 'files array required' });
            return;
          }

          // Track usage
          await usage.recordAnalysis(user.id, files.length);

          result = await analyzer.analyzeFiles(user.id, files);
          break;

        case 'parliament_verdict':
          const { file } = args;
          if (!file) {
            res.status(400).json({ error: 'file path required' });
            return;
          }
          result = await analyzer.getVerdict(user.id, file);
          break;

        case 'parliament_config':
          result = await analyzer.getConfig(user.id);
          break;

        default:
          res.status(404).json({ error: `Unknown tool: ${toolName}` });
          return;
      }

      res.json(result);
    } catch (error) {
      log.error(`Tool error: ${toolName}`, error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal error'
      });
    }
  });

  // Direct analysis endpoint (simpler than MCP for some use cases)
  app.post('/api/analyze', authenticate, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { files } = req.body;

    if (!files || !Array.isArray(files)) {
      res.status(400).json({ error: 'files array required' });
      return;
    }

    try {
      await usage.recordAnalysis(user.id, files.length);
      const result = await analyzer.analyzeFiles(user.id, files);
      res.json(result);
    } catch (error) {
      log.error('Analysis error', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Analysis failed'
      });
    }
  });

  // Usage endpoint
  app.get('/api/usage', authenticate, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const usageData = await usage.getUsage(user.id);
    res.json(usageData);
  });

  return app;
}

export function startHostedServer(config: HostedServerConfig): void {
  const app = createHostedServer(config);

  app.listen(config.port, () => {
    log.info(`Hosted MCP server running on port ${config.port}`);
    log.info(`Users connect to: https://yourdomain.com/mcp`);
  });
}
