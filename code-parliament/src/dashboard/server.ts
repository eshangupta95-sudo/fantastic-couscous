import express, { Express } from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ParliamentDaemon } from '../daemon/index.js';
import { createApiRouter } from './api.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = logger.child('dashboard');

export function createDashboardServer(daemon: ParliamentDaemon): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // API routes
  app.use('/api', createApiRouter(daemon));

  // Serve static files
  app.use(express.static(join(__dirname, 'public')));

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  });

  return app;
}

export function startDashboard(daemon: ParliamentDaemon, port: number): void {
  const app = createDashboardServer(daemon);

  app.listen(port, () => {
    log.info(`Dashboard running at http://localhost:${port}`);
  });
}
