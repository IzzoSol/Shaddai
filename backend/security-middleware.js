/**
 * PIKADON SECURITY MIDDLEWARE
 * Production-grade security hardening for SHADDAI
 *
 * Implements:
 * - Request validation
 * - Rate limiting
 * - JWT verification
 * - CSRF protection
 * - Security headers
 * - Request tracking
 * - Audit logging
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// ════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  throw new Error('CRITICAL: JWT_SECRET environment variable must be set!');
})();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'https://shaddai.app',
  process.env.FRONTEND_URL
].filter(Boolean);

const MAX_REQUEST_SIZE = '1mb'; // Down from 50mb
const MAX_JSON_SIZE = '512kb';

// ════════════════════════════════════════════════════════════════
// AUDIT LOG SYSTEM
// ════════════════════════════════════════════════════════════════

class AuditLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 10000;
  }

  log(entry) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...entry
    };

    this.logs.push(auditEntry);

    // Keep logs bounded
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Always log to console for critical events
    if (['SECURITY_VIOLATION', 'AUTH_FAILURE', 'PRIVILEGE_ESCALATION'].includes(entry.type)) {
      console.error(`[AUDIT] ${entry.type}:`, {
        user: entry.userId,
        ip: entry.ipAddress,
        action: entry.action,
        resource: entry.resource,
        status: entry.status
      });
    }

    return auditEntry;
  }

  query(filters = {}) {
    return this.logs.filter(log => {
      for (const [key, value] of Object.entries(filters)) {
        if (log[key] !== value) return false;
      }
      return true;
    });
  }
}

const auditLogger = new AuditLogger();

// ════════════════════════════════════════════════════════════════
// REQUEST ID MIDDLEWARE
// ════════════════════════════════════════════════════════════════

const requestIdMiddleware = (req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.id);

  // Capture client IP
  req.clientIp = req.ip || req.connection.remoteAddress;

  // Log request start
  req.startTime = Date.now();

  // Log request
  console.log(`[${req.id}] ${req.method} ${req.path}`);

  next();
};

// ════════════════════════════════════════════════════════════════
// REQUEST VALIDATION MIDDLEWARE
// ════════════════════════════════════════════════════════════════

const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      // Validate content-type
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const contentType = req.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
          return res.status(400).json({
            error: 'Invalid Content-Type. Expected application/json',
            requestId: req.id
          });
        }
      }

      // Validate body against schema if provided
      if (schema && req.body) {
        const validation = validateSchema(req.body, schema);
        if (!validation.valid) {
          auditLogger.log({
            type: 'VALIDATION_ERROR',
            action: 'REQUEST_VALIDATION_FAILED',
            resource: req.path,
            userId: req.userId,
            ipAddress: req.clientIp,
            errors: validation.errors,
            status: 'REJECTED'
          });

          return res.status(400).json({
            error: 'Validation failed',
            details: validation.errors,
            requestId: req.id
          });
        }
      }

      next();
    } catch (error) {
      res.status(400).json({
        error: 'Request validation error',
        requestId: req.id
      });
    }
  };
};

/**
 * Schema validation helper
 * Simple schema validation (extend with Joi/Yup for production)
 */
const validateSchema = (data, schema) => {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    // Required field
    if (rules.required && (value === undefined || value === null)) {
      errors.push(`${field} is required`);
      continue;
    }

    // Type check
    if (value !== undefined && value !== null && rules.type) {
      if (typeof value !== rules.type) {
        errors.push(`${field} must be ${rules.type}`);
        continue;
      }
    }

    // Max length
    if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
      errors.push(`${field} must not exceed ${rules.maxLength} characters`);
    }

    // Min length
    if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
      errors.push(`${field} must be at least ${rules.minLength} characters`);
    }

    // Pattern (regex)
    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push(`${field} format is invalid`);
    }

    // Enum
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

// ════════════════════════════════════════════════════════════════
// RATE LIMITING MIDDLEWARE
// ════════════════════════════════════════════════════════════════

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.clientIp || req.ip,
  skip: (req) => process.env.NODE_ENV === 'development',
  onLimitReached: (req) => {
    auditLogger.log({
      type: 'RATE_LIMIT_EXCEEDED',
      action: 'API_RATE_LIMIT',
      resource: req.path,
      ipAddress: req.clientIp,
      status: 'BLOCKED'
    });
  }
});

