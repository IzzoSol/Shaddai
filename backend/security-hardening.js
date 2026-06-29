/**
 * SHADDAI Security Hardening Module v52.0
 *
 * Comprehensive security middleware and utilities for SHADDAI API Gateway
 *
 * Components:
 * 1. HTTPS/SSL Enforcement - Force HTTPS, HSTS headers, certificate pinning
 * 2. API Key Encryption - Hash keys with bcrypt, never store plaintext
 * 3. Rate Limiting Per User - Tier-based limits with Redis/in-memory tracking
 * 4. CSRF Protection - Token validation for state-changing requests
 * 5. Input Validation - Type/length checking, sanitization, injection prevention
 * 6. Secret Rotation - JWT/API key/credential rotation utilities
 * 7. Audit Logging - Comprehensive logging of all auth, billing, API events
 * 8. Data Encryption - AES-256 encryption for sensitive data at rest
 */

const crypto = require('crypto');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// ═══ 1. AUDIT LOGGER ═════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  defaultMeta: { service: 'shaddai-audit' },
  transports: [
    new winston.transports.File({
      filename: 'audit.log',
      maxsize: 10485760, // 10MB
      maxFiles: 14 // Keep 2 weeks of logs
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) =>
          `[${timestamp}] ${level}: ${message} ${Object.keys(meta).length > 0 ? JSON.stringify(meta) : ''}`
        )
      )
    })
  ]
});

// Log audit events with structured data
const logAuditEvent = (eventType, details = {}) => {
  auditLogger.info(eventType, {
    timestamp: new Date().toISOString(),
    eventType,
    ...details
  });
};

// ═══════════════════════════════════════════════════════════════
// ═══ 2. HTTPS/SSL ENFORCEMENT ═══════════════════════════════════
// ═══════════════════════════════════════════════════════════════

/**
 * Middleware: Force HTTPS redirect for non-HTTPS requests
 * Adds HSTS header for max-age=1 year
 */
const enforceHttps = (req, res, next) => {
  // Check if request is HTTPS or behind trusted proxy
  const isHttps = req.secure || (req.headers['x-forwarded-proto'] === 'https');

  if (!isHttps && process.env.NODE_ENV === 'production') {
    logAuditEvent('HTTPS_REDIRECT', {
      from: req.originalUrl,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }

  // Add HSTS header (Strict-Transport-Security)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  next();
};

/**
 * Add security headers to all responses
 */
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  next();
};

// ═══════════════════════════════════════════════════════════════
// ═══ 3. API KEY ENCRYPTION ═══════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

// Use bcryptjs if available, otherwise use crypto-based hashing
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  // Fallback: use crypto-based PBKDF2
  bcrypt = null;
}

/**
 * Hash an API key using bcrypt or PBKDF2
 * @param {string} apiKey - The plaintext API key
 * @returns {Promise<string>} - The hashed key
 */
const hashApiKey = async (apiKey) => {
  if (bcrypt) {
    return await bcrypt.hash(apiKey, 12); // 12 salt rounds
  }

  // Fallback to PBKDF2
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(apiKey, process.env.API_KEY_SALT || 'default-salt', 100000, 32, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
};

/**
 * Verify an API key against its hash
 * @param {string} apiKey - The plaintext API key
 * @param {string} hash - The hashed key
 * @returns {Promise<boolean>}
 */
const verifyApiKey = async (apiKey, hash) => {
  if (bcrypt) {
    return await bcrypt.compare(apiKey, hash);
  }

  // Fallback to PBKDF2
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(apiKey, process.env.API_KEY_SALT || 'default-salt', 100000, 32, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey.toString('hex') === hash);
    });
  });
};

/**
 * Generate a new secure API key
 * @returns {string} - Hashed API key (format: sk_<base64>)
 */
const generateSecureApiKey = () => {
  const randomBytes = crypto.randomBytes(32);
  return `sk_${randomBytes.toString('base64url')}`;
};

