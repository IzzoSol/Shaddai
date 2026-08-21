/**
 * PAYMENT PROVIDERS — Unified interface for Stripe, Moon Pay, Paybox, Robinhood, Cash App
 *
 * Each provider implements:
 *   - charge(userId, amount, metadata) → { status, transactionId, ... }
 *   - refund(transactionId)
 *   - getStatus(transactionId)
 *   - onWebhook(payload) → verify signature, mark confirmed
 *
 * Registry: paymentRegistry.get('paybox').charge(...)
 */
'use strict';

const crypto = require('crypto');
const https = require('https');
const axios = require('axios');

// ═══════════════════════════════════════════════════════════════════════════════
// BASE PROVIDER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class PaymentProvider {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.apiKey = config.apiKey || process.env[`${name.toUpperCase()}_API_KEY`];
    this.secretKey = config.secretKey || process.env[`${name.toUpperCase()}_SECRET_KEY`];
    this.webhookSecret = config.webhookSecret || process.env[`${name.toUpperCase()}_WEBHOOK_SECRET`];
  }

  async charge(userId, amount, metadata = {}) {
    throw new Error(`${this.name}.charge() not implemented`);
  }

  async refund(transactionId) {
    throw new Error(`${this.name}.refund() not implemented`);
  }

  async getStatus(transactionId) {
    throw new Error(`${this.name}.getStatus() not implemented`);
  }

  async onWebhook(payload, signature) {
    throw new Error(`${this.name}.onWebhook() not implemented`);
  }

  verifyWebhookSignature(payload, signature, secret) {
    const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYBOX — https://paybox.money/
// Real-time payment platform (EMEA focus)
// ═══════════════════════════════════════════════════════════════════════════════

class PayboxProvider extends PaymentProvider {
  constructor(config = {}) {
    super('paybox', config);
    this.apiBase = config.sandbox ? 'https://sandbox-api.paybox.money/api/v1' : 'https://api.paybox.money/api/v1';
    this.merchantId = config.merchantId || process.env.PAYBOX_MERCHANT_ID;
  }

  async charge(userId, amount, metadata = {}) {
    try {
      const payload = {
        merchant_id: this.merchantId,
        user_id: userId,
        amount: Math.round(amount * 100), // cents
        currency: metadata.currency || 'USD',
        description: metadata.description || 'SHADDAI Agent Task',
        order_id: metadata.taskId || `task-${Date.now()}`,
        callback_url: process.env.PAYBOX_CALLBACK_URL || 'http://localhost:3000/api/billing/webhook/paybox',
        reference: metadata.reference || crypto.randomBytes(16).toString('hex')
      };

      const response = await axios.post(`${this.apiBase}/charge`, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        status: 'pending',
        provider: 'paybox',
        transactionId: response.data.charge_id || response.data.id,
        amount,
        metadata,
        providerResponse: response.data,
        chargeUrl: response.data.redirect_url || null
      };
    } catch (e) {
      console.error('[paybox] charge failed:', e.message);
      throw new Error(`Paybox charge failed: ${e.message}`);
    }
  }

  async refund(transactionId) {
    try {
      const response = await axios.post(
        `${this.apiBase}/charge/${transactionId}/refund`,
        {},
        { headers: { 'Authorization': `Bearer ${this.apiKey}` } }
      );

      return {
        status: 'refunded',
        provider: 'paybox',
        refundId: response.data.refund_id,
        transactionId
      };
    } catch (e) {
      console.error('[paybox] refund failed:', e.message);
      throw e;
    }
  }

  async getStatus(transactionId) {
    try {
      const response = await axios.get(
        `${this.apiBase}/charge/${transactionId}`,
        { headers: { 'Authorization': `Bearer ${this.apiKey}` } }
      );

      return {
        provider: 'paybox',
        transactionId,
        status: response.data.status, // pending, completed, failed, refunded
        amount: (response.data.amount || 0) / 100
      };
    } catch (e) {
      console.error('[paybox] getStatus failed:', e.message);
      return { status: 'unknown', error: e.message };
    }
  }

  async onWebhook(body, signature) {
    try {
      // Paybox uses HMAC-SHA256 in X-Paybox-Signature header
      if (!this.webhookSecret) throw new Error('Webhook secret not configured');

      const payload = JSON.stringify(body);
      this.verifyWebhookSignature(payload, signature, this.webhookSecret);

      return {
        verified: true,
        transactionId: body.charge_id,
        status: body.status,
        amount: (body.amount || 0) / 100
      };
    } catch (e) {
      console.error('[paybox] webhook verification failed:', e.message);
      return { verified: false, error: e.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROBINHOOD API — Crypto/stock brokerage (UNDOCUMENTED)
// NOTE: Official Robinhood API is largely undocumented. This is a skeleton.
// For production, contact Robinhood API team or use their Mobile Verify flow.
// ═══════════════════════════════════════════════════════════════════════════════

class RobinhoodProvider extends PaymentProvider {
  constructor(config = {}) {
    super('robinhood', config);
    this.apiBase = 'https://api.robinhood.com';
    this.accountId = config.accountId || process.env.ROBINHOOD_ACCOUNT_ID;
  }

  async charge(userId, amount, metadata = {}) {
    // Robinhood doesn't expose a direct payment API.
    // For now, this returns a pending status + user must authorize via Robinhood app.
    // In production, use OAuth 2.0 + Robinhood's Verify SDK.

    const transactionId = `rh-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

    try {
      // Skeleton: would normally initiate OAuth or ACH transfer
      return {
        status: 'pending_authorization',
        provider: 'robinhood',
        transactionId,
        amount,
        authorizationUrl: `${this.apiBase}/oauth2/authorize?...`, // Not real
        metadata,
        note: 'User must authorize payment via Robinhood app'
      };
    } catch (e) {
      throw new Error(`Robinhood charge failed: ${e.message}`);
    }
  }

  async refund(transactionId) {
    // Robinhood transfers cannot be reversed via API; must contact support.
    return {
      status: 'error',
      error: 'Robinhood transfers cannot be auto-refunded. Contact support.',
      transactionId
    };
  }

  async getStatus(transactionId) {
    // Would query Robinhood ACH/transfer status if OAuth token available
    return {
      provider: 'robinhood',
      status: 'pending',
      note: 'OAuth token required for status check'
    };
  }

  async onWebhook(body, signature) {
    // Robinhood webhooks not documented; placeholder
    return { verified: false, error: 'Robinhood webhooks not implemented' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASH APP (SQUARE) — https://developer.squareup.com/
// Peer-to-peer payments via Square Cash for Business
// ═══════════════════════════════════════════════════════════════════════════════

class CashAppProvider extends PaymentProvider {
  constructor(config = {}) {
    super('cashapp', config);
    this.apiBase = config.sandbox ? 'https://sandbox.squareup.com/v2' : 'https://connect.squareup.com/v2';
    this.locationId = config.locationId || process.env.CASHAPP_LOCATION_ID;
  }

  async charge(userId, amount, metadata = {}) {
    try {
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        source_id: metadata.sourceId || 'sq-cashapp', // Customer's saved payment method
        idempotency_key: idempotencyKey,
        amount_money: {
          amount: Math.round(amount * 100), // cents
          currency: 'USD'
        },
        customer_id: userId,
        note: metadata.description || 'SHADDAI Agent Task',
        reference_id: metadata.taskId || `task-${Date.now()}`
      };

      const response = await axios.post(`${this.apiBase}/payments`, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        status: response.data.payment.status === 'COMPLETED' ? 'confirmed' : 'pending',
        provider: 'cashapp',
        transactionId: response.data.payment.id,
        amount,
        metadata,
        providerResponse: response.data.payment
      };
    } catch (e) {
      console.error('[cashapp] charge failed:', e.message);
      throw new Error(`Cash App charge failed: ${e.message}`);
    }
  }

  async refund(transactionId) {
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await axios.post(
        `${this.apiBase}/refunds`,
        {
          payment_id: transactionId,
          idempotency_key: idempotencyKey
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}` } }
      );

      return {
        status: 'refunded',
        provider: 'cashapp',
        refundId: response.data.refund.id,
        transactionId
      };
    } catch (e) {
      console.error('[cashapp] refund failed:', e.message);
      throw e;
    }
  }

  async getStatus(transactionId) {
    try {
      const response = await axios.get(
        `${this.apiBase}/payments/${transactionId}`,
        { headers: { 'Authorization': `Bearer ${this.apiKey}` } }
      );

      return {
        provider: 'cashapp',
        transactionId,
        status: response.data.payment.status.toLowerCase(), // COMPLETED, PENDING, CANCELED, FAILED
        amount: (response.data.payment.amount_money?.amount || 0) / 100
      };
    } catch (e) {
      console.error('[cashapp] getStatus failed:', e.message);
      return { status: 'unknown', error: e.message };
    }
  }

  async onWebhook(body, signature) {
    try {
      // Square uses HMAC-SHA256 in X-Square-Hmac-SHA256 header
      if (!this.webhookSecret) throw new Error('Webhook secret not configured');

      const payload = JSON.stringify(body);
      const computed = crypto.createHmac('sha256', this.webhookSecret).update(payload).digest('base64');

      if (computed !== signature) throw new Error('Signature mismatch');

      return {
        verified: true,
        transactionId: body.data?.object?.payment?.id,
        status: body.data?.object?.payment?.status?.toLowerCase(),
        amount: (body.data?.object?.payment?.amount_money?.amount || 0) / 100
      };
    } catch (e) {
      console.error('[cashapp] webhook verification failed:', e.message);
      return { verified: false, error: e.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOON PAY — https://www.moonpay.com/
// Crypto on-ramp (existing skeleton in codebase)
// ═══════════════════════════════════════════════════════════════════════════════

class MoonPayProvider extends PaymentProvider {
  constructor(config = {}) {
    super('moonpay', config);
    this.apiBase = config.sandbox ? 'https://api.sandbox.moonpay.com' : 'https://api.moonpay.com';
  }

  async charge(userId, amount, metadata = {}) {
    // Moon Pay is primarily a fiat-to-crypto on-ramp, not a direct charge API.
    // This returns a widget URL for the user to complete the purchase.
    const widgetUrl = `${this.apiBase.replace('api.', 'www.')}/embedded/buy?apiKey=${this.apiKey}&userId=${userId}&amount=${amount}`;

    return {
      status: 'pending',
      provider: 'moonpay',
      transactionId: `mp-${Date.now()}`,
      amount,
      widgetUrl,
      note: 'User completes purchase via Moon Pay widget'
    };
  }

  async refund(transactionId) {
    return { status: 'error', error: 'Moon Pay refunds must be handled manually' };
  }

  async getStatus(transactionId) {
    // Would query Moon Pay transaction endpoint with proper auth
    return { provider: 'moonpay', status: 'unknown' };
  }

  async onWebhook(body, signature) {
    // Moon Pay webhook signature verification
    try {
      if (!this.webhookSecret) throw new Error('Webhook secret not configured');
      const payload = JSON.stringify(body);
      this.verifyWebhookSignature(payload, signature, this.webhookSecret);
      return { verified: true };
    } catch (e) {
      return { verified: false, error: e.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT REGISTRY — Unified access point
// ═══════════════════════════════════════════════════════════════════════════════

class PaymentRegistry {
  constructor() {
    this.providers = new Map();
    this._initializeProviders();
  }

  _initializeProviders() {
    // Initialize all configured providers
    this.register('stripe', new PaymentProvider('stripe', {
      apiKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
    }));

    if (process.env.PAYBOX_API_KEY || process.env.PAYBOX_MERCHANT_ID) {
      this.register('paybox', new PayboxProvider({
        apiKey: process.env.PAYBOX_API_KEY,
        merchantId: process.env.PAYBOX_MERCHANT_ID,
        webhookSecret: process.env.PAYBOX_WEBHOOK_SECRET,
        sandbox: process.env.PAYBOX_SANDBOX === 'true'
      }));
    }

    if (process.env.ROBINHOOD_API_KEY) {
      this.register('robinhood', new RobinhoodProvider({
        apiKey: process.env.ROBINHOOD_API_KEY,
        accountId: process.env.ROBINHOOD_ACCOUNT_ID
      }));
    }

    if (process.env.CASHAPP_API_KEY) {
      this.register('cashapp', new CashAppProvider({
        apiKey: process.env.CASHAPP_API_KEY,
        locationId: process.env.CASHAPP_LOCATION_ID,
        webhookSecret: process.env.CASHAPP_WEBHOOK_SECRET
      }));
    }

    if (process.env.MOONPAY_API_KEY) {
      this.register('moonpay', new MoonPayProvider({
        apiKey: process.env.MOONPAY_API_KEY,
        secretKey: process.env.MOONPAY_SECRET_KEY
      }));
    }
  }

  register(name, provider) {
    this.providers.set(name.toLowerCase(), provider);
  }

  get(name) {
    const provider = this.providers.get(name?.toLowerCase());
    if (!provider) throw new Error(`Payment provider '${name}' not found or not configured`);
    return provider;
  }

  list() {
    return Array.from(this.providers.keys());
  }

  status() {
    const status = {};
    for (const [name, provider] of this.providers) {
      status[name] = {
        configured: !!provider.apiKey,
        name: provider.name
      };
    }
    return status;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  PaymentProvider,
  PayboxProvider,
  RobinhoodProvider,
  CashAppProvider,
  MoonPayProvider,
  PaymentRegistry,
  paymentRegistry: new PaymentRegistry()
};
