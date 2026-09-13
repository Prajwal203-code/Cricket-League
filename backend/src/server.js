const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const { registerMatchSockets } = require('./sockets/matchSocket');

const app = express();
const httpServer = createServer(app);

const path = require('path');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Socket.IO with WebSocket priority
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 10000,
    maxHttpBufferSize: 1e4
});

// Setup Redis Adapter if configured
if (process.env.REDIS_URL) {
    try {
        const { createClient } = require('redis');
        const { createAdapter } = require('@socket.io/redis-adapter');

        const pubClient = createClient({ url: process.env.REDIS_URL });
        const subClient = pubClient.duplicate();

        Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
            io.adapter(createAdapter(pubClient, subClient));
            console.log('✅ Connected to Redis Socket.IO adapter');
        }).catch(err => {
            console.warn('⚠️ Redis adapter failed to connect, running in standalone mode:', err.message);
        });
    } catch (e) {
        console.warn('⚠️ Redis package not initialized, using memory adapter');
    }
}

// Register Match Socket Handlers
registerMatchSockets(io);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'Cricket Strike Real-time API',
        timestamp: new Date().toISOString()
    });
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
app.use('/api/rooms', require('./routes/customrooms.routes'));
app.use('/api/spin', require('./routes/spin.routes'));

const { initDatabase } = require('./config/db');

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;

async function bootstrap() {
    // 1. Initialize MySQL Database & Tables
    await initDatabase();

    // 2. Start HTTP & WebSocket Server
    function startServer(port) {
        httpServer.listen(port, () => {
            console.log(`🏏 Cricket Strike Server running at http://localhost:${port}`);
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`⚠️ Port ${port} is busy, attempting port ${port + 1}...`);
                startServer(port + 1);
            } else {
                console.error('Server error:', err);
            }
        });
    }

    startServer(DEFAULT_PORT);
}

bootstrap();
