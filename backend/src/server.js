/**
 * HTTP + realtime entrypoint.
 */
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config/env');
const { socketAuth } = require('./middleware/auth');
const { registerMatchSockets, shutdownMatchSockets } = require('./sockets/matchSocket');
const { initDatabase, pingDatabase } = require('./config/db');

const app = express();
const httpServer = createServer(app);

// ---------------------------------------------------------------------------
// CORS
//
// Both Express and Socket.IO previously used `origin: '*'`, which let any site
// on the internet drive this API with a user's credentials. In development the
// allowlist is empty and any origin is accepted so that a LAN device or a
// Capacitor shell can connect without extra setup; in production env.js refuses
// to boot unless CORS_ORIGINS is set.
// ---------------------------------------------------------------------------
function isAllowedOrigin(origin) {
    // Same-origin browser requests and native app shells send no Origin header.
    if (!origin) return true;
    if (!config.isProduction && config.corsOrigins.length === 0) return true;
    return config.corsOrigins.includes(origin);
}

const corsOptions = {
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        callback(new Error('Origin not allowed'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                'https://accounts.google.com',
                'https://apis.google.com',
                'https://connect.facebook.net',
                'https://cdn.jsdelivr.net'
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                'https://fonts.googleapis.com'
            ],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            connectSrc: [
                "'self'",
                'ws:',
                'wss:',
                'https://accounts.google.com',
                'https://graph.facebook.com',
                'https://cdn.jsdelivr.net'
            ],
            fontSrc: [
                "'self'",
                'data:',
                'https://fonts.gstatic.com'
            ],
            frameSrc: ["'self'", 'https://accounts.google.com', 'https://www.facebook.com'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"]
        }
    },
    // WebGL textures and the 3D canvas need to be readable cross-origin-isolated.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(compression());
app.use(cors(corsOptions));

// A request body larger than this is never legitimate here; the default 100kb
// was still generous for what is only ever a small JSON payload.
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// Blanket API rate limit. express-rate-limit was already a dependency but had
// never been imported.
app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, code: 'RATE_LIMITED', message: 'Too many requests. Slow down a moment.' }
}));

// Sign-in is the most attractive endpoint to brute force, so it gets a tighter
// budget than the rest of the API.
app.use('/api/auth', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again shortly.' }
}));

app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders(res, filePath) {
        // The shell must revalidate so a deploy is picked up immediately;
        // fingerprint-free assets are still safe to cache briefly.
        if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------
const io = new Server(httpServer, {
    cors: {
        origin(origin, callback) {
            if (isAllowedOrigin(origin)) return callback(null, true);
            callback(new Error('Origin not allowed'));
        },
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 10000,
    maxHttpBufferSize: 1e4
});

// Every socket must present the same session JWT the REST API requires. The
// old handshake was anonymous and the client announced its own playerId.
io.use(socketAuth);

if (config.redisUrl) {
    try {
        const { createClient } = require('redis');
        const { createAdapter } = require('@socket.io/redis-adapter');

        const pubClient = createClient({ url: config.redisUrl });
        const subClient = pubClient.duplicate();

        Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
            io.adapter(createAdapter(pubClient, subClient));
            console.log('✅ Connected to Redis Socket.IO adapter');
        }).catch(err => {
            console.warn('⚠️ Redis adapter failed to connect, running standalone:', err.message);
        });
    } catch {
        console.warn('⚠️ Redis package not available, using in-memory adapter');
    }
}

registerMatchSockets(io);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Reports real readiness. The previous version always returned "online" even
 * with a dead database, so a load balancer would keep routing traffic to a
 * server that could not answer a single query.
 */
app.get('/api/health', async (req, res) => {
    try {
        await pingDatabase();
        res.json({ status: 'ok', database: 'up', timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('[health] database unreachable:', err.message);
        res.status(503).json({ status: 'degraded', database: 'down', timestamp: new Date().toISOString() });
    }
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/tours', require('./routes/tour.routes'));
app.use('/api/user', require('./routes/user.routes'));
app.use('/api/shop', require('./routes/shop.routes'));
app.use('/api/leaderboard', require('./routes/leaderboard.routes'));
app.use('/api/friends', require('./routes/friend.routes'));
app.use('/api/referral', require('./routes/referral.routes'));
app.use('/api/squad', require('./routes/squad.routes'));
app.use('/api/clubs', require('./routes/clubs.routes'));
app.use('/api/rewards', require('./routes/rewards.routes'));
app.use('/api/balls', require('./routes/balls.routes'));
app.use('/api/roadmap', require('./routes/roadmap.routes'));
app.use('/api/battlepass', require('./routes/battlepass.routes'));
app.use('/api/dailystreak', require('./routes/dailystreak.routes'));
app.use('/api/clubwars', require('./routes/clubwars.routes'));
// Custom rooms are socket events, not REST. The old /api/rooms router could
// not actually pair the two players who shared a code — both sides fell through
// to ordinary matchmaking — and it took the host's identity from the request
// body. See sockets/matchSocket.js: create_custom_room / join_custom_room.
app.use('/api/spin', require('./routes/spin.routes'));

// Unknown API paths get JSON, not the SPA shell.
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Endpoint not found.' });
});

// Client-side routes fall back to the app shell.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

/**
 * Final error handler. Route handlers used to return `err.message` to the
 * caller, which leaked SQL and file paths on failure.
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);

    if (err.message === 'Origin not allowed') {
        return res.status(403).json({ success: false, code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large.' });
    }
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ success: false, code: 'MALFORMED_JSON', message: 'Request body is not valid JSON.' });
    }

    res.status(err.status || 500).json({
        success: false,
        code: 'SERVER_ERROR',
        message: 'Something went wrong. Please try again.'
    });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function bootstrap() {
    await initDatabase();

    await new Promise((resolve, reject) => {
        httpServer.listen(config.port, resolve);
        // No port auto-increment: silently moving to another port leaves every
        // configured client pointing at a server that is not there.
        httpServer.on('error', reject);
    });

    console.log(`🏏 Cricket League server listening on http://localhost:${config.port} [${config.NODE_ENV}]`);
}

let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received — shutting down.`);

    shutdownMatchSockets();
    io.close();

    httpServer.close(() => {
        console.log('✅ Server closed.');
        process.exit(0);
    });

    // Don't let a hung connection block the exit indefinitely.
    setTimeout(() => {
        console.warn('⚠️ Forcing exit after shutdown timeout.');
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

bootstrap().catch(err => {
    console.error('❌ Failed to start:', err);
    process.exit(1);
});

module.exports = { app, io, httpServer, bootstrap, shutdown };