// Strict rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Strict: 5 attempts per 15 minutes
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by email + IP combination
    const email = req.body?.email || '';
    return `${req.clientIp}-${email}`;
  },
  onLimitReached: (req) => {
    auditLogger.log({
      type: 'SECURITY_VIOLATION',
      action: 'BRUTE_FORCE_ATTEMPT',
      resource: req.path,
      userId: req.body?.email,
      ipAddress: req.clientIp,
      status: 'BLOCKED'
    });
  }
});

// Billing operations rate limiter
const billingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 billing operations per hour
  message: 'Too many billing operations, please try again later',
  keyGenerator: (req) => req.userId || req.clientIp
});

// ════════════════════════════════════════════════════════════════
// CSRF PROTECTION MIDDLEWARE
// ════════════════════════════════════════════════════════════════

const csrfTokens = new Map(); // Store CSRF tokens (use Redis in production)

const generateCSRFToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const csrfProtection = (req, res, next) => {
  // GET requests: Generate and return CSRF token
  if (req.method === 'GET') {
    const token = generateCSRFToken();
    csrfTokens.set(token, {
      createdAt: Date.now(),
      ip: req.clientIp,
      expiresIn: 1000 * 60 * 60 // 1 hour
    });

    res.setHeader('x-csrf-token', token);
    req.csrfToken = token;
    return next();
  }

  // POST/PUT/PATCH/DELETE requests: Verify CSRF token
  const token = req.headers['x-csrf-token'];

  if (!token) {
    auditLogger.log({
      type: 'SECURITY_VIOLATION',
      action: 'MISSING_CSRF_TOKEN',
      resource: req.path,
      userId: req.userId,
      ipAddress: req.clientIp,
      status: 'REJECTED'
    });

    return res.status(403).json({
      error: 'CSRF token missing',
      requestId: req.id
    });
  }

  const tokenData = csrfTokens.get(token);

  if (!tokenData) {
    auditLogger.log({
      type: 'SECURITY_VIOLATION',
      action: 'INVALID_CSRF_TOKEN',
      resource: req.path,
      userId: req.userId,
      ipAddress: req.clientIp,
      status: 'REJECTED'
    });

    return res.status(403).json({
      error: 'Invalid or expired CSRF token',
      requestId: req.id
    });
  }

  // Check token expiration
  if (Date.now() - tokenData.createdAt > tokenData.expiresIn) {
    csrfTokens.delete(token);

    auditLogger.log({
      type: 'SECURITY_VIOLATION',
      action: 'EXPIRED_CSRF_TOKEN',
      resource: req.path,
      userId: req.userId,
      ipAddress: req.clientIp,
      status: 'REJECTED'
    });

    return res.status(403).json({
      error: 'CSRF token expired',
      requestId: req.id
    });
  }

  // Verify IP matches (optional but recommended)
  if (tokenData.ip !== req.clientIp) {
    console.warn(`[CSRF] IP mismatch: token created from ${tokenData.ip}, request from ${req.clientIp}`);
  }

  // Token is valid - consume it
  csrfTokens.delete(token);
  next();
};

// ════════════════════════════════════════════════════════════════
// JWT VERIFICATION MIDDLEWARE
// ════════════════════════════════════════════════════════════════

const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Missing authorization token',
      requestId: req.id
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.uid;
    req.userEmail = decoded.email;
    req.userTier = decoded.tier;

    auditLogger.log({
      type: 'AUTH_SUCCESS',
      action: 'JWT_VERIFIED',
      resource: req.path,
      userId: req.userId,
      ipAddress: req.clientIp,
      status: 'ACCEPTED'
    });

    next();
  } catch (error) {
    auditLogger.log({
      type: 'AUTH_FAILURE',
      action: 'INVALID_JWT',
      resource: req.path,
      ipAddress: req.clientIp,
      error: error.message,
      status: 'REJECTED'
    });

    res.status(401).json({
      error: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      requestId: req.id
    });
  }
};

// ════════════════════════════════════════════════════════════════
// CORS HARDENING
// ════════════════════════════════════════════════════════════════

const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-csrf-token, x-request-id');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Access-Control-Expose-Headers', 'x-csrf-token, x-request-id, x-ratelimit-*');
  } else if (origin) {
    auditLogger.log({
      type: 'SECURITY_VIOLATION',
      action: 'CORS_REJECTION',
      resource: req.path,
      ipAddress: req.clientIp,
      detail: `Rejected origin: ${origin}`,
      status: 'BLOCKED'
    });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
};

