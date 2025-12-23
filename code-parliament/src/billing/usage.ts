/**
 * Usage Tracking Service
 *
 * Tracks API usage and enforces plan limits
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Plan } from '../auth/service.js';

export interface PlanLimits {
  filesPerMonth: number;
  filesPerDay: number;
  maxFileSize: number; // KB
  customAgents: boolean;
  priorityQueue: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    filesPerMonth: 100,
    filesPerDay: 20,
    maxFileSize: 50,
    customAgents: false,
    priorityQueue: false,
  },
  pro: {
    filesPerMonth: 2000,
    filesPerDay: 200,
    maxFileSize: 200,
    customAgents: true,
    priorityQueue: false,
  },
  team: {
    filesPerMonth: 10000,
    filesPerDay: 1000,
    maxFileSize: 500,
    customAgents: true,
    priorityQueue: true,
  },
  enterprise: {
    filesPerMonth: Infinity,
    filesPerDay: Infinity,
    maxFileSize: 1000,
    customAgents: true,
    priorityQueue: true,
  },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  files_analyzed INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage(user_id, date);
`;

export class UsageTracker {
  private db: Database.Database;

  constructor(dbPath: string = './data/parliament.db') {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  // Record file analysis usage
  async recordAnalysis(userId: string, fileCount: number, tokens: number = 0, cost: number = 0): Promise<void> {
    const date = new Date().toISOString().split('T')[0];

    const stmt = this.db.prepare(`
      INSERT INTO usage (user_id, date, files_analyzed, tokens_used, cost_usd)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        files_analyzed = files_analyzed + excluded.files_analyzed,
        tokens_used = tokens_used + excluded.tokens_used,
        cost_usd = cost_usd + excluded.cost_usd
    `);

    stmt.run(userId, date, fileCount, tokens, cost);
  }

  // Check if user is within limits
  async checkLimits(userId: string, plan: Plan): Promise<boolean> {
    const limits = PLAN_LIMITS[plan];
    const today = new Date().toISOString().split('T')[0];

    // Check daily limit
    const dailyStmt = this.db.prepare(`
      SELECT SUM(files_analyzed) as total
      FROM usage WHERE user_id = ? AND date = ?
    `);
    const daily = (dailyStmt.get(userId, today) as any)?.total || 0;

    if (daily >= limits.filesPerDay) {
      return false;
    }

    // Check monthly limit
    const monthStart = today.slice(0, 7) + '-01';
    const monthlyStmt = this.db.prepare(`
      SELECT SUM(files_analyzed) as total
      FROM usage WHERE user_id = ? AND date >= ?
    `);
    const monthly = (monthlyStmt.get(userId, monthStart) as any)?.total || 0;

    if (monthly >= limits.filesPerMonth) {
      return false;
    }

    return true;
  }

  // Get usage stats for a user
  async getUsage(userId: string): Promise<{
    today: { files: number; tokens: number; cost: number };
    month: { files: number; tokens: number; cost: number };
    history: Array<{ date: string; files: number; tokens: number; cost: number }>;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';

    // Today's usage
    const todayStmt = this.db.prepare(`
      SELECT files_analyzed, tokens_used, cost_usd
      FROM usage WHERE user_id = ? AND date = ?
    `);
    const todayData = todayStmt.get(userId, today) as any;

    // Monthly usage
    const monthStmt = this.db.prepare(`
      SELECT SUM(files_analyzed) as files, SUM(tokens_used) as tokens, SUM(cost_usd) as cost
      FROM usage WHERE user_id = ? AND date >= ?
    `);
    const monthData = monthStmt.get(userId, monthStart) as any;

    // History (last 30 days)
    const historyStmt = this.db.prepare(`
      SELECT date, files_analyzed, tokens_used, cost_usd
      FROM usage WHERE user_id = ?
      ORDER BY date DESC LIMIT 30
    `);
    const historyData = historyStmt.all(userId) as any[];

    return {
      today: {
        files: todayData?.files_analyzed || 0,
        tokens: todayData?.tokens_used || 0,
        cost: todayData?.cost_usd || 0,
      },
      month: {
        files: monthData?.files || 0,
        tokens: monthData?.tokens || 0,
        cost: monthData?.cost || 0,
      },
      history: historyData.map(row => ({
        date: row.date,
        files: row.files_analyzed,
        tokens: row.tokens_used,
        cost: row.cost_usd,
      })),
    };
  }

  close(): void {
    this.db.close();
  }
}

// Alias for server compatibility
export class UsageService extends UsageTracker {
  async trackUsage(userId: string, data: { analysisCount: number; tokenCount: number }): Promise<void> {
    await this.recordAnalysis(userId, data.analysisCount, data.tokenCount, 0);
  }

  async getUsageSimple(userId: string): Promise<{
    filesAnalyzed: number;
    analysisCount: number;
    tokensUsed: number;
  }> {
    const usage = await super.getUsage(userId);
    return {
      filesAnalyzed: usage.month.files,
      analysisCount: usage.month.files,
      tokensUsed: usage.month.tokens,
    };
  }
}
