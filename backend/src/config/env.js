/**
 * Single validated source of environment configuration.
 *
 * Every other module imports from here rather than touching process.env, so
 * that defaults live in one place and a misconfigured deployment fails at
 * boot with a clear message instead of at the first request.
 */
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

/** Secrets that have been published in this repo's history or its template. */
const COMPROMISED_SECRETS = new Set([
    'cricket_strike_super_secret_jwt_key_2026',
    'changeme',
    'secret'
]);

const errors = [];

function requiredInProduction(key, value, hint) {
    if (!value && isProduction) {
        errors.push(`${key} is required when NODE_ENV=production. ${hint}`);
    }
    return value;
}

function parseIntOr(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

// --- JWT secret -----------------------------------------------------------
// In development we generate an ephemeral secret so a fresh clone runs with
// zero setup. It changes on every restart, which logs everyone out — that is
// intentional and harmless locally, and impossible to ship by accident.
let jwtSecret = process.env.JWT_SECRET;

if (jwtSecret && COMPROMISED_SECRETS.has(jwtSecret)) {
    errors.push(
        'JWT_SECRET is set to a known-compromised placeholder value. ' +
        'Generate a new one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"'
    );
} else if (!jwtSecret) {
    if (isProduction) {
        errors.push('JWT_SECRET is required when NODE_ENV=production.');
    } else {
        jwtSecret = crypto.randomBytes(48).toString('base64url');
        console.warn('⚠️  JWT_SECRET not set — generated an ephemeral development secret. Sessions reset on restart.');
    }
} else if (jwtSecret.length < 32 && isProduction) {
    errors.push('JWT_SECRET must be at least 32 characters in production.');
}

// --- CORS -----------------------------------------------------------------
const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

if (isProduction && corsOrigins.length === 0) {
    errors.push('CORS_ORIGINS must list at least one allowed origin when NODE_ENV=production.');
}

const config = {
    NODE_ENV,
    isProduction,
    isTest: NODE_ENV === 'test',

    port: parseIntOr(process.env.PORT, 3005),
    trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false,
    corsOrigins,

    db: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseIntOr(process.env.DB_PORT, 3307),
        user: process.env.DB_USER || 'root',
        // DB_PASS is the legacy name still present in some local .env files.
        password: process.env.DB_PASSWORD ?? process.env.DB_PASS ?? '',
        database: process.env.DB_NAME || 'cricket_league',
        connectionLimit: parseIntOr(process.env.DB_POOL_SIZE, 10)
    },

    redisUrl: process.env.REDIS_URL || '',

    jwt: {
        secret: jwtSecret,
        expiresIn: process.env.JWT_EXPIRY || '30d'
    },

    google: {
        clientId: requiredInProduction(
            'GOOGLE_CLIENT_ID',
            process.env.GOOGLE_CLIENT_ID || '',
            'Google Sign-In cannot be verified without it.'
        )
    },

    facebook: {
        appId: process.env.FACEBOOK_APP_ID || '',
        // Needed server-side to verify user access tokens via debug_token.
        appSecret: process.env.FACEBOOK_APP_SECRET || ''
    }
};

if (errors.length > 0) {
    console.error('\n❌ Invalid environment configuration:\n');
    errors.forEach(e => console.error(`   • ${e}`));
    console.error('\nSee backend/.env.example for the full template.\n');
    process.exit(1);
}

/** True when Google Sign-In is fully configured and safe to offer. */
config.google.enabled = Boolean(config.google.clientId);
/** Facebook login needs both halves: the id to start it, the secret to verify it. */
config.facebook.enabled = Boolean(config.facebook.appId && config.facebook.appSecret);

module.exports = config;
