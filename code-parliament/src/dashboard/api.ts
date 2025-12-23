import { Router, Request, Response } from 'express';
import { ParliamentDaemon } from '../daemon/index.js';

export function createApiRouter(daemon: ParliamentDaemon): Router {
  const router = Router();
  const cache = daemon.getCache();

  // Health check
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      running: daemon.isRunning(),
      timestamp: new Date().toISOString(),
    });
  });

  // Project status
  router.get('/status', (req: Request, res: Response) => {
    const health = cache.getProjectHealth();
    const stats = daemon.getStats();
    res.json({
      ...health,
      ...stats,
    });
  });

  // All verdicts
  router.get('/verdicts', (req: Request, res: Response) => {
    const verdicts = cache.getAllVerdicts();
    res.json(
      verdicts.map((v) => ({
        file: v.filePath,
        scores: {
          architect: v.architect.score,
          critic: v.critic.score,
          pragmatist: v.pragmatist.score,
          final: v.finalScore,
        },
        verdict: v.finalVerdict,
        updatedAt: v.updatedAt,
      }))
    );
  });

  // Single file verdict
  router.get('/verdicts/:file(*)', (req: Request, res: Response) => {
    const filePath = req.params.file;
    const verdict = cache.getVerdict(filePath);

    if (!verdict) {
      res.status(404).json({ error: 'Verdict not found' });
      return;
    }

    res.json(verdict);
  });

  // Debates
  router.get('/debates', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const debates = cache.getDebates(undefined, limit);
    res.json(debates);
  });

  // Alerts
  router.get('/alerts', (req: Request, res: Response) => {
    const alerts = cache.getAlerts();
    res.json(alerts);
  });

  router.delete('/alerts', (req: Request, res: Response) => {
    cache.clearAlerts();
    res.json({ cleared: true });
  });

  // Configuration
  router.get('/config', (req: Request, res: Response) => {
    const config = daemon.getConfig();
    res.json({
      api: {
        baseUrl: config.api.baseUrl,
        model: config.api.model,
        hasApiKey: !!config.api.apiKey,
      },
      analysis: config.analysis,
      weights: config.weights,
      limits: config.limits,
      dashboard: config.dashboard,
      safeguards: config.safeguards,
    });
  });

  router.post('/config', (req: Request, res: Response) => {
    try {
      const updates = req.body;

      // Restructure updates to match config shape
      const configUpdates: any = {};

      if (updates.baseUrl || updates.model || updates.apiKey) {
        configUpdates.api = {};
        if (updates.baseUrl) configUpdates.api.baseUrl = updates.baseUrl;
        if (updates.model) configUpdates.api.model = updates.model;
        if (updates.apiKey) configUpdates.api.apiKey = updates.apiKey;
      }

      if (updates.targetScore !== undefined) {
        configUpdates.analysis = { targetScore: updates.targetScore };
      }

      if (updates.weights) {
        configUpdates.weights = updates.weights;
      }

      const newConfig = daemon.updateConfig(configUpdates);

      res.json({
        updated: true,
        config: {
          api: {
            baseUrl: newConfig.api.baseUrl,
            model: newConfig.api.model,
            hasApiKey: !!newConfig.api.apiKey,
          },
          analysis: newConfig.analysis,
          weights: newConfig.weights,
        },
      });
    } catch (error) {
      res.status(400).json({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Cost tracking
  router.get('/costs', (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    const history = cache.getCostHistory(days);
    const today = cache.getTodayCost();
    const limit = daemon.getConfig().limits.dailyCostLimit;

    res.json({
      today: {
        cost: today,
        limit,
        remaining: limit - today,
        percentUsed: (today / limit) * 100,
      },
      history,
    });
  });

  // Trigger analysis
  router.post('/analyze', async (req: Request, res: Response) => {
    const { file } = req.body;

    if (!file) {
      res.status(400).json({ error: 'File path required' });
      return;
    }

    try {
      await daemon.analyzeFile(file);
      const verdict = cache.getVerdict(file);
      res.json({ analyzed: true, verdict });
    } catch (error) {
      res.status(500).json({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Ignore rules
  router.post('/ignore', (req: Request, res: Response) => {
    const { file, rule, reason } = req.body;

    if (!file || !rule) {
      res.status(400).json({ error: 'File and rule required' });
      return;
    }

    cache.addIgnore(file, rule, reason || 'No reason provided');
    res.json({ acknowledged: true });
  });

  router.get('/ignores/:file(*)', (req: Request, res: Response) => {
    const filePath = req.params.file;
    const ignores = cache.getIgnores(filePath);
    res.json(ignores);
  });

  return router;
}
