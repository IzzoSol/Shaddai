/**
 * SHADDAI Authentication Routes
 * Express.js Routes for Firebase Auth Integration
 *
 * Routes:
 * POST   /auth/signup              - Register new user
 * POST   /auth/login               - Login and get tokens
 * POST   /auth/logout              - Logout and revoke session
 * POST   /auth/refresh-token       - Refresh access token
 * GET    /auth/profile             - Get user profile (requires auth)
 * POST   /auth/api-keys/generate   - Generate new API key
 * GET    /auth/api-keys            - List user's API keys
 * DELETE /auth/api-keys/:keyId     - Revoke API key
 * GET    /auth/verify              - Verify current token
 *
 * Middleware:
 * - verifyJWT: Validates access token from Authorization header
 * - errorHandler: Centralized error handling
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const authService = require('./auth-service');

const router = express.Router();

// ── RATE LIMITERS ──────────────────────────────────────────

// Strict rate limit for login attempts (5 per minute)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: 'Too many login attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body.email || req.ip, // Rate limit by email or IP
  skip: (req) => !req.body.email
});

// Moderate rate limit for signup (10 per minute per IP)
const signupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many signup attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// API key operations limit (20 per minute)
const apiKeyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: 'Too many API key operations. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// ── MIDDLEWARE ──────────────────────────────────────────────

/**
 * Verify JWT token middleware
 * Extracts token from Authorization header and validates it
 */
const verifyJWT = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header'
      });
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix

    // Verify token
    const decoded = require('jsonwebtoken').verify(
      token,
      require('./lib/jwt-secret')
    );

    // Attach user info to request
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      tier: decoded.tier
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please refresh your token.'
      });
    }

    return res.status(401).json({
      error: 'Invalid token',
      message: 'The provided token is invalid or malformed'
    });
  }
};

/**
 * Error handler wrapper for async route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ── ROUTES ──────────────────────────────────────────────────

/**
 * POST /auth/signup
 * Register a new user account
 *
 * Request Body:
 * {
 *   "email": "user@example.com",
 *   "password": "secure-password"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "uid": "user-id",
 *   "email": "user@example.com",
 *   "message": "Account created successfully"
 * }
 */
router.post('/signup', signupLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'Email and password are required'
    });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      error: 'Invalid email format',
      message: 'Please provide a valid email address'
    });
  }

  // Password validation
  if (password.length < 6) {
    return res.status(400).json({
      error: 'Weak password',
      message: 'Password must be at least 6 characters long'
    });
  }

  try {
    const result = await authService.signUp(email, password);

    res.status(201).json({
      success: true,
      uid: result.uid,
      email: result.email,
      createdAt: result.createdAt,
      message: result.message
    });
  } catch (err) {
    // Handle Firebase-specific errors
    if (err.message.includes('already registered')) {
      return res.status(409).json({
        error: 'Email already exists',
        message: 'This email address is already registered'
      });
    }

    res.status(400).json({
      error: 'Signup failed',
      message: err.message || 'Unable to create account'
    });
  }
}));

/**
 * POST /auth/login
 * Authenticate user and return JWT tokens
 *
 * Request Body:
 * {
 *   "email": "user@example.com",
 *   "password": "secure-password"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "accessToken": "eyJhbGciOiJIUzI1NiIs...",
 *   "refreshToken": "abc123def456...",
 *   "expiresIn": "1h",
 *   "user": {
 *     "uid": "user-id",
 *     "email": "user@example.com",
 *     "tier": "starter"
 *   }
 * }
 */
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'Email and password are required'
    });
  }

  try {
    const result = await authService.login(email, password);

    // Set secure, httpOnly refresh token cookie (optional but recommended)
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: {
        uid: result.uid,
        email: result.email,
        tier: result.tier
      }
    });
  } catch (err) {
    // Don't reveal whether email exists or not (security best practice)
    if (err.message.includes('Invalid email or password')) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
    }

    if (err.message.includes('Too many login attempts')) {
      return res.status(429).json({
        error: 'Rate limited',
        message: err.message
      });
    }

    if (err.message.includes('not active')) {
      return res.status(403).json({
        error: 'Account inactive',
        message: 'Your account has been deactivated'
      });
    }

    res.status(400).json({
      error: 'Login failed',
      message: err.message || 'Unable to authenticate'
    });
  }
}));

/**
 * POST /auth/logout
 * Logout user and invalidate refresh token
 *
 * Request Body:
 * {
 *   "refreshToken": "abc123def456..."
 * }
 *
 * Headers:
 * Authorization: Bearer <accessToken>
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Logged out successfully"
 * }
 */
router.post('/logout', verifyJWT, asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const { uid } = req.user;

  if (!refreshToken) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'Refresh token is required'
    });
  }

  try {
    const result = await authService.logout(uid, refreshToken);

    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: result.message
    });
  } catch (err) {
    res.status(400).json({
      error: 'Logout failed',
      message: err.message || 'Unable to logout'
    });
  }
}));

/**
 * POST /auth/refresh-token
 * Get a new access token using refresh token
 *
 * Request Body:
 * {
 *   "refreshToken": "abc123def456...",
 *   "uid": "user-id"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "accessToken": "eyJhbGciOiJIUzI1NiIs...",
 *   "expiresIn": "1h",
 *   "tokenType": "Bearer"
 * }
 */