// ════════════════════════════════════════════════════════════════
// SECURITY HEADERS MIDDLEWARE
// ════════════════════════════════════════════════════════════════

const securityHeaders = (req, res, next) => {
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.googleapis.com; connect-src 'self' localhost:*;"
  );

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Feature Policy / Permissions Policy
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=()'
  );

  // Strict Transport Security (if HTTPS)
  if (req.protocol === 'https') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // Disable caching for sensitive data
  if (req.path.includes('/api/auth') || req.path.includes('/api/billing')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
};

// ════════════════════════════════════════════════════════════════
// PATH TRAVERSAL PROTECTION
// ════════════════════════════════════════════════════════════════

const validatePath = (basePath) => {
  return (req, res, next) => {
    const filePath = require('path').resolve(basePath, req.params.name || '');
    const normalizedBase = require('path').resolve(basePath);

    if (!filePath.startsWith(normalizedBase)) {
      auditLogger.log({
        type: 'SECURITY_VIOLATION',
        action: 'PATH_TRAVERSAL_ATTEMPT',
        resource: req.path,
        userId: req.userId,
        ipAddress: req.clientIp,
        detail: `Attempted path: ${req.params.name}`,
        status: 'BLOCKED'
      });

      return res.status(403).json({
        error: 'Access denied',
        requestId: req.id
      });
    }

    req.validatedPath = filePath;
    next();
  };
};

// ════════════════════════════════════════════════════════════════
// INPUT SANITIZATION
// ════════════════════════════════════════════════════════════════

const sanitizeInput = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return String(obj)
      .replace(/[<>]/g, '') // Remove HTML brackets
      .replace(/['"`]/g, '') // Remove quotes
      .trim();
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = value
        .replace(/[<>]/g, '')
        .replace(/['"`]/g, '')
        .trim();
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeInput(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

const sanitizeMiddleware = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }
  next();
};

// ════════════════════════════════════════════════════════════════
// RESPONSE WRAPPER
// ════════════════════════════════════════════════════════════════

const responseMiddleware = (req, res, next) => {
  const originalJson = res.json;

  res.json = function(data) {
    // Add security headers to response
    res.setHeader('x-request-id', req.id);

    // Log response
    const duration = Date.now() - req.startTime;
    console.log(`[${req.id}] ${res.statusCode} ${duration}ms`);

    return originalJson.call(this, data);
  };

  next();
};

// ════════════════════════════════════════════════════════════════
// ERROR HANDLING MIDDLEWARE
// ════════════════════════════════════════════════════════════════

const errorHandler = (err, req, res, next) => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  auditLogger.log({
    type: 'ERROR',
    action: 'UNHANDLED_ERROR',
    resource: req.path,
    userId: req.userId,
    ipAddress: req.clientIp,
    error: isDevelopment ? err.message : 'Internal Server Error',
    status: 'ERROR'
  });

  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal Server Error',
    requestId: req.id,
    ...(isDevelopment && { stack: err.stack })
  });
};

// ════════════════════════════════════════════════════════════════
// SETUP FUNCTION
// ════════════════════════════════════════════════════════════════

const setupSecurityMiddleware = (app) => {
  // Apply middleware in order
  app.use(requestIdMiddleware);
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(helmet()); // Additional security headers

  // Request parsing with limits
  app.use(express.json({
    limit: MAX_JSON_SIZE,
    strict: true
  }));
  app.use(express.urlencoded({
    limit: MAX_JSON_SIZE,
    extended: false
  }));

  // Sanitization
  app.use(sanitizeMiddleware);

  // Rate limiting
  app.use('/api/', apiLimiter);

  // CSRF protection
  app.use(csrfProtection);

  // Response wrapper
  app.use(responseMiddleware);

  // Error handling (must be last)
  app.use(errorHandler);

  return { apiLimiter, authLimiter, billingLimiter };
};

// ════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════

module.exports = {
  // Setup
  setupSecurityMiddleware,

  // Individual middleware
  requestIdMiddleware,
  validateRequest,
  validateSchema,
  apiLimiter,
  authLimiter,
  billingLimiter,
  csrfProtection,
  csrfTokens,
  generateCSRFToken,
  verifyJWT,
  corsMiddleware,
  securityHeaders,
  validatePath,
  sanitizeInput,
  sanitizeMiddleware,
  responseMiddleware,
  errorHandler,

  // Audit logging
  auditLogger,
  AuditLogger
};
