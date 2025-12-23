/**
 * Stripe Billing Integration
 *
 * Handles subscriptions, payments, and plan management.
 */

import Stripe from 'stripe';
import { logger } from '../utils/logger.js';

const log = logger.child('stripe-billing');

// Initialize Stripe (use test key in development)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2023-10-16',
});

// Plan configuration
export const PLANS = {
  free: {
    name: 'Free',
    priceId: null,
    filesPerMonth: 100,
    price: 0,
    features: ['100 files/month', '3 default agents', 'Basic verdicts', 'Community support'],
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_placeholder',
    filesPerMonth: 2000,
    price: 1900, // in cents
    features: ['2,000 files/month', 'Custom agent weights', 'Priority queue', 'Dashboard analytics', 'Email support'],
  },
  team: {
    name: 'Team',
    priceId: process.env.STRIPE_TEAM_PRICE_ID || 'price_team_placeholder',
    filesPerMonth: 10000,
    price: 4900, // in cents
    features: ['10,000 files/month', '5 team members', 'GitHub integration', 'CI/CD webhooks', 'Priority support'],
  },
  enterprise: {
    name: 'Enterprise',
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise_placeholder',
    filesPerMonth: Infinity,
    price: 19900, // in cents
    features: ['Unlimited files', 'Unlimited team members', 'Custom integrations', 'SLA guarantee', 'Dedicated support'],
  },
} as const;

export type PlanType = keyof typeof PLANS;

export interface Customer {
  id: string;
  email: string;
  stripeCustomerId?: string;
  plan: PlanType;
  subscriptionId?: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: Date;
}

export class StripeService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.APP_URL || 'http://localhost:3377';
  }

  /**
   * Create a Stripe customer for a new user
   */
  async createCustomer(userId: string, email: string): Promise<string> {
    try {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      log.info(`Created Stripe customer ${customer.id} for user ${userId}`);
      return customer.id;
    } catch (error) {
      log.error('Failed to create Stripe customer:', error);
      throw error;
    }
  }

  /**
   * Create a checkout session for a plan upgrade
   */
  async createCheckoutSession(
    customerId: string,
    plan: PlanType,
    successUrl?: string,
    cancelUrl?: string
  ): Promise<string> {
    const planConfig = PLANS[plan];

    if (!planConfig.priceId) {
      throw new Error('Cannot create checkout for free plan');
    }

    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: planConfig.priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl || `${this.baseUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${this.baseUrl}/pricing`,
        metadata: { plan },
      });

      log.info(`Created checkout session ${session.id} for plan ${plan}`);
      return session.url!;
    } catch (error) {
      log.error('Failed to create checkout session:', error);
      throw error;
    }
  }

  /**
   * Create a billing portal session for subscription management
   */
  async createPortalSession(customerId: string): Promise<string> {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${this.baseUrl}/dashboard`,
      });

      return session.url;
    } catch (error) {
      log.error('Failed to create portal session:', error);
      throw error;
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
    try {
      return await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      log.error('Failed to get subscription:', error);
      return null;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    try {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      log.info(`Subscription ${subscriptionId} scheduled for cancellation`);
      return true;
    } catch (error) {
      log.error('Failed to cancel subscription:', error);
      return false;
    }
  }

  /**
   * Resume a cancelled subscription
   */
  async resumeSubscription(subscriptionId: string): Promise<boolean> {
    try {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
      log.info(`Subscription ${subscriptionId} resumed`);
      return true;
    } catch (error) {
      log.error('Failed to resume subscription:', error);
      return false;
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(
    body: string,
    signature: string,
    webhookSecret: string
  ): Promise<{ event: string; data: unknown }> {
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      log.error('Webhook signature verification failed:', error);
      throw new Error('Webhook signature verification failed');
    }

    log.info(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          event: 'checkout_completed',
          data: {
            customerId: session.customer,
            subscriptionId: session.subscription,
            plan: session.metadata?.plan,
          },
        };
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        return {
          event: 'subscription_updated',
          data: {
            customerId: subscription.customer,
            subscriptionId: subscription.id,
            status: subscription.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        };
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        return {
          event: 'subscription_cancelled',
          data: {
            customerId: subscription.customer,
            subscriptionId: subscription.id,
          },
        };
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        return {
          event: 'payment_failed',
          data: {
            customerId: invoice.customer,
            subscriptionId: invoice.subscription,
            amountDue: invoice.amount_due,
          },
        };
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        return {
          event: 'payment_succeeded',
          data: {
            customerId: invoice.customer,
            subscriptionId: invoice.subscription,
            amountPaid: invoice.amount_paid,
          },
        };
      }

      default:
        return { event: 'unhandled', data: event.data.object };
    }
  }

  /**
   * Get usage-based billing info (for future metered billing)
   */
  async reportUsage(subscriptionItemId: string, quantity: number): Promise<void> {
    try {
      await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
        quantity,
        timestamp: Math.floor(Date.now() / 1000),
        action: 'increment',
      });
    } catch (error) {
      log.error('Failed to report usage:', error);
    }
  }

  /**
   * Get plan limits
   */
  getPlanLimits(plan: PlanType) {
    return PLANS[plan];
  }

  /**
   * Check if user can analyze more files
   */
  canAnalyzeFiles(plan: PlanType, usedThisMonth: number): boolean {
    return usedThisMonth < PLANS[plan].filesPerMonth;
  }

  /**
   * Get remaining files for the month
   */
  getRemainingFiles(plan: PlanType, usedThisMonth: number): number {
    const limit = PLANS[plan].filesPerMonth;
    return limit === Infinity ? Infinity : Math.max(0, limit - usedThisMonth);
  }
}

// Singleton instance
let stripeService: StripeService | null = null;

export function getStripeService(): StripeService {
  if (!stripeService) {
    stripeService = new StripeService();
  }
  return stripeService;
}