router.post('/refresh-token', asyncHandler(async (req, res) => {
  const { refreshToken, uid } = req.body;

  if (!refreshToken || !uid) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'Refresh token and user ID are required'
    });
  }

  try {
    const result = await authService.refreshAccessToken(uid, refreshToken);

    res.json({
      success: true,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: result.tokenType
    });
  } catch (err) {
    if (err.message.includes('expired') || err.message.includes('not found')) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'Please login again'
      });
    }

    res.status(400).json({
      error: 'Token refresh failed',
      message: err.message || 'Unable to refresh token'
    });
  }
}));

/**
 * GET /auth/profile
 * Get current user's profile information
 *
 * Headers:
 * Authorization: Bearer <accessToken>
 *
 * Response:
 * {
 *   "success": true,
 *   "user": {
 *     "uid": "user-id",
 *     "email": "user@example.com",
 *     "tier": "starter",
 *     "status": "active",
 *     "createdAt": "2024-04-18T10:30:00Z",
 *     "lastLogin": "2024-04-18T10:30:00Z"
 *   }
 * }
 */
router.get('/profile', verifyJWT, asyncHandler(async (req, res) => {
  const { uid } = req.user;

  try {
    const userProfile = await authService.getUserProfile(uid);

    res.json({
      success: true,
      user: userProfile
    });
  } catch (err) {
    res.status(404).json({
      error: 'User not found',
      message: err.message
    });
  }
}));

/**
 * GET /auth/verify
 * Verify current access token is valid
 *
 * Headers:
 * Authorization: Bearer <accessToken>
 *
 * Response:
 * {
 *   "valid": true,
 *   "user": {
 *     "uid": "user-id",
 *     "email": "user@example.com",
 *     "tier": "starter"
 *   }
 * }
 */
router.get('/verify', verifyJWT, (req, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// ── API KEY ROUTES ─────────────────────────────────────────

/**
 * POST /auth/api-keys/generate
 * Generate a new API key for the authenticated user
 *
 * Headers:
 * Authorization: Bearer <accessToken>
 *
 * Request Body:
 * {
 *   "name": "Production API Key"  // optional
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "apiKey": "sk_abc123def456...",
 *   "keyId": "key-uuid",
 *   "name": "Production API Key",
 *   "createdAt": "2024-04-18T10:30:00Z",
 *   "message": "Store this key safely. You will not see it again."
 * }
 */
router.post('/api-keys/generate', verifyJWT, apiKeyLimiter, asyncHandler(async (req, res) => {
  const { uid } = req.user;
  const { name } = req.body;

  try {
    const result = await authService.generateAPIKey(uid, name || 'API Key');

    res.status(201).json({
      success: true,
      apiKey: result.apiKey,
      keyId: result.keyId,
      name: result.name,
      createdAt: result.createdAt,
      expiresAt: result.expiresAt,
      message: result.message
    });
  } catch (err) {
    res.status(400).json({
      error: 'Failed to generate API key',
      message: err.message || 'Unable to create API key'
    });
  }
}));

/**
 * GET /auth/api-keys
 * List all API keys for the authenticated user
 *
 * Headers:
 * Authorization: Bearer <accessToken>
 *
 * Response:
 * {
 *   "success": true,
 *   "keys": [
 *     {
 *       "keyId": "key-uuid",
 *       "name": "Production API Key",
 *       "createdAt": "2024-04-18T10:30:00Z",
 *       "active": true,
 *       "lastUsed": "2024-04-18T12:00:00Z",
 *       "maskedKey": "sk_...abc123"
 *     }
 *   ],
 *   "count": 1
 * }
 */
router.get('/api-keys', verifyJWT, asyncHandler(async (req, res) => {
  const { uid } = req.user;

  try {
    const result = await authService.listAPIKeys(uid);

    res.json({
      success: true,
      keys: result.keys,
      count: result.count
    });
  } catch (err) {
    res.status(400).json({
      error: 'Failed to list API keys',
      message: err.message
    });
  }
}));

/**
 * DELETE /auth/api-keys/:keyId
 * Revoke an API key
 *
 * Headers:
 * Authorization: Bearer <accessToken>
 *
 * URL Parameters:
 * keyId - The ID of the API key to revoke
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "API key revoked successfully"
 * }
 */
router.delete('/api-keys/:keyId', verifyJWT, apiKeyLimiter, asyncHandler(async (req, res) => {
  const { uid } = req.user;
  const { keyId } = req.params;

  if (!keyId) {
    return res.status(400).json({
      error: 'Missing required parameters',
      message: 'Key ID is required'
    });
  }

  try {
    const result = await authService.revokeAPIKey(uid, keyId);

    res.json({
      success: true,
      message: result.message
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({
        error: 'API key not found',
        message: 'The specified API key does not exist'
      });
    }

    res.status(400).json({
      error: 'Failed to revoke API key',
      message: err.message
    });
  }
}));

// ── ERROR HANDLING ─────────────────────────────────────────

/**
 * Global error handler
 */
router.use((err, req, res, next) => {
  console.error('Auth route error:', err);

  if (err.status) {
    return res.status(err.status).json({
      error: err.type || 'Error',
      message: err.message
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// ── EXPORTS ──────────────────────────────────────────────────

module.exports = router;
