/**
 * Redis Cache for Production Deployment
 *
 * Works with Railway Redis or any Redis-compatible service.
 * Falls back to in-memory cache if Redis is not available.
 */

import IORedis from 'ioredis';
import { logger } from '../utils/logger.js';

type RedisClient = IORedis;

const log = logger.child('redis-cache');

export interface CacheOptions {
  redisUrl?: string;
  prefix?: string;
  defaultTTL?: number;
}

export class RedisCache {
  private redis: RedisClient | null = null;
  private memoryCache: Map<string, { value: string; expiry: number }> = new Map();
  private prefix: string;
  private defaultTTL: number;
  private connected: boolean = false;

  constructor(options: CacheOptions = {}) {
    this.prefix = options.prefix || 'parliament:';
    this.defaultTTL = options.defaultTTL || 3600; // 1 hour default

    const redisUrl = options.redisUrl || process.env.REDIS_URL;

    if (redisUrl) {
      this.initRedis(redisUrl);
    } else {
      log.warn('No Redis URL provided, using in-memory cache');
    }
  }

  private initRedis(url: string): void {
    try {
      this.redis = new IORedis(url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });

      this.redis.on('connect', () => {
        this.connected = true;
        log.info('Connected to Redis');
      });

      this.redis.on('error', (err: Error) => {
        log.error('Redis error:', err.message);
        this.connected = false;
      });

      this.redis.on('close', () => {
        this.connected = false;
        log.warn('Redis connection closed');
      });

      // Connect
      this.redis.connect().catch((err: Error) => {
        log.error('Failed to connect to Redis:', err.message);
        this.redis = null;
      });
    } catch (error) {
      log.error('Redis initialization failed:', error);
      this.redis = null;
    }
  }

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.key(key);

    if (this.redis && this.connected) {
      try {
        const value = await this.redis.get(fullKey);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        log.error(`Redis GET error for ${key}:`, error);
      }
    }

    // Fall back to memory cache
    const cached = this.memoryCache.get(fullKey);
    if (cached && cached.expiry > Date.now()) {
      return JSON.parse(cached.value);
    }
    this.memoryCache.delete(fullKey);
    return null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.key(key);
    const serialized = JSON.stringify(value);
    const expiry = ttl || this.defaultTTL;

    if (this.redis && this.connected) {
      try {
        await this.redis.setex(fullKey, expiry, serialized);
        return;
      } catch (error) {
        log.error(`Redis SET error for ${key}:`, error);
      }
    }

    // Fall back to memory cache
    this.memoryCache.set(fullKey, {
      value: serialized,
      expiry: Date.now() + expiry * 1000,
    });

    // Clean up old entries periodically
    if (this.memoryCache.size > 10000) {
      this.cleanMemoryCache();
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.key(key);

    if (this.redis && this.connected) {
      try {
        await this.redis.del(fullKey);
      } catch (error) {
        log.error(`Redis DEL error for ${key}:`, error);
      }
    }

    this.memoryCache.delete(fullKey);
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.key(key);

    if (this.redis && this.connected) {
      try {
        return (await this.redis.exists(fullKey)) === 1;
      } catch (error) {
        log.error(`Redis EXISTS error for ${key}:`, error);
      }
    }

    const cached = this.memoryCache.get(fullKey);
    return cached !== undefined && cached.expiry > Date.now();
  }

  async incr(key: string, ttl?: number): Promise<number> {
    const fullKey = this.key(key);

    if (this.redis && this.connected) {
      try {
        const value = await this.redis.incr(fullKey);
        if (ttl) {
          await this.redis.expire(fullKey, ttl);
        }
        return value;
      } catch (error) {
        log.error(`Redis INCR error for ${key}:`, error);
      }
    }

    // Fall back to memory cache
    const cached = this.memoryCache.get(fullKey);
    let value = 1;
    if (cached && cached.expiry > Date.now()) {
      value = parseInt(cached.value, 10) + 1;
    }
    this.memoryCache.set(fullKey, {
      value: String(value),
      expiry: Date.now() + (ttl || this.defaultTTL) * 1000,
    });
    return value;
  }

  async hset(key: string, field: string, value: unknown): Promise<void> {
    const fullKey = this.key(key);
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    if (this.redis && this.connected) {
      try {
        await this.redis.hset(fullKey, field, serialized);
        return;
      } catch (error) {
        log.error(`Redis HSET error for ${key}:`, error);
      }
    }

    // Fall back to memory cache (simplified)
    const cached = this.memoryCache.get(fullKey);
    const hash = cached ? JSON.parse(cached.value) : {};
    hash[field] = value;
    this.memoryCache.set(fullKey, {
      value: JSON.stringify(hash),
      expiry: Date.now() + this.defaultTTL * 1000,
    });
  }

  async hget<T>(key: string, field: string): Promise<T | null> {
    const fullKey = this.key(key);

    if (this.redis && this.connected) {
      try {
        const value = await this.redis.hget(fullKey, field);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        log.error(`Redis HGET error for ${key}:`, error);
      }
    }

    // Fall back to memory cache
    const cached = this.memoryCache.get(fullKey);
    if (cached && cached.expiry > Date.now()) {
      const hash = JSON.parse(cached.value);
      return hash[field] || null;
    }
    return null;
  }

  async hgetall<T>(key: string): Promise<Record<string, T>> {
    const fullKey = this.key(key);

    if (this.redis && this.connected) {
      try {
        const values = await this.redis.hgetall(fullKey);
        const result: Record<string, T> = {};
        for (const [k, v] of Object.entries(values)) {
          result[k] = JSON.parse(v);
        }
        return result;
      } catch (error) {
        log.error(`Redis HGETALL error for ${key}:`, error);
      }
    }

    // Fall back to memory cache
    const cached = this.memoryCache.get(fullKey);
    if (cached && cached.expiry > Date.now()) {
      return JSON.parse(cached.value);
    }
    return {};
  }

  async keys(pattern: string): Promise<string[]> {
    const fullPattern = this.key(pattern);

    if (this.redis && this.connected) {
      try {
        const keys = await this.redis.keys(fullPattern);
        return keys.map((k: string) => k.replace(this.prefix, ''));
      } catch (error) {
        log.error(`Redis KEYS error for ${pattern}:`, error);
      }
    }

    // Fall back to memory cache
    const regex = new RegExp(
      '^' + fullPattern.replace(/\*/g, '.*').replace(/\?/g, '.')
    );
    const result: string[] = [];
    for (const k of this.memoryCache.keys()) {
      if (regex.test(k)) {
        result.push(k.replace(this.prefix, ''));
      }
    }
    return result;
  }

  private cleanMemoryCache(): void {
    const now = Date.now();
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.expiry <= now) {
        this.memoryCache.delete(key);
      }
    }
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
let cacheInstance: RedisCache | null = null;