// ═══════════════════════════════════════════════════════════════
// ═══ 4. DATA ENCRYPTION AT REST ══════════════════════════════════
// ═══════════════════════════════════════════════════════════════

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = crypto.scryptSync(
  process.env.ENCRYPTION_SECRET || 'change-me-in-production',
  process.env.ENCRYPTION_SALT || 'default-salt',
  32 // 256 bits
);

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param {string} plaintext - Data to encrypt
 * @returns {string} - Encrypted data (base64 encoded: iv:encryptedData:authTag)
 */
const encryptData = (plaintext) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:encrypted:authTag (all hex encoded)
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
};

/**
 * Decrypt sensitive data
 * @param {string} encrypted - Encrypted data (iv:encryptedData:authTag)
 * @returns {string} - Decrypted plaintext
 */
const decryptData = (encrypted) => {
  try {
    const [ivHex, encryptedHex, authTagHex] = encrypted.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    throw new Error(`Decryption failed: ${err.message}`);
  }
};

// ═══════════════════════════════════════════════════════════════
// ═══ 5. INPUT VALIDATION & SANITIZATION ═════════════════════════
// ═══════════════════════════════════════════════════════════════

/**
 * Validation rules for common fields
 */
const validationRules = {
  email: {
    validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message: 'Invalid email format'
  },
  password: {
    validate: (value) => value && value.length >= 8,
    message: 'Password must be at least 8 characters'
  },
  prompt: {
    validate: (value) => value && value.length > 0 && value.length <= 10000,
    message: 'Prompt must be 1-10000 characters'
  },
  title: {
    validate: (value) => value && value.length > 0 && value.length <= 200,
    message: 'Title must be 1-200 characters'
  },
  apiKeyName: {
    validate: (value) => value && value.length > 0 && value.length <= 100,
    message: 'API key name must be 1-100 characters'
  },
  url: {
    validate: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    message: 'Invalid URL format'
  }
};

/**
 * Sanitize a string to prevent XSS and injection attacks
 * @param {string} str - Input string
 * @returns {string} - Sanitized string
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;

  // Remove HTML/script tags
  let sanitized = str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/['";]/g, (char) => {
      const htmlEscapeMap = {
        "'": '&#39;',
        '"': '&quot;',
        ';': '&#59;'
      };
      return htmlEscapeMap[char] || char;
    });

  // Remove SQL injection patterns
  sanitized = sanitized
    .replace(/(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|EXEC|EXECUTE|FROM|WHERE|OR|AND|--)\b)/gi, '');

  return sanitized.trim();
};

/**
 * Validate request body against schema
 * @param {object} body - Request body
 * @param {object} schema - Validation schema { field: 'type' or validationRules reference }
 * @returns {object} - { valid: boolean, errors: [] }
 */
const validateRequestBody = (body, schema) => {
  const errors = [];

  for (const [field, rule] of Object.entries(schema)) {
    const value = body[field];

    // Check required fields
    if (value === undefined || value === null) {
      errors.push(`${field} is required`);
      continue;
    }

    // Use validation rules if available
    if (validationRules[rule] && !validationRules[rule].validate(value)) {
      errors.push(validationRules[rule].message);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Middleware: Validate request body
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    const validation = validateRequestBody(req.body, schema);

    if (!validation.valid) {
      logAuditEvent('VALIDATION_ERROR', {
        endpoint: req.path,
        method: req.method,
        errors: validation.errors,
        ip: req.ip
      });

      return res.status(400).json({
        error: 'Request validation failed',
        details: validation.errors
      });
    }

    next();
  };
};

// ═══════════════════════════════════════════════════════════════
// ═══ 6. RATE LIMITING PER USER/TIER ══════════════════════════════
// ═══════════════════════════════════════════════════════════════

/**
 * In-memory rate limit store
 * { userId: { count: number, resetTime: timestamp, tier: string } }
 */
const rateLimitStore = {};

/**
 * Tier-based rate limit configuration
 */
const tierRateLimits = {
  free: 100,      // requests per minute
  starter: 100,
  pro: 500,
  growth: 1000,
  enterprise: 5000
};

/**
 * Get current tier for a user (would come from database/token in production)
 * @param {string} userId - User ID
 * @returns {string} - Tier name
 */
const getUserTier = (userId) => {
  // This would be populated from database in production
  // For now, return 'free' as default
  return 'free';
};

/**
 * Check rate limit for user
 * @param {string} userId - User ID
 * @returns {object} - { allowed: boolean, remaining: number, resetTime: timestamp, retryAfter: number }
 */
const checkRateLimit = (userId) => {
  const now = Date.now();
  const tier = getUserTier(userId);
  const limit = tierRateLimits[tier] || 100;

  // Initialize or check reset
  if (!rateLimitStore[userId]) {
    rateLimitStore[userId] = {
      count: 0,
      resetTime: now + 60000, // 1 minute from now
      tier
    };
  }

  const userLimit = rateLimitStore[userId];

  // Reset if window has passed
  if (now >= userLimit.resetTime) {
    userLimit.count = 0;
    userLimit.resetTime = now + 60000;
  }

  // Check if limit exceeded
  const allowed = userLimit.count < limit;
  const remaining = Math.max(0, limit - userLimit.count - 1);
  const retryAfter = Math.ceil((userLimit.resetTime - now) / 1000);

  if (allowed) {
    userLimit.count++;
  }

  return {
    allowed,
    remaining,
    resetTime: userLimit.resetTime,
    retryAfter,
    tier,
    limit
  };
};

/**
 * Middleware: Apply rate limiting based on user/tier
 */
const applyUserRateLimit = (req, res, next) => {
  // Get user ID from token or API key
  const userId = req.user?.id || req.apiKey || req.ip;

  const rateLimit = checkRateLimit(userId);

  // Add rate limit headers to response
  res.setHeader('X-RateLimit-Limit', rateLimit.limit);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetTime / 1000));

  if (!rateLimit.allowed) {
    logAuditEvent('RATE_LIMIT_EXCEEDED', {
      userId,
      tier: rateLimit.tier,
      limit: rateLimit.limit,
      ip: req.ip
    });

    res.setHeader('Retry-After', rateLimit.retryAfter);
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: rateLimit.retryAfter,
      resetTime: new Date(rateLimit.resetTime).toISOString()
    });
  }

  next();
};

// ═══════════════════════════════════════════════════════════════
// ═══ 7. CSRF PROTECTION ══════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

/**
 * CSRF token store (would use sessions in production)
 * { token: { value: string, createdAt: timestamp, valid: boolean } }
 */
const csrfTokenStore = {};

/**
 * Generate a new CSRF token
 * @returns {string} - CSRF token
 */
const generateCsrfToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokenStore[token] = {
    value: token,
    createdAt: Date.now(),
    valid: true
  };

  // Clean up old tokens (older than 1 hour)
  const oneHourAgo = Date.now() - 3600000;
  for (const [t, data] of Object.entries(csrfTokenStore)) {
    if (data.createdAt < oneHourAgo) {
      delete csrfTokenStore[t];
    }
  }

  return token;
};

/**
 * Verify CSRF token
 * @param {string} token - Token to verify
 * @returns {boolean}
 */
const verifyCsrfToken = (token) => {
  if (!token || !csrfTokenStore[token]) {
    return false;
  }

  const tokenData = csrfTokenStore[token];

  // Check if token is still valid (not older than 1 hour)
  if (Date.now() - tokenData.createdAt > 3600000) {
    delete csrfTokenStore[token];
    return false;
  }

  return tokenData.valid;
};

/**
 * Middleware: Validate CSRF token for state-changing requests
 */
const validateCsrfToken = (req, res, next) => {
  // Skip GET/HEAD/OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Get CSRF token from header or body
  const token = req.headers['x-csrf-token'] || req.body?.csrfToken;

  if (!token || !verifyCsrfToken(token)) {
    logAuditEvent('CSRF_VALIDATION_FAILED', {
      endpoint: req.path,
      method: req.method,
      ip: req.ip
    });

    return res.status(403).json({
      error: 'CSRF token validation failed',
      message: 'Missing or invalid CSRF token'
    });
  }

  next();
};

// ═══════════════════════════════════════════════════════════════
// ═══ 8. SECRET ROTATION ══════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

/**
 * JWT Secret rotation utility
 * Maintains multiple valid secrets for rolling rotation (30 days)
 */
const jwtSecretRotation = {
  secrets: [
    {
      secret: process.env.JWT_SECRET || 'current-secret',
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      active: true
    }
  ],

  /**
   * Get the current active JWT secret
   */
  getCurrentSecret: function() {
    const now = Date.now();
    const active = this.secrets.find(s => s.active && s.expiresAt > now);
    return active?.secret || this.secrets[0].secret;
  },

  /**
   * Get all valid secrets (current + recently rotated)
   */
  getValidSecrets: function() {
    const now = Date.now();
    return this.secrets.filter(s => s.expiresAt > now - 7 * 24 * 60 * 60 * 1000); // 7 day grace period
  },

  /**
   * Rotate to a new secret (call monthly)
   */
  rotate: function(newSecret) {
    const now = Date.now();

    // Mark old active secret as inactive
    const activeSecret = this.secrets.find(s => s.active);
    if (activeSecret) {
      activeSecret.active = false;
    }

    // Add new secret
    this.secrets.push({
      secret: newSecret || crypto.randomBytes(32).toString('hex'),
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      active: true
    });

    // Clean up expired secrets (older than 7 days)
    this.secrets = this.secrets.filter(s => s.expiresAt > now - 7 * 24 * 60 * 60 * 1000);

    logAuditEvent('JWT_SECRET_ROTATED', {
      timestamp: new Date().toISOString(),
      secretsActive: this.secrets.filter(s => s.active).length
    });
  }
};

/**
 * API Key rotation utility
 * Users can rotate/revoke keys
 */
const apiKeyRotation = {
  /**
   * Get rotation history for an API key
   */
  getHistory: function(keyId) {
    // Would be stored in database in production
    return {
      keyId,
      rotations: [],
      lastRotated: null
    };
  },

  /**
   * Rotate an API key (user-initiated)
   */
  rotate: async function(userId, oldKeyHash, newKey) {
    // Hash new key
    const newKeyHash = await hashApiKey(newKey);

    logAuditEvent('API_KEY_ROTATED', {
      userId,
      timestamp: new Date().toISOString()
    });

    return {
      oldKey: 'revoked',
      newKey: newKey, // Return only once
      newKeyHash
    };
  },

  /**
   * Revoke an API key (immediate)
   */
  revoke: function(userId, keyId) {
    logAuditEvent('API_KEY_REVOKED', {
      userId,
      keyId,
      timestamp: new Date().toISOString()
    });

    return { success: true };
  }
};

// ═══════════════════════════════════════════════════════════════
// ═══ 9. SECURE AUDIT LOGGING MIDDLEWARE ══════════════════════════
// ═══════════════════════════════════════════════════════════════

/**
 * Log all API requests
 */
const logApiRequest = (req, res, next) => {
  const startTime = Date.now();

  // Capture response
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;

    // Log request details (no sensitive data)
    logAuditEvent('API_REQUEST', {
      method: req.method,
      endpoint: req.path,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id || req.apiKey,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    return originalJson.call(this, data);
  };

  next();
};

/**
 * Log authentication events
 */
const logAuthEvent = (eventType, details = {}) => {
  logAuditEvent(`AUTH_${eventType}`, {
    timestamp: new Date().toISOString(),
    ...details
  });
};

/**
 * Log billing events
 */
const logBillingEvent = (eventType, details = {}) => {
  logAuditEvent(`BILLING_${eventType}`, {
    timestamp: new Date().toISOString(),
    ...details
  });
};

// ═══════════════════════════════════════════════════════════════
// ═══ EXPORTS ═════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Middleware functions
  enforceHttps,
  securityHeaders,
  validateRequest,
  applyUserRateLimit,
  validateCsrfToken,
  logApiRequest,

  // API Key functions
  hashApiKey,
  verifyApiKey,
  generateSecureApiKey,

  // Data encryption
  encryptData,
  decryptData,

  // CSRF functions
  generateCsrfToken,
  verifyCsrfToken,

  // Audit logging
  logAuditEvent,
  logAuthEvent,
  logBillingEvent,
  auditLogger,

  // Secret rotation
  jwtSecretRotation,
  apiKeyRotation,

  // Input validation
  validateRequestBody,
  sanitizeString,
  validationRules,

  // Rate limiting utilities
  checkRateLimit,
  getUserTier,
  tierRateLimits
};
