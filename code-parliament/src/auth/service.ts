/**
 * Authentication Service
 *
 * Manages user accounts, API keys, and subscription status
 */

import { randomBytes, createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export type Plan = 'free' | 'pro' | 'team' | 'enterprise';

export interface TokenPayload {
  userId: string;
  email: string;
}

export interface User {
  id: string;
  email: string;
  plan: Plan;
  isActive: boolean;
  stripeCustomerId?: string;
  apiKey?: string;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;
  name: string;
  lastUsed?: string;
  createdAt: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  plan TEXT DEFAULT 'free',
  is_active INTEGER DEFAULT 1,
  stripe_customer_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT DEFAULT 'default',
  last_used DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`;

export class AuthService {
  private db: Database.Database;
  private jwtSecret: string;

  constructor(jwtSecret: string = 'parliament-secret', dbPath: string = './data/parliament.db') {
    this.jwtSecret = jwtSecret;

    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  // Generate JWT token
  generateToken(userId: string, email: string): string {
    return jwt.sign({ userId, email }, this.jwtSecret, { expiresIn: '30d' });
  }

  // Verify JWT token
  verifyToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, this.jwtSecret) as TokenPayload;
    } catch {
      return null;
    }
  }

  // Signup - create user and return token
  async signup(email: string, password: string, plan: Plan = 'free'): Promise<{ token: string; userId: string; apiKey: string }> {
    const existingUser = this.getUserByEmail(email);
    if (existingUser) {
      throw new Error('Email already exists');
    }

    const passwordHash = this.hashPassword(password);
    const user = await this.createUser(email, passwordHash);

    // Update plan if not free
    if (plan !== 'free') {
      this.updatePlan(user.id, plan);
    }

    // Create API key
    const apiKey = await this.createApiKey(user.id);

    // Generate token
    const token = this.generateToken(user.id, email);

    return { token, userId: user.id, apiKey };
  }

  // Login - verify credentials and return token
  async login(email: string, password: string): Promise<{ token: string; userId: string }> {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    const row = stmt.get(email) as any;

    if (!row) {
      throw new Error('Invalid credentials');
    }

    const passwordHash = this.hashPassword(password);
    if (row.password_hash !== passwordHash) {
      throw new Error('Invalid credentials');
    }

    const token = this.generateToken(row.id, email);
    return { token, userId: row.id };
  }

  // Get user by ID with API key
  async getUser(userId: string): Promise<User | null> {
    const user = this.getUserById(userId);
    if (!user) return null;

    // Get the first API key for display
    const keys = this.getApiKeys(userId);
    if (keys.length > 0) {
      // We can't retrieve the actual key, but we can indicate one exists
      const keyStmt = this.db.prepare(`
        SELECT key_hash FROM api_keys WHERE user_id = ? LIMIT 1
      `);
      const keyRow = keyStmt.get(userId) as any;
      // Note: We store a masked version for display
      user.apiKey = `pk_****${keyRow?.key_hash?.slice(-8) || ''}`;
    }

    return user;
  }

  // Hash password
  private hashPassword(password: string): string {
    return createHash('sha256').update(password + this.jwtSecret).digest('hex');
  }

  // Regenerate API key
  async regenerateApiKey(userId: string): Promise<string> {
    // Delete existing keys
    this.db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(userId);

    // Create new key
    return this.createApiKey(userId);
  }

  // Generate a new API key
  generateApiKey(): { key: string; hash: string } {
    const key = `pk_${randomBytes(24).toString('hex')}`;
    const hash = this.hashKey(key);
    return { key, hash };
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  // Create a new user
  async createUser(email: string, passwordHash?: string): Promise<User> {
    const id = `usr_${randomBytes(12).toString('hex')}`;

    const stmt = this.db.prepare(`
      INSERT INTO users (id, email, password_hash)
      VALUES (?, ?, ?)
    `);

    stmt.run(id, email, passwordHash);

    return this.getUserById(id)!;
  }

  // Get user by ID
  getUserById(id: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      plan: row.plan as Plan,
      isActive: !!row.is_active,
      stripeCustomerId: row.stripe_customer_id,
      createdAt: row.created_at,
    };
  }

  // Get user by email
  getUserByEmail(email: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    const row = stmt.get(email) as any;

    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      plan: row.plan as Plan,
      isActive: !!row.is_active,
      stripeCustomerId: row.stripe_customer_id,
      createdAt: row.created_at,
    };
  }

  // Create an API key for a user
  async createApiKey(userId: string, name: string = 'default'): Promise<string> {
    const { key, hash } = this.generateApiKey();
    const id = `key_${randomBytes(8).toString('hex')}`;

    const stmt = this.db.prepare(`
      INSERT INTO api_keys (id, user_id, key_hash, name)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, userId, hash, name);

    // Return the actual key (only time it's visible)
    return key;
  }

  // Validate an API key and return the user
  async validateApiKey(key: string): Promise<User | null> {
    if (!key.startsWith('pk_')) {
      return null;
    }

    const hash = this.hashKey(key);

    const stmt = this.db.prepare(`
      SELECT u.* FROM users u
      JOIN api_keys k ON u.id = k.user_id
      WHERE k.key_hash = ?
    `);

    const row = stmt.get(hash) as any;

    if (!row) return null;

    // Update last used
    this.db.prepare(`
      UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE key_hash = ?
    `).run(hash);

    return {
      id: row.id,
      email: row.email,
      plan: row.plan as Plan,
      isActive: !!row.is_active,
      stripeCustomerId: row.stripe_customer_id,
      createdAt: row.created_at,
    };
  }

  // Update user's plan
  updatePlan(userId: string, plan: Plan): void {
    this.db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, userId);
  }

  // Update user's subscription status
  updateSubscriptionStatus(userId: string, isActive: boolean): void {
    this.db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, userId);
  }

  // Set Stripe customer ID
  setStripeCustomerId(userId: string, customerId: string): void {
    this.db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, userId);
  }

  // Get all API keys for a user
  getApiKeys(userId: string): Array<{ id: string; name: string; lastUsed?: string; createdAt: string }> {
    const stmt = this.db.prepare(`
      SELECT id, name, last_used, created_at
      FROM api_keys WHERE user_id = ?
    `);

    return (stmt.all(userId) as any[]).map(row => ({
      id: row.id,
      name: row.name,
      lastUsed: row.last_used,
      createdAt: row.created_at,
    }));
  }

  // Delete an API key
  deleteApiKey(keyId: string, userId: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM api_keys WHERE id = ? AND user_id = ?'
    ).run(keyId, userId);

    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
