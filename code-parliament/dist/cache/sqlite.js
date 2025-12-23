import Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger.js';
const SCHEMA = `
CREATE TABLE IF NOT EXISTS verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  architect_score INTEGER,
  architect_reasoning TEXT,
  architect_issues TEXT,
  architect_confidence REAL,
  critic_score INTEGER,
  critic_reasoning TEXT,
  critic_issues TEXT,
  critic_confidence REAL,
  pragmatist_score INTEGER,
  pragmatist_reasoning TEXT,
  pragmatist_issues TEXT,
  pragmatist_confidence REAL,
  final_score INTEGER,
  final_verdict TEXT,
  suggestions TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(file_path, file_hash)
);

CREATE TABLE IF NOT EXISTS debates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT,
  topic TEXT,
  transcript TEXT,
  resolution TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ignores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT,
  rule TEXT,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(file_path, rule)
);

CREATE TABLE IF NOT EXISTS costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_cost REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verdicts_file_path ON verdicts(file_path);
CREATE INDEX IF NOT EXISTS idx_verdicts_final_score ON verdicts(final_score);
CREATE INDEX IF NOT EXISTS idx_costs_date ON costs(date);
`;
export class SQLiteCache {
    db;
    alertsFile;
    targetScore;
    constructor(dbPath, targetScore = 95) {
        // Ensure directory exists
        const dir = dirname(dbPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(SCHEMA);
        this.alertsFile = join(homedir(), '.parliament', 'alerts.json');
        this.targetScore = targetScore;
        // Ensure alerts directory exists
        const alertsDir = dirname(this.alertsFile);
        if (!existsSync(alertsDir)) {
            mkdirSync(alertsDir, { recursive: true });
        }
        logger.info(`Cache initialized at ${dbPath}`);
    }
    // Verdict operations
    saveVerdict(verdict) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO verdicts (
        file_path, file_hash,
        architect_score, architect_reasoning, architect_issues, architect_confidence,
        critic_score, critic_reasoning, critic_issues, critic_confidence,
        pragmatist_score, pragmatist_reasoning, pragmatist_issues, pragmatist_confidence,
        final_score, final_verdict, suggestions, updated_at
      ) VALUES (
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, CURRENT_TIMESTAMP
      )
    `);
        stmt.run(verdict.filePath, verdict.fileHash, verdict.architect.score, verdict.architect.reasoning, JSON.stringify(verdict.architect.issues), verdict.architect.confidence, verdict.critic.score, verdict.critic.reasoning, JSON.stringify(verdict.critic.issues), verdict.critic.confidence, verdict.pragmatist.score, verdict.pragmatist.reasoning, JSON.stringify(verdict.pragmatist.issues), verdict.pragmatist.confidence, verdict.finalScore, verdict.finalVerdict, JSON.stringify(verdict.suggestions));
        // Check if we need to create an alert
        if (verdict.finalScore < this.targetScore) {
            const topIssue = this.getTopIssue(verdict);
            this.addAlert({
                id: `${verdict.filePath}-${Date.now()}`,
                timestamp: new Date().toISOString(),
                filePath: verdict.filePath,
                score: verdict.finalScore,
                previousScore: null,
                topIssue: topIssue.description,
                severity: topIssue.severity,
                suggestion: topIssue.suggestion || 'Review and fix the issue',
            });
        }
    }
    getTopIssue(verdict) {
        const allIssues = [
            ...verdict.architect.issues,
            ...verdict.critic.issues,
            ...verdict.pragmatist.issues,
        ];
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
        if (allIssues.length > 0) {
            return allIssues[0];
        }
        return {
            description: 'General improvements needed',
            severity: 'medium',
        };
    }
    getVerdict(filePath) {
        const stmt = this.db.prepare(`
      SELECT * FROM verdicts WHERE file_path = ? ORDER BY updated_at DESC LIMIT 1
    `);
        const row = stmt.get(filePath);
        if (!row)
            return null;
        return this.rowToVerdict(row);
    }
    getVerdictByHash(filePath, fileHash) {
        const stmt = this.db.prepare(`
      SELECT * FROM verdicts WHERE file_path = ? AND file_hash = ?
    `);
        const row = stmt.get(filePath, fileHash);
        if (!row)
            return null;
        return this.rowToVerdict(row);
    }
    rowToVerdict(row) {
        return {
            id: row.id,
            filePath: row.file_path,
            fileHash: row.file_hash,
            architect: {
                score: row.architect_score,
                reasoning: row.architect_reasoning,
                issues: JSON.parse(row.architect_issues || '[]'),
                confidence: row.architect_confidence,
            },
            critic: {
                score: row.critic_score,
                reasoning: row.critic_reasoning,
                issues: JSON.parse(row.critic_issues || '[]'),
                confidence: row.critic_confidence,
            },
            pragmatist: {
                score: row.pragmatist_score,
                reasoning: row.pragmatist_reasoning,
                issues: JSON.parse(row.pragmatist_issues || '[]'),
                confidence: row.pragmatist_confidence,
            },
            finalScore: row.final_score,
            finalVerdict: row.final_verdict,
            suggestions: JSON.parse(row.suggestions || '[]'),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    getAllVerdicts() {
        const stmt = this.db.prepare(`
      SELECT DISTINCT file_path, * FROM verdicts
      WHERE (file_path, updated_at) IN (
        SELECT file_path, MAX(updated_at) FROM verdicts GROUP BY file_path
      )
      ORDER BY final_score ASC
    `);
        const rows = stmt.all();
        return rows.map((row) => this.rowToVerdict(row));
    }
    getFilesBelowTarget() {
        const stmt = this.db.prepare(`
      SELECT DISTINCT file_path, * FROM verdicts
      WHERE final_score < ?
      AND (file_path, updated_at) IN (
        SELECT file_path, MAX(updated_at) FROM verdicts GROUP BY file_path
      )
      ORDER BY final_score ASC
    `);
        const rows = stmt.all(this.targetScore);
        return rows.map((row) => this.rowToVerdict(row));
    }
    getProjectHealth() {
        const verdicts = this.getAllVerdicts();
        if (verdicts.length === 0) {
            return {
                overall: 0,
                target: this.targetScore,
                targetMet: false,
                filesAnalyzed: 0,
                filesAboveTarget: 0,
                filesBelowTarget: 0,
                criticalFiles: [],
                lastUpdated: new Date().toISOString(),
            };
        }
        const overall = verdicts.reduce((sum, v) => sum + v.finalScore, 0) / verdicts.length;
        const filesAboveTarget = verdicts.filter((v) => v.finalScore >= this.targetScore).length;
        const filesBelowTarget = verdicts.filter((v) => v.finalScore < this.targetScore).length;
        const criticalFiles = verdicts
            .filter((v) => v.finalScore < this.targetScore)
            .slice(0, 5)
            .map((v) => ({
            path: v.filePath,
            score: v.finalScore,
            topIssue: this.getTopIssue(v).description,
        }));
        return {
            overall: Math.round(overall * 10) / 10,
            target: this.targetScore,
            targetMet: overall >= this.targetScore,
            filesAnalyzed: verdicts.length,
            filesAboveTarget,
            filesBelowTarget,
            criticalFiles,
            lastUpdated: new Date().toISOString(),
        };
    }
    // Alert operations
    addAlert(alert) {
        const alerts = this.getAlerts();
        alerts.push(alert);
        // Keep only last 20 alerts
        const trimmed = alerts.slice(-20);
        writeFileSync(this.alertsFile, JSON.stringify(trimmed, null, 2));
    }
    getAlerts() {
        try {
            if (existsSync(this.alertsFile)) {
                const content = readFileSync(this.alertsFile, 'utf-8');
                return JSON.parse(content);
            }
        }
        catch (e) {
            // Ignore errors
        }
        return [];
    }
    clearAlerts() {
        writeFileSync(this.alertsFile, '[]');
    }
    // Debate operations
    saveDebate(debate) {
        const stmt = this.db.prepare(`
      INSERT INTO debates (file_path, topic, transcript, resolution)
      VALUES (?, ?, ?, ?)
    `);
        const result = stmt.run(debate.filePath, debate.topic, JSON.stringify(debate.transcript), debate.resolution);
        return result.lastInsertRowid;
    }
    getDebates(filePath, limit = 10) {
        let stmt;
        let rows;
        if (filePath) {
            stmt = this.db.prepare(`
        SELECT * FROM debates WHERE file_path = ? ORDER BY created_at DESC LIMIT ?
      `);
            rows = stmt.all(filePath, limit);
        }
        else {
            stmt = this.db.prepare(`
        SELECT * FROM debates ORDER BY created_at DESC LIMIT ?
      `);
            rows = stmt.all(limit);
        }
        return rows.map((row) => ({
            id: row.id,
            filePath: row.file_path,
            topic: row.topic,
            transcript: JSON.parse(row.transcript || '[]'),
            resolution: row.resolution,
            createdAt: row.created_at,
        }));
    }
    // Ignore operations
    addIgnore(filePath, rule, reason) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ignores (file_path, rule, reason) VALUES (?, ?, ?)
    `);
        stmt.run(filePath, rule, reason);
    }
    getIgnores(filePath) {
        const stmt = this.db.prepare(`SELECT rule, reason FROM ignores WHERE file_path = ?`);
        return stmt.all(filePath);
    }
    isIgnored(filePath, rule) {
        const stmt = this.db.prepare(`SELECT 1 FROM ignores WHERE file_path = ? AND rule = ?`);
        return stmt.get(filePath, rule) !== undefined;
    }
    // Cost operations
    recordCost(inputTokens, outputTokens, totalCost) {
        const date = new Date().toISOString().split('T')[0];
        const stmt = this.db.prepare(`
      INSERT INTO costs (date, input_tokens, output_tokens, total_cost)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(date, inputTokens, outputTokens, totalCost);
    }
    getTodayCost() {
        const date = new Date().toISOString().split('T')[0];
        const stmt = this.db.prepare(`
      SELECT SUM(total_cost) as total FROM costs WHERE date = ?
    `);
        const result = stmt.get(date);
        return result.total || 0;
    }
    getCostHistory(days = 30) {
        const stmt = this.db.prepare(`
      SELECT date, SUM(input_tokens) as input_tokens,
             SUM(output_tokens) as output_tokens,
             SUM(total_cost) as total_cost
      FROM costs
      GROUP BY date
      ORDER BY date DESC
      LIMIT ?
    `);
        return stmt.all(days);
    }
    // Config operations
    setConfig(key, value) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO config (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
        stmt.run(key, value);
    }
    getConfig(key) {
        const stmt = this.db.prepare(`SELECT value FROM config WHERE key = ?`);
        const result = stmt.get(key);
        return result?.value || null;
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=sqlite.js.map