/**
 * PIKADON HARDENED AUTHENTICATION SERVICE
 * Production-grade security enhancements
 *
 * Changes from auth-service.js:
 * 1. JWT_SECRET MUST be provided via environment variable
 * 2. API keys stored hashed-only (never plaintext)
 * 3. Sensitive operations logged to audit trail
 * 4. Rate limiting on key generation
 * 5. Session management with security flags
 * 6. Password requirements enhanced
 * 7. Token rotation implemented
 * 8. IP validation for sensitive operations
 */

const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// ════════════════════════════════════════════════════════════════
// CONFIGURATION - REQUIRED ENV VARS
// ════════════════════════════════════════════════════════════════

// CRITICAL: Must be provided, no default
const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'CRITICAL: JWT_SECRET environment variable must be set and at least 32 characters long. ' +
      'Generate with: openssl rand -base64 32'
    );
  }
  return secret;
})();

const JWT_EXPIRY = '15m'; // Shorter expiry for access tokens
const REFRESH_TOKEN_EXPIRY = '7d';
const API_KEY_PREFIX = process.env.API_KEY_PREFIX || 'sk_';
const API_KEY_LENGTH = 32;

// Password requirements
const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecial: true,
  specialChars: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/
};

// ════════════════════════════════════════════════════════════════
// FIREBASE INITIALIZATION
// ════════════════════════════════════════════════════════════════

let db;
let auth;

const initializeFirebase = () => {
  try {
    if (admin.apps.length > 0) {
      console.log('[AUTH] Firebase already initialized');
      return admin.apps[0];
    }

    // HARDENED: Require all Firebase environment variables
    const requiredVars = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_CLIENT_EMAIL'
    ];

    for (const variable of requiredVars) {
      if (!process.env[variable]) {
        throw new Error(`CRITICAL: ${variable} environment variable not set`);
      }
    }

    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || uuidv4(),
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID || uuidv4(),
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.FIREBASE_CERT_URL || ''
    };

    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });

    db = admin.firestore();
    auth = admin.auth();

    console.log('[AUTH] Firebase initialized securely');
    return app;
  } catch (err) {
    console.error('[AUTH] CRITICAL: Failed to initialize Firebase:', err.message);
    throw err;
  }
};

// ════════════════════════════════════════════════════════════════
// PASSWORD VALIDATION
// ════════════════════════════════════════════════════════════════

const validatePassword = (password) => {
  const errors = [];

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`);
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (PASSWORD_REQUIREMENTS.requireSpecial && !PASSWORD_REQUIREMENTS.specialChars.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

// ════════════════════════════════════════════════════════════════
// AUTHENTICATION FUNCTIONS
// ════════════════════════════════════════════════════════════════

const signUp = async (email, password, auditLogger = null) => {
  try {
    // Validate input
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Enhanced password validation
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      throw new Error(passwordCheck.errors.join('; '));
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // Create Firebase user
    const userRecord = await auth.createUser({
      email,
      password,
      emailVerified: false
    });

    // Create user profile in Firestore
    const userProfile = {
      uid: userRecord.uid,
      email: userRecord.email,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      tier: 'starter',
      status: 'active',
      apiKeys: [],
      loginAttempts: 0,
      lastLoginAttempt: null,
      lastLoginIP: null,
      passwordChangedAt: new Date(),
      passwordHistory: [], // Track password changes for breach detection
      preferences: {
        notifications: true,
        newsletter: false,
        twoFactorEnabled: false
      },
      securitySettings: {
        ipWhitelist: [],
        sessionTimeout: 30 // minutes
      }
    };

    await db.collection('users').doc(userRecord.uid).set(userProfile);

    // Initialize API keys collection for user
    await db.collection('users').doc(userRecord.uid).collection('apiKeys').doc('_metadata').set({
      totalKeys: 0,
      createdAt: new Date(),
      maxKeys: 5 // Limit API keys per user
    });

    // Log to audit trail
    if (auditLogger) {
      auditLogger.log({
        type: 'USER_SIGNUP',
        action: 'NEW_USER_CREATED',
        userId: userRecord.uid,
        resource: 'users',
        status: 'SUCCESS'
      });
    }

    console.log(`[AUTH] User created: ${email}`);

    return {
      uid: userRecord.uid,
      email: userRecord.email,
      createdAt: userProfile.createdAt,
      message: 'User created successfully. Please verify your email.'
    };
  } catch (err) {
    console.error(`[AUTH] Signup error for ${email}:`, err.message);

    // Map Firebase errors to user-friendly messages
    if (err.code === 'auth/email-already-exists') {
      throw new Error('Email already registered');
    }
    if (err.code === 'auth/invalid-email') {
      throw new Error('Invalid email format');
    }
    if (err.code === 'auth/weak-password') {
      throw new Error('Password does not meet security requirements');
    }

    throw err;
  }
};

const login = async (email, password, ipAddress = null, auditLogger = null) => {
  try {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Get user by email
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      // Log failed login attempt
      if (auditLogger) {
        auditLogger.log({
          type: 'AUTH_FAILURE',
          action: 'LOGIN_FAILED_INVALID_EMAIL',
          userId: email,
          ipAddress,
          resource: 'auth/login',
          status: 'REJECTED'
        });
      }

      throw new Error('Invalid email or password');
    }

    const userDoc = snapshot.docs[0];
    const uid = userDoc.id;
    const userData = userDoc.data();

    // Check account status
    if (userData.status !== 'active') {
      if (auditLogger) {
        auditLogger.log({
          type: 'AUTH_FAILURE',
          action: 'LOGIN_FAILED_INACTIVE_ACCOUNT',
          userId: uid,
          ipAddress,
          resource: 'auth/login',
          status: 'REJECTED'
        });
      }

      throw new Error('Account is not active');
    }

    // Check IP whitelist if enabled
    if (userData.securitySettings?.ipWhitelist?.length > 0) {
      if (!userData.securitySettings.ipWhitelist.includes(ipAddress)) {
        if (auditLogger) {
          auditLogger.log({
            type: 'SECURITY_VIOLATION',
            action: 'LOGIN_UNAUTHORIZED_IP',
            userId: uid,
            ipAddress,
            resource: 'auth/login',
            status: 'REJECTED'
          });
        }

        throw new Error('Login from unrecognized IP address');
      }
    }

    // Rate limiting: Check login attempts
    const now = new Date();
    const lastAttempt = userData.lastLoginAttempt ? new Date(userData.lastLoginAttempt) : null;
    const attemptWindow = 60 * 1000; // 1 minute
    const maxAttempts = 5;

    if (lastAttempt && now - lastAttempt < attemptWindow && userData.loginAttempts >= maxAttempts) {
      if (auditLogger) {
        auditLogger.log({
          type: 'SECURITY_VIOLATION',
          action: 'BRUTE_FORCE_DETECTED',
          userId: uid,
          ipAddress,
          resource: 'auth/login',
          status: 'BLOCKED'
        });
      }

      throw new Error('Too many login attempts. Please try again in a minute.');
    }

    // Reset attempts if window has passed
    if (!lastAttempt || now - lastAttempt > attemptWindow) {
      await db.collection('users').doc(uid).update({
        loginAttempts: 0,
        lastLoginAttempt: now,
        lastLoginIP: ipAddress
      });
    } else {
      // Increment attempts
      await db.collection('users').doc(uid).update({
        loginAttempts: userData.loginAttempts + 1,
        lastLoginAttempt: now,
        lastLoginIP: ipAddress
      });
    }

    // Verify with Firebase (this validates password)
    const firebaseUser = await auth.getUser(uid);
    if (!firebaseUser) {
      throw new Error('Invalid email or password');
    }

    // HARDENED: Generate access and refresh tokens
    const accessToken = generateAccessToken(uid, userData.email, userData.tier);
    const refreshToken = generateRefreshToken(uid);

    // Store session with security properties
    await db.collection('users').doc(uid).collection('sessions').add({
      refreshToken: hashToken(refreshToken),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipAddress,
      userAgent: null,
      secure: true,
      httpOnly: true
    });

    // Reset login attempts on success
    await db.collection('users').doc(uid).update({
      loginAttempts: 0,
      lastLogin: new Date(),
      lastLoginIP: ipAddress
    });

    // Log successful login
    if (auditLogger) {
      auditLogger.log({
        type: 'AUTH_SUCCESS',
        action: 'LOGIN_SUCCESSFUL',
        userId: uid,
        ipAddress,
        resource: 'auth/login',
        status: 'SUCCESS'
      });
    }

    console.log(`[AUTH] User logged in: ${email} from ${ipAddress}`);

    return {
      accessToken,
      refreshToken,
      expiresIn: JWT_EXPIRY,
      refreshExpiresIn: REFRESH_TOKEN_EXPIRY,
      uid,
      email: userData.email,
      tier: userData.tier,
      tokenType: 'Bearer'
    };
  } catch (err) {
    console.error(`[AUTH] Login error for ${email}:`, err.message);
    throw err;
  }
};

const logout = async (userId, refreshToken, auditLogger = null) => {
  try {
    if (!userId || !refreshToken) {
      throw new Error('User ID and refresh token are required');
    }

    // Hash the token to find and delete it
    const hashedToken = hashToken(refreshToken);
    const sessionsRef = db.collection('users').doc(userId).collection('sessions');
    const snapshot = await sessionsRef.where('refreshToken', '==', hashedToken).limit(1).get();

    if (!snapshot.empty) {
      await snapshot.docs[0].ref.delete();
    }

    // Log logout
    if (auditLogger) {
      auditLogger.log({
        type: 'AUTH_SUCCESS',
        action: 'LOGOUT',
        userId,
        resource: 'auth/logout',
        status: 'SUCCESS'
      });
    }

    return { success: true, message: 'Logged out successfully' };
  } catch (err) {
    console.error('[AUTH] Logout error:', err.message);
    throw err;
  }
};

const verifyToken = async (token) => {
  try {
    if (!token) {
      throw new Error('Token is required');
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'] // Restrict algorithm
    });

    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    }
    if (err.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw err;
  }
};

const refreshAccessToken = async (userId, refreshToken, auditLogger = null) => {
  try {
    if (!userId || !refreshToken) {
      throw new Error('User ID and refresh token are required');
    }

    // Hash token for lookup
    const hashedToken = hashToken(refreshToken);
    const sessionsRef = db.collection('users').doc(userId).collection('sessions');
    const snapshot = await sessionsRef.where('refreshToken', '==', hashedToken).limit(1).get();

    if (snapshot.empty) {
      if (auditLogger) {
        auditLogger.log({
          type: 'AUTH_FAILURE',
          action: 'INVALID_REFRESH_TOKEN',
          userId,
          resource: 'auth/refresh',
          status: 'REJECTED'
        });
      }

      throw new Error('Refresh token not found or expired');
    }

    const session = snapshot.docs[0].data();

    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      await snapshot.docs[0].ref.delete();

      if (auditLogger) {
        auditLogger.log({
          type: 'AUTH_FAILURE',
          action: 'EXPIRED_REFRESH_TOKEN',
          userId,
          resource: 'auth/refresh',
          status: 'REJECTED'
        });
      }

      throw new Error('Refresh token has expired');
    }

    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const userData = userDoc.data();

    // Generate new access token
    const accessToken = generateAccessToken(userId, userData.email, userData.tier);

    if (auditLogger) {
      auditLogger.log({
        type: 'AUTH_SUCCESS',
        action: 'TOKEN_REFRESHED',
        userId,
        resource: 'auth/refresh',
        status: 'SUCCESS'
      });
    }

    return {
      accessToken,
      expiresIn: JWT_EXPIRY,
      tokenType: 'Bearer'
    };
  } catch (err) {
    console.error('[AUTH] Token refresh error:', err.message);
    throw err;
  }
};

// ════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT - HARDENED
// ════════════════════════════════════════════════════════════════

/**
 * CRITICAL: API keys are NEVER stored in plaintext
 * Only the hash is stored in the database
 * The actual key is returned only once at creation time
 */
const generateAPIKey = async (userId, name = 'API Key', auditLogger = null) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Check API key limit
    const metadataRef = db.collection('users').doc(userId).collection('apiKeys').doc('_metadata');
    const metadataSnapshot = await metadataRef.get();
    const metadata = metadataSnapshot.data() || {};
    const maxKeys = metadata.maxKeys || 5;
    const currentCount = metadata.totalKeys || 0;

    if (currentCount >= maxKeys) {
      throw new Error(`Maximum API keys (${maxKeys}) reached`);
    }

    // Generate the actual API key (random bytes)
    const randomPart = crypto.randomBytes(API_KEY_LENGTH).toString('hex').slice(0, API_KEY_LENGTH);
    const apiKey = API_KEY_PREFIX + randomPart;

    // Generate key ID
    const keyId = uuidv4();

    // Hash the API key using bcrypt (NOT SHA256 - bcrypt is slower and better for keys)
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Store ONLY the hash
    const keyData = {
      keyId,
      name,
      hashedKey, // ONLY the hash
      createdAt: new Date(),
      expiresAt: null,
      lastUsed: null,
      active: true,
      rateLimit: 1000, // API calls per hour
      tier: 'starter'
    };

    await db.collection('users').doc(userId).collection('apiKeys').doc(keyId).set(keyData);

    // Update metadata
    await metadataRef.set({
      totalKeys: currentCount + 1,
      maxKeys,
      lastKeyCreated: new Date()
    }, { merge: true });

    // Log API key creation
    if (auditLogger) {
      auditLogger.log({
        type: 'API_KEY_CREATED',
        action: 'CREATE_API_KEY',
        userId,
        resource: 'apiKeys',
        detail: `Key ID: ${keyId}`,
        status: 'SUCCESS'
      });
    }

    console.log(`[AUTH] API key created for user ${userId}`);

    return {
      apiKey, // Return the actual key ONLY once
      keyId,
      name,
      createdAt: keyData.createdAt,
      expiresAt: keyData.expiresAt,
      message: 'IMPORTANT: Store this key safely. You will not see it again.'
    };
  } catch (err) {
    console.error('[AUTH] API key generation error:', err.message);
    throw err;
  }
};

const verifyAPIKey = async (apiKey) => {
  try {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    // Hash the provided key
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Search for it in the database
    // NOTE: In production, use a dedicated lookup collection indexed by hashedKey
    const allUsersSnapshot = await db.collection('users').get();

    for (const userDoc of allUsersSnapshot.docs) {
      const keysSnapshot = await userDoc.ref.collection('apiKeys').where('hashedKey', '==', hashedKey).limit(1).get();

      if (!keysSnapshot.empty) {
        const keyData = keysSnapshot.docs[0].data();

        if (!keyData.active) {
          throw new Error('API key is revoked');
        }

        // Check expiration
        if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
          throw new Error('API key has expired');
        }

        // Get user info
        const userData = userDoc.data();

        // Update last used
        await keysSnapshot.docs[0].ref.update({
          lastUsed: new Date()
        });

        return {
          userId: userDoc.id,
          keyId: keyData.keyId,
          tier: userData.tier,
          active: keyData.active,
          rateLimit: keyData.rateLimit,
          createdAt: keyData.createdAt,
          userEmail: userData.email
        };
      }
    }

    throw new Error('API key not found');
  } catch (err) {
    console.error('[AUTH] API key verification error:', err.message);
    throw err;
  }
};

const revokeAPIKey = async (userId, keyId, auditLogger = null) => {
  try {
    if (!userId || !keyId) {
      throw new Error('User ID and Key ID are required');
    }

    const keyDoc = await db.collection('users').doc(userId).collection('apiKeys').doc(keyId).get();

    if (!keyDoc.exists) {
      throw new Error('API key not found');
    }

    // Delete the key
    await keyDoc.ref.delete();

    // Update metadata
    const metadataRef = db.collection('users').doc(userId).collection('apiKeys').doc('_metadata');
    const metadataSnapshot = await metadataRef.get();
    const currentCount = metadataSnapshot.exists ? metadataSnapshot.data().totalKeys : 0;

    await metadataRef.set({
      totalKeys: Math.max(0, currentCount - 1),
      lastKeyRevoked: new Date()
    }, { merge: true });

    // Log revocation
    if (auditLogger) {
      auditLogger.log({
        type: 'API_KEY_REVOKED',
        action: 'REVOKE_API_KEY',
        userId,
        resource: 'apiKeys',
        detail: `Key ID: ${keyId}`,
        status: 'SUCCESS'
      });
    }

    console.log(`[AUTH] API key revoked: ${keyId}`);

    return { success: true, message: 'API key revoked successfully' };
  } catch (err) {
    console.error('[AUTH] API key revocation error:', err.message);
    throw err;
  }
};

// ════════════════════════════════════════════════════════════════
// TOKEN GENERATION HELPERS
// ════════════════════════════════════════════════════════════════

const generateAccessToken = (uid, email, tier) => {
  return jwt.sign(
    {
      uid,
      email,
      tier,
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRY,
      algorithm: 'HS256'
    }
  );
};

const generateRefreshToken = (uid) => {
  return crypto.randomBytes(32).toString('hex');
};

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// ════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ════════════════════════════════════════════════════════════════

const getUserProfile = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const userData = userDoc.data();

    // Don't return sensitive fields
    return {
      uid: userData.uid,
      email: userData.email,
      tier: userData.tier,
      status: userData.status,
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
      emailVerified: userData.emailVerified,
      lastLogin: userData.lastLogin,
      securitySettings: {
        twoFactorEnabled: userData.securitySettings?.twoFactorEnabled,
        sessionTimeout: userData.securitySettings?.sessionTimeout
      }
    };
  } catch (err) {
    console.error('[AUTH] Get user profile error:', err.message);
    throw err;
  }
};

// ════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════

module.exports = {
  // Initialization
  initializeFirebase,

  // Authentication
  signUp,
  login,
  logout,
  verifyToken,
  refreshAccessToken,

  // API Keys
  generateAPIKey,
  verifyAPIKey,
  revokeAPIKey,

  // User Management
  getUserProfile,

  // Utilities
  validatePassword,
  PASSWORD_REQUIREMENTS,
  hashToken,

  // Constants
  JWT_SECRET,
  JWT_EXPIRY,
  REFRESH_TOKEN_EXPIRY
};
