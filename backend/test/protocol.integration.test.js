const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('HTTP claims and two-player socket match use the same persisted wallet', { skip: process.env.RUN_DB_TESTS !== '1', timeout: 60000 }, async () => {
    process.env.DB_NAME = `cricket_test_${crypto.randomBytes(6).toString('hex')}`;
    process.env.PORT = '0';
    const { bootstrap, httpServer, io } = require('../src/server');
    const { getPool } = require('../src/config/db');
    const { shutdownMatchSockets } = require('../src/sockets/matchSocket');
    const { stopRulesRefresh } = require('../src/config/liveRules');
    const { io: connect } = require('socket.io-client');
    const sockets = [];
    const once = (socket, event) => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 15000);
        socket.once(event, data => { clearTimeout(timeout); resolve(data); });
    });
    try {
        await bootstrap();
        const url = `http://127.0.0.1:${httpServer.address().port}`;
        const request = async (route, token, body) => {
            const response = await fetch(`${url}${route}`, {
                method: body === undefined ? 'GET' : 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) })
            });
            return { status: response.status, data: await response.json() };
        };
        const a = (await request('/api/auth/guest', null, { deviceId: crypto.randomBytes(24).toString('hex') })).data;
        const b = (await request('/api/auth/guest', null, { deviceId: crypto.randomBytes(24).toString('hex') })).data;
        assert.equal((await request('/api/rewards/claim-free', null, {})).status, 401);
        const claims = await Promise.all([request('/api/rewards/claim-free', a.token, {}), request('/api/rewards/claim-free', a.token, {})]);
        assert.deepEqual(claims.map(r => r.status).sort(), [200, 429]);
        assert.equal((await request('/api/roadmap/claim', a.token, { level: '1junk' })).status, 400);
        const before = (await request('/api/user/profile', a.token)).data.user;
        assert.equal(before.coins, a.user.coins + claims.find(r => r.status === 200).data.coinsAwarded);
        for (const player of [a, b]) {
            const socket = connect(url, { auth: { token: player.token }, transports: ['websocket'], autoConnect: false, reconnection: false });
            sockets.push(socket);
            const connected = once(socket, 'connect'); socket.connect(); await connected;
        }
        const found = sockets.map(socket => once(socket, 'match_found'));
        sockets[0].emit('find_match', { tourId: 1 });
        sockets[1].emit('find_match', { tourId: 1 });
        const states = await Promise.all(found);
        const [initial] = states;
        const settled = sockets.map(socket => once(socket, 'match_settled'));
        let current = initial;
        for (let ball = 0; ball < 12 && current.status !== 'finished'; ball++) {
            const battingIndex = current.strikerId === a.user.id ? 0 : 1;
            const bowlingIndex = 1 - battingIndex;
            const delivered = once(sockets[battingIndex], 'bowl_delivered');
            sockets[bowlingIndex].emit('bowl_action', { matchId: current.matchId, speedKmh: 155, line: 'off', length: 'full' });
            const bowl = await delivered;
            // Exercise the actual timing window, rather than trusting a claimed 'perfect' bucket.
            await new Promise(resolve => setTimeout(resolve, bowl.perfectAtMs));
            const next = new Promise(resolve => {
                const stateHandler = data => { sockets[0].off('match_end', endHandler); resolve(data); };
                const endHandler = data => { sockets[0].off('match_state', stateHandler); resolve({ ...data, status: 'finished' }); };
                sockets[0].once('match_state', stateHandler);
                sockets[0].once('match_end', endHandler);
            });
            sockets[battingIndex].emit('bat_action', { matchId: current.matchId, shot: 'defensive', tapOffsetMs: bowl.perfectAtMs });
            current = await next;
        }
        const results = await Promise.all(settled);
        assert.equal(current.status, 'finished');
        for (const [index, player] of [a, b].entries()) {
            const profile = (await request('/api/user/profile', player.token)).data.user;
            assert.equal(profile.matches_played, 1);
            assert.equal(profile.coins, results[index].payout.balance);
            assert.equal(profile.xp, results[index].payout.user.xp);
            assert.ok(results[index].payout.xp > 0);
        }
        const cfg = await request('/api/config');
        assert.equal(cfg.data.schemaVersion, 1);
        assert.ok(cfg.data.version);
        const created = once(sockets[0], 'custom_room_created');
        sockets[0].emit('create_custom_room', { stadium: 'Adelaide Oval' });
        const room = await created;
        const privateMatches = sockets.map(socket => once(socket, 'match_found'));
        sockets[1].emit('join_custom_room', { roomCode: room.roomCode });
        const privateStates = await Promise.all(privateMatches);
        assert.equal(privateStates[0].opponent.userId, b.user.id);
        const privatePayouts = sockets.map(socket => once(socket, 'match_settled'));
        sockets[1].emit('leave_match', { matchId: privateStates[1].matchId });
        const privateResults = await Promise.all(privatePayouts);
        assert.equal(privateResults[1].payout.coins, 0, 'forfeiting must not mint consolation coins');
        assert.equal(privateResults[1].payout.xp, 0);
        assert.equal((await fetch(`${url}/models/build_360_batsman.py`)).status, 404);
    } finally {
        sockets.forEach(socket => socket.disconnect());
        shutdownMatchSockets(); stopRulesRefresh();
        await new Promise(resolve => io.close(resolve));
        if (httpServer.listening) await new Promise(resolve => httpServer.close(resolve));
        const database = process.env.DB_NAME;
        if (!/^cricket_test_[a-f0-9]{12}$/.test(database)) throw new Error('Unsafe test database cleanup');
        await getPool().query(`DROP DATABASE IF EXISTS \`${database}\``);
        await getPool().end();
    }
});
