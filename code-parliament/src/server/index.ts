/**
 * Code Parliament - Production Server
 *
 * Unified entry point for Railway deployment.
 * Combines API server, SSE MCP endpoint, and dashboard.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import { AuthService } from '../auth/service.js';
import { UsageService } from '../billing/usage.js';
import { AnalyzerService, PROVIDERS, ProviderConfig } from './analyzer-service.js';
import { getStripeService, PLANS, PlanType } from '../billing/stripe.js';
import { getCache, userCache } from '../cache/redis.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = logger.child('server');

const app = express();
const PORT = parseInt(process.env.PORT || '3377', 10);

// Services
const authService = new AuthService(process.env.JWT_SECRET || 'parliament-secret-change-me');
const usageService = new UsageService();
const stripeService = getStripeService();

// Default provider config
const defaultProvider: ProviderConfig = {
  baseUrl: process.env.LLM_BASE_URL || PROVIDERS.openrouter.baseUrl,
  apiKey: process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || '',
  models: PROVIDERS.openrouter.models,
};

const analyzerService = new AnalyzerService(defaultProvider);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: 'application/json', limit: '10mb' }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    log.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// Auth middleware
const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  // Support both Bearer token and API key
  const token = authHeader.replace('Bearer ', '');

  // Check if it's an API key
  if (token.startsWith('pk_')) {
    const user = await authService.validateApiKey(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    (req as any).user = user;
    return next();
  }

  // Otherwise validate as JWT
  const decoded = authService.verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const user = await authService.getUser(decoded.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  (req as any).user = user;
  next();
};

// ============ Health & Static ============

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    redis: getCache().isConnected(),
  });
});

// Serve static files
app.use(express.static(join(__dirname, '..', 'dashboard', 'public')));

// ============ Auth Routes ============

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, plan = 'free' } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await authService.signup(email, password, plan as PlanType);

    // If paid plan, create Stripe checkout
    let checkoutUrl: string | undefined;
    if (plan !== 'free') {
      const customerId = await stripeService.createCustomer(result.userId, email);
      checkoutUrl = await stripeService.createCheckoutSession(customerId, plan as PlanType);
    }

    res.json({
      token: result.token,
      userId: result.userId,
      apiKey: result.apiKey,
      checkoutUrl,
    });
  } catch (error: any) {
    log.error('Signup error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await authService.login(email, password);
    res.json(result);
  } catch (error: any) {
    log.error('Login error:', error);
    res.status(401).json({ error: error.message });
  }
});

// ============ User Routes ============

app.get('/api/me', authenticate, async (req, res) => {
  const user = (req as any).user;
  res.json({
    id: user.id,
    email: user.email,
    plan: user.plan,
    apiKey: user.apiKey,
    createdAt: user.createdAt,
  });
});

app.post('/api/regenerate-key', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const newKey = await authService.regenerateApiKey(user.id);
    res.json({ apiKey: newKey });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/usage', authenticate, async (req, res) => {
  const user = (req as any).user;
  const usage = await usageService.getUsage(user.id);
  const planLimits = stripeService.getPlanLimits(user.plan);

  res.json({
    filesAnalyzed: usage.filesAnalyzed,
    apiCalls: usage.analysisCount,
    limit: planLimits.filesPerMonth,
    remaining: stripeService.getRemainingFiles(user.plan, usage.analysisCount),
    plan: user.plan,
  });
});

// ============ Analysis Routes (MCP endpoints) ============

app.get('/api/status', authenticate, async (req, res) => {
  const user = (req as any).user;
  const status = await analyzerService.getStatus(user.id);
  res.json(status);
});

app.get('/api/verdicts', authenticate, async (req, res) => {
  const user = (req as any).user;
  const verdicts = await userCache.getAllVerdicts(user.id);
  res.json(Object.values(verdicts));
});

app.get('/api/verdicts/:path(*)', authenticate, async (req, res) => {
  const user = (req as any).user;
  const filePath = req.params.path;
  const verdict = await analyzerService.getVerdict(user.id, filePath);

  if (!verdict) {
    return res.status(404).json({ error: 'Verdict not found' });
  }

  res.json(verdict);
});

app.post('/api/analyze', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { files } = req.body;

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Files array required' });
    }

    // Check usage limits
    const usage = await usageService.getUsage(user.id);
    if (!stripeService.canAnalyzeFiles(user.plan, usage.analysisCount)) {
      return res.status(402).json({
        error: 'Monthly limit reached',
        limit: stripeService.getPlanLimits(user.plan).filesPerMonth,
        used: usage.analysisCount,
      });
    }

    // Analyze files
    const results = await analyzerService.analyzeFiles(user.id, files);

    // Track usage
    await usageService.trackUsage(user.id, {
      analysisCount: files.length,
      tokenCount: results.reduce((sum, r) => sum + r.tokenUsage.input + r.tokenUsage.output, 0),
    });

    // Cache results
    for (const result of results) {
      await userCache.setVerdict(user.id, result.file, result);
    }

    res.json(results);
  } catch (error: any) {
    log.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/config', authenticate, async (req, res) => {
  const user = (req as any).user;
  const config = await analyzerService.getConfig(user.id);
  res.json(config);
});

app.post('/api/config', authenticate, async (req, res) => {
  try {
    const { baseUrl, model, targetScore, weights } = req.body;
    // Update user-specific config (stored in cache)
    const user = (req as any).user;
    await getCache().set(`config:${user.id}`, { baseUrl, model, targetScore, weights });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SSE MCP Endpoint ============

interface SSEClient {
  id: string;
  userId: string;
  res: Response;
  lastActivity: number;
}

const sseClients = new Map<string, SSEClient>();

app.get('/mcp/sse', authenticate, (req, res) => {
  const user = (req as any).user;
  const clientId = randomUUID();

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Store client
  sseClients.set(clientId, {
    id: clientId,
    userId: user.id,
    res,
    lastActivity: Date.now(),
  });

  // Send connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  // Keepalive
  const keepalive = setInterval(() => {
    res.write(`: keepalive\n\n`);
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(keepalive);
    sseClients.delete(clientId);
    log.info(`SSE client ${clientId} disconnected`);
  });
});

app.post('/mcp/message', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { method, params, id } = req.body;

    let result: unknown;

    switch (method) {
      case 'tools/list':
        result = {
          tools: [
            {
              name: 'parliament_status',
              description: 'Get overall project code quality status and priority fixes',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              name: 'parliament_verdict',
              description: 'Get detailed verdict for a specific file',
              inputSchema: {
                type: 'object',
                properties: { path: { type: 'string' } },
                required: ['path'],
              },
            },
            {
              name: 'parliament_analyze',
              description: 'Analyze files and get verdicts',
              inputSchema: {
                type: 'object',
                properties: {
                  files: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        path: { type: 'string' },
                        content: { type: 'string' },
                      },
                      required: ['path', 'content'],
                    },
                  },
                },
                required: ['files'],
              },
            },
            {
              name: 'parliament_config',
              description: 'Get or update configuration',
              inputSchema: {
                type: 'object',
                properties: {
                  set: {
                    type: 'object',
                    properties: {
                      targetScore: { type: 'number' },
                      weights: { type: 'object' },
                    },
                  },
                },
              },
            },
          ],
        };
        break;

      case 'tools/call':
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        switch (toolName) {
          case 'parliament_status':
            result = await analyzerService.getStatus(user.id);
            break;

          case 'parliament_verdict':
            result = await analyzerService.getVerdict(user.id, toolArgs.path);
            break;

          case 'parliament_analyze':
            // Check limits
            const usage = await usageService.getUsage(user.id);
            if (!stripeService.canAnalyzeFiles(user.plan, usage.analysisCount)) {
              result = { error: 'Monthly limit reached', upgrade: true };
            } else {
              const results = await analyzerService.analyzeFiles(user.id, toolArgs.files);
              await usageService.trackUsage(user.id, {
                analysisCount: toolArgs.files.length,
                tokenCount: results.reduce((sum: number, r: any) => sum + r.tokenUsage.input + r.tokenUsage.output, 0),
              });
              for (const r of results) {
                await userCache.setVerdict(user.id, r.file, r);
              }
              result = results;
            }
            break;

          case 'parliament_config':
            if (toolArgs.set) {
              await getCache().set(`config:${user.id}`, toolArgs.set);
              result = { success: true };
            } else {
              result = await analyzerService.getConfig(user.id);
            }
            break;

          default:
            result = { error: `Unknown tool: ${toolName}` };
        }
        break;

      default:
        result = { error: `Unknown method: ${method}` };
    }

    res.json({ jsonrpc: '2.0', id, result });
  } catch (error: any) {
    log.error('MCP error:', error);
    res.json({ jsonrpc: '2.0', id: req.body?.id, error: { code: -1, message: error.message } });
  }
});

// ============ Stripe Webhooks ============

app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    log.warn('Stripe webhook secret not configured');
    return res.status(400).json({ error: 'Webhook not configured' });
  }

  try {
    const result = await stripeService.handleWebhook(req.body.toString(), sig, webhookSecret);

    switch (result.event) {
      case 'checkout_completed':
        // Update user plan
        const checkoutData = result.data as { customerId: string; subscriptionId: string; plan: PlanType };
        // In production, update user in database
        log.info(`Checkout completed for plan ${checkoutData.plan}`);
        break;

      case 'subscription_cancelled':
        // Downgrade to free
        log.info('Subscription cancelled, downgrading to free');
        break;

      case 'payment_failed':
        log.warn('Payment failed');
        break;
    }

    res.json({ received: true });
  } catch (error: any) {
    log.error('Webhook error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============ Billing Routes ============

app.post('/api/billing/portal', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account' });
    }
    const url = await stripeService.createPortalSession(user.stripeCustomerId);
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/billing/upgrade', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { plan } = req.body;

    if (!PLANS[plan as PlanType] || plan === 'free') {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      customerId = await stripeService.createCustomer(user.id, user.email);
      // In production, save customerId to user record
    }

    const url = await stripeService.createCheckoutSession(customerId, plan as PlanType);
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SPA Fallback ============

app.get('/login', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dashboard', 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dashboard', 'public', 'signup.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dashboard', 'public', 'dashboard.html'));
});

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dashboard', 'public', 'index.html'));
});

// ============ Start Server ============

app.listen(PORT, () => {
  log.info(`Code Parliament server running on port ${PORT}`);
  log.info(`Dashboard: http://localhost:${PORT}`);
  log.info(`MCP SSE: http://localhost:${PORT}/mcp/sse`);
  log.info(`API: http://localhost:${PORT}/api`);
});

export { app };