export function getCache(): RedisCache {
  if (!cacheInstance) {
    cacheInstance = new RedisCache();
  }
  return cacheInstance;
}

// User-specific cache helpers
export const userCache = {
  async getVerdict(userId: string, filePath: string) {
    return getCache().hget(`user:${userId}:verdicts`, filePath);
  },

  async setVerdict(userId: string, filePath: string, verdict: unknown) {
    return getCache().hset(`user:${userId}:verdicts`, filePath, verdict);
  },

  async getAllVerdicts(userId: string) {
    return getCache().hgetall(`user:${userId}:verdicts`);
  },

  async getSession(sessionId: string) {
    return getCache().get(`session:${sessionId}`);
  },

  async setSession(sessionId: string, data: unknown, ttl = 86400) {
    return getCache().set(`session:${sessionId}`, data, ttl);
  },

  async deleteSession(sessionId: string) {
    return getCache().delete(`session:${sessionId}`);
  },

  async getRateLimit(userId: string, window: string): Promise<number> {
    const key = `ratelimit:${userId}:${window}`;
    const count = await getCache().get<number>(key);
    return count || 0;
  },

  async incrRateLimit(userId: string, window: string, ttl: number): Promise<number> {
    const key = `ratelimit:${userId}:${window}`;
    return getCache().incr(key, ttl);
  },

  async getUsage(userId: string, date: string) {
    return getCache().hget(`usage:${userId}`, date);
  },

  async setUsage(userId: string, date: string, usage: unknown) {
    return getCache().hset(`usage:${userId}`, date, usage);
  },
};
