/**
 * Supabase Auth Service
 *
 * Handles user authentication, API key storage with encryption,
 * and subscription tier management.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { logger } from '../utils/logger.js';

const log = logger.child('supabase-auth');

// Subscription tiers
export type SubscriptionTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface TierLimits {
  filesPerMonth: number;
  filesPerDay: number;
  maxFileSizeKb: number;
  customAgents: boolean;
  priorityQueue: boolean;
  teamMembers: number;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    filesPerMonth: 100,
    filesPerDay: 20,
    maxFileSizeKb: 50,
    customAgents: false,
    priorityQueue: false,
    teamMembers: 1,
  },
  pro: {
    filesPerMonth: 2000,
    filesPerDay: 200,
    maxFileSizeKb: 200,
    customAgents: true,
    priorityQueue: false,
    teamMembers: 1,
  },
  team: {
    filesPerMonth: 10000,
    filesPerDay: 1000,
    maxFileSizeKb: 500,
    customAgents: true,
    priorityQueue: true,
    teamMembers: 5,
  },
  enterprise: {
    filesPerMonth: Infinity,
    filesPerDay: Infinity,
    maxFileSizeKb: 1000,
    customAgents: true,
    priorityQueue: true,
    teamMembers: Infinity,
  },
};

export interface User {
  id: string;
  email: string;
  tier: SubscriptionTier;
  apiKey: string; // Decrypted API key
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus: 'active' | 'past_due' | 'canceled' | 'trialing';
  currentPeriodEnd?: Date;
  createdAt: Date;
}

export interface EncryptedApiKey {
  id: string;
  userId: string;
  encryptedKey: string;
  keyHash: string; // For lookups
  iv: string;
  name: string;
  lastUsed?: Date;
  createdAt: Date;
}

// Encryption helpers
const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET || 'default-32-char-secret-key-here!';

function getEncryptionKey(): Buffer {
  return createHash('sha256').update(ENCRYPTION_KEY).digest();
}

function encryptApiKey(plainKey: string): { encrypted: string; iv: string; authTag: string } {
  const iv = randomBytes(16);
  const key = getEncryptionKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encrypted: encrypted + ':' + authTag,
    iv: iv.toString('hex'),
    authTag,
  };
}

function decryptApiKey(encryptedData: string, ivHex: string): string {
  const [encrypted, authTagHex] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getEncryptionKey();

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export class SupabaseAuthService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    log.info('Supabase auth service initialized');
  }

  // Generate a new API key
  generateApiKey(): string {
    return `pk_live_${randomBytes(24).toString('hex')}`;
  }

  // Sign up new user
  async signup(email: string, password: string, tier: SubscriptionTier = 'free'): Promise<{
    token: string;
    userId: string;
    apiKey: string;
  }> {
    // Create auth user
    const { data: authData, error: authError } = await this.supabase.auth.signUp({
      email,
      password,
    });

    if (authError || !authData.user) {
      throw new Error(authError?.message || 'Failed to create user');
    }

    const userId = authData.user.id;

    // Create user profile
    const { error: profileError } = await this.supabase
      .from('users')
      .insert({
        id: userId,
        email,
        tier,
        subscription_status: 'active',
      });

    if (profileError) {
      log.error('Failed to create user profile:', profileError);
      throw new Error('Failed to create user profile');
    }

    // Generate and store encrypted API key
    const apiKey = this.generateApiKey();
    await this.storeApiKey(userId, apiKey);

    // Get session token
    const token = authData.session?.access_token || '';

    return { token, userId, apiKey };
  }

  // Login
  async login(email: string, password: string): Promise<{
    token: string;
    userId: string;
  }> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      throw new Error(error?.message || 'Login failed');
    }

    return {
      token: data.session.access_token,
      userId: data.user.id,
    };
  }

  // Store encrypted API key
  private async storeApiKey(userId: string, plainKey: string, name: string = 'default'): Promise<void> {
    const { encrypted, iv } = encryptApiKey(plainKey);
    const keyHash = hashApiKey(plainKey);

    const { error } = await this.supabase
      .from('api_keys')
      .insert({
        user_id: userId,
        encrypted_key: encrypted,
        key_hash: keyHash,
        iv,
        name,
      });

    if (error) {
      log.error('Failed to store API key:', error);
      throw new Error('Failed to store API key');
    }
  }

  // Validate API key and return user
  async validateApiKey(apiKey: string): Promise<User | null> {
    if (!apiKey.startsWith('pk_')) {
      return null;
    }

    const keyHash = hashApiKey(apiKey);

    // Find key by hash
    const { data: keyData, error: keyError } = await this.supabase
      .from('api_keys')
      .select('*, users(*)')
      .eq('key_hash', keyHash)
      .single();

    if (keyError || !keyData) {
      return null;
    }

    // Decrypt and verify
    try {
      const decryptedKey = decryptApiKey(keyData.encrypted_key, keyData.iv);
      if (decryptedKey !== apiKey) {
        return null;
      }
    } catch {
      log.error('Failed to decrypt API key');
      return null;
    }

    // Update last used
    await this.supabase
      .from('api_keys')
      .update({ last_used: new Date().toISOString() })
      .eq('id', keyData.id);

    const userData = keyData.users;

    return {
      id: userData.id,
      email: userData.email,
      tier: userData.tier as SubscriptionTier,
      apiKey,
      stripeCustomerId: userData.stripe_customer_id,
      stripeSubscriptionId: userData.stripe_subscription_id,
      subscriptionStatus: userData.subscription_status,
      currentPeriodEnd: userData.current_period_end ? new Date(userData.current_period_end) : undefined,
      createdAt: new Date(userData.created_at),
    };
  }

  // Get user by ID
  async getUser(userId: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    // Get user's API key (decrypted)
    const { data: keyData } = await this.supabase
      .from('api_keys')
      .select('encrypted_key, iv')
      .eq('user_id', userId)
      .limit(1)
      .single();

    let apiKey = '';
    if (keyData) {
      try {
        apiKey = decryptApiKey(keyData.encrypted_key, keyData.iv);
      } catch {
        log.error('Failed to decrypt API key for user:', userId);
      }
    }

    return {
      id: data.id,
      email: data.email,
      tier: data.tier as SubscriptionTier,
      apiKey,
      stripeCustomerId: data.stripe_customer_id,
      stripeSubscriptionId: data.stripe_subscription_id,
      subscriptionStatus: data.subscription_status,
      currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : undefined,
      createdAt: new Date(data.created_at),
    };
  }

  // Verify JWT token
  async verifyToken(token: string): Promise<{ userId: string; email: string } | null> {
    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      return null;
    }

    return {
      userId: data.user.id,
      email: data.user.email || '',
    };
  }

  // Regenerate API key
  async regenerateApiKey(userId: string): Promise<string> {
    // Delete old keys
    await this.supabase
      .from('api_keys')
      .delete()
      .eq('user_id', userId);

    // Generate new key
    const newKey = this.generateApiKey();
    await this.storeApiKey(userId, newKey);

    return newKey;
  }

  // Update subscription tier
  async updateTier(userId: string, tier: SubscriptionTier): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .update({ tier })
      .eq('id', userId);

    if (error) {
      throw new Error('Failed to update tier');
    }
  }

  // Update Stripe info
  async updateStripeInfo(userId: string, data: {
    customerId?: string;
    subscriptionId?: string;
    subscriptionStatus?: string;
    currentPeriodEnd?: Date;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .update({
        stripe_customer_id: data.customerId,
        stripe_subscription_id: data.subscriptionId,
        subscription_status: data.subscriptionStatus,
        current_period_end: data.currentPeriodEnd?.toISOString(),
      })
      .eq('id', userId);

    if (error) {
      throw new Error('Failed to update Stripe info');
    }
  }

  // Get tier limits
  getTierLimits(tier: SubscriptionTier): TierLimits {
    return TIER_LIMITS[tier];
  }

  // Check if user can use feature
  canUseFeature(tier: SubscriptionTier, feature: keyof TierLimits): boolean {
    const limits = TIER_LIMITS[tier];
    return !!limits[feature];
  }
}

// Supabase schema (run this SQL in Supabase dashboard)
export const SUPABASE_SCHEMA = `
-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'team', 'enterprise')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API keys table (encrypted)
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  encrypted_key TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  iv TEXT NOT NULL,
  name TEXT DEFAULT 'default',
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking table
CREATE TABLE IF NOT EXISTS public.usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  files_analyzed INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_user_date ON public.usage(user_id, date);

-- Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;

-- Policies (service role can do everything, users can read their own data)
CREATE POLICY "Service role full access on users" ON public.users
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can read own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Service role full access on api_keys" ON public.api_keys
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on usage" ON public.usage
  FOR ALL USING (auth.role() = 'service_role');
`;

// Singleton instance
let authInstance: SupabaseAuthService | null = null;

export function getSupabaseAuth(): SupabaseAuthService {
  if (!authInstance) {
    authInstance = new SupabaseAuthService();
  }
  return authInstance;
}
