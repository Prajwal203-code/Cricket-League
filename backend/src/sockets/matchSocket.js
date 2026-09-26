/**
 * Realtime transport for matches.
 *
 * Thin adapter over services/matchEngine.js: it owns sockets, rooms, timers
 * and queues, and defers every rules decision to the engine.
 *
 * What changed from the previous implementation:
 *  - Identity comes from the verified JWT on the handshake (socket.userId).
 *    Clients used to declare their own `playerId`.
 *  - `pendingChallenges` lives at module scope. It was previously declared
 *    inside the connection handler, so each socket had its own private copy and
 *    an accepted challenge was always looked up in an empty map — friend
 *    challenges could never complete.
 *  - The "friend accepts after 2.2s with a random level" simulation is gone.
 *    This game is pure PvP: if nobody is there, the player is told so.
 */
const config = require('../config/env');
const engine = require('../services/matchEngine');
const matchService = require('../services/matchService');
const presence = require('../services/presence');
const { getUserById, getBattingPower } = require('../services/userService');
const {
    MATCH,
    MATCHMAKING,
    BOWLING,
    VALID_SHOTS,
    VALID_STADIUMS,
    CUSTOM_ROOM
} = require('../config/gameRules');

/** tourId -> queue entries waiting for an opponent. */
const queues = new Map();
/** matchId -> engine match object. */
const activeMatches = new Map();
/** userId -> matchId, so a reconnecting player can be put back in their match. */
const userToMatch = new Map();
/** challengeId -> pending friend challenge. Module scope on purpose. */
const pendingChallenges = new Map();
/** roomCode -> custom room awaiting an opponent. */
const customRooms = new Map();
/** hostUserId -> roomCode, so a host can only hold one open room. */
const userToRoom = new Map();

/** Timers keyed by match/user so they can be cancelled deterministically. */
const ballTimers = new Map();
const queueTimers = new Map();
const disconnectTimers = new Map();

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Per-socket token bucket. Without this a client could spam `bat_action` and
 * either flood the opponent or brute-force favourable outcomes.
 */
const RATE_LIMITS = {
    find_match: { tokens: 5, perMs: 10000 },
    cancel_matchmaking: { tokens: 5, perMs: 10000 },
    bowl_action: { tokens: 10, perMs: 5000 },
    bat_action: { tokens: 10, perMs: 5000 },
    send_1v1_challenge: { tokens: 5, perMs: 20000 },
    accept_1v1_challenge: { tokens: 10, perMs: 10000 },
    decline_1v1_challenge: { tokens: 10, perMs: 10000 },
    send_match_emote: { tokens: 6, perMs: 10000 },
    create_custom_room: { tokens: 5, perMs: 20000 },
    // Tight budget: this is the one event where a wrong guess is meaningful,
    // so brute-forcing the 4-digit code space has to be slow.
    join_custom_room: { tokens: 8, perMs: 30000 },
    cancel_custom_room: { tokens: 8, perMs: 20000 }
};

function allow(socket, event) {
    const limit = RATE_LIMITS[event];
    if (!limit) return true;

    if (!socket._buckets) socket._buckets = new Map();
    const now = Date.now();
    let bucket = socket._buckets.get(event);

    if (!bucket || now - bucket.start > limit.perMs) {
        bucket = { start: now, used: 0 };
        socket._buckets.set(event, bucket);
    }
    if (bucket.used >= limit.tokens) return false;
    bucket.used += 1;
    return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(socket, code, message) {
    socket.emit('match_error', { code, message });
}

function socketForUser(io, userId) {
    const socketId = presence.socketIdFor(userId);
    return socketId ? io.sockets.sockets.get(socketId) : null;
}

function clearTimer(map, key) {
    const t = map.get(key);
    if (t) {
        clearTimeout(t);
        map.delete(key);
    }
}

/** Broadcasts engine events, then handles any that need server follow-up. */
async function dispatch(io, match, events) {
    for (const event of events) {
        io.to(match.roomName).emit(event.type, event.payload);
    }
    if (events.some(e => e.type === 'match_end')) {
        await concludeMatch(io, match);
    } else {
        armBallTimer(io, match);
    }
}

/**
 * Resolves a ball nobody played. Prevents one player from freezing a match by
 * closing their tab mid-over — the old server had no timers at all, so an
 * abandoned match hung forever and leaked its room.
 */
function armBallTimer(io, match) {
    clearTimer(ballTimers, match.matchId);
    if (match.status === engine.STATUS.FINISHED || match.status === engine.STATUS.ABANDONED) return;

    const delay = Math.max(1000, (match.deadlineAt || Date.now()) - Date.now());

    ballTimers.set(match.matchId, setTimeout(async () => {
        const live = activeMatches.get(match.matchId);
        if (!live) return;

        try {
            if (live.status === engine.STATUS.AWAITING_BOWL) {
                // Bowl a default delivery on the bowler's behalf and keep going.
                const result = engine.applyBowl(live, engine.bowlerId(live), {
                    speedKmh: Math.round((BOWLING.minSpeedKmh + BOWLING.maxSpeedKmh) / 2),
                    line: 'middle',
                    length: 'good'
                });
                if (result.ok) await dispatch(io, live, result.events);
            } else if (live.status === engine.STATUS.AWAITING_BAT) {
                const power = await safeBattingPower(engine.strikerId(live));
                const result = engine.applyBat(live, engine.strikerId(live), {
                    timedOut: true,
                    power
                });
                if (result.ok) await dispatch(io, live, result.events);
            }
        } catch (err) {
            console.error('[match] ball timer failed:', err);
        }
    }, delay));
}

async function safeBattingPower(userId) {
    try {
        const power = await getBattingPower(userId);
        return power ?? 25;
    } catch {
        return 25;
    }
}

/** Pays out, persists, notifies, and tears the match down. */
async function concludeMatch(io, match) {
    clearTimer(ballTimers, match.matchId);

    let payouts = null;
    try {
        payouts = await matchService.settleMatch(match);
    } catch (err) {
        console.error('[match] settlement failed for', match.matchId, err);
    }

    for (const userId of match.order) {
        const target = socketForUser(io, userId);
        if (target) {
            target.emit('match_settled', {
                matchId: match.matchId,
                winnerUserId: match.winnerUserId,
                reason: match.endReason,
                scores: engine.publicScores(match),
                payout: payouts ? payouts[userId] : null
            });
        }
        userToMatch.delete(userId);
        clearTimer(disconnectTimers, userId);
    }

    activeMatches.delete(match.matchId);
}

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------

function queueFor(tourId) {
    if (!queues.has(tourId)) queues.set(tourId, []);
    return queues.get(tourId);
}

function removeFromQueue(userId) {
    for (const [tourId, queue] of queues.entries()) {
        const idx = queue.findIndex(e => e.userId === userId);
        if (idx !== -1) {
            const [entry] = queue.splice(idx, 1);
            clearTimer(queueTimers, userId);
            return { tourId, entry };
        }
    }
    return null;
}

/**
 * Finds an opponent within the level band, widening it for players who have
 * been waiting a while so a thin queue still pairs up.
 */
function findOpponent(queue, candidate) {
    const now = Date.now();
    return queue.findIndex(entry => {
        if (entry.userId === candidate.userId) return false;
        const waited = Math.max(now - entry.joinedAt, now - candidate.joinedAt);
        const range = waited >= MATCHMAKING.levelRangeRelaxAfterMs
            ? MATCHMAKING.relaxedLevelRange
            : MATCHMAKING.levelRange;
        return Math.abs(entry.level - candidate.level) <= range;
    });
}

async function startMatch(io, tourId, entryA, entryB) {
    const [powerA, powerB] = await Promise.all([
        safeBattingPower(entryA.userId),
        safeBattingPower(entryB.userId)
    ]);

    const match = engine.createMatch({
        tourId,
        entryFee: entryA.entryFee,
        prize: entryA.prize,
        p1: { ...entryA.profile, power: powerA },
        p2: { ...entryB.profile, power: powerB }
    });

    activeMatches.set(match.matchId, match);

    for (const entry of [entryA, entryB]) {
        userToMatch.set(entry.userId, match.matchId);
        const s = io.sockets.sockets.get(entry.socketId);
        if (s) s.join(match.roomName);
    }

    for (const userId of match.order) {
        const target = socketForUser(io, userId);
        if (!target) continue;
        target.emit('match_found', {
            ...engine.publicState(match, userId),
            countdownMs: MATCH.preMatchCountdownMs
        });
    }

    console.log(`[match] ${match.matchId} started: ${entryA.userId} vs ${entryB.userId} (tour ${tourId})`);
    armBallTimer(io, match);
    return match;
}

// ---------------------------------------------------------------------------
// Custom rooms
//
// A host creates a code, a friend types it in, and the two of them play each
// other. The previous REST implementation could not do that: both sides ended
// up calling the ordinary matchmaking function, so the code decided nothing and
// each player was paired with whoever happened to be in the public queue. It
// also took the host's user id and username from the request body, so a room
// could be created in someone else's name.
// ---------------------------------------------------------------------------

/** Cryptographically random code, so a room cannot be guessed by timing. */
function generateRoomCode() {
    const { randomInt } = require('crypto');
    const max = 10 ** CUSTOM_ROOM.codeLength;
    const min = 10 ** (CUSTOM_ROOM.codeLength - 1);

    for (let attempt = 0; attempt < CUSTOM_ROOM.maxCodeAttempts; attempt++) {
        const code = String(randomInt(min, max));
        if (!customRooms.has(code)) return code;
    }
    return null;
}

function closeCustomRoom(code) {
    const room = customRooms.get(code);
    if (!room) return null;
    clearTimeout(room.expiryTimer);
    customRooms.delete(code);
    userToRoom.delete(room.hostUserId);
    return room;
}

/** Drops whatever room this user is hosting. Used on cancel and disconnect. */
function closeRoomForUser(userId) {
    const code = userToRoom.get(userId);
    return code ? closeCustomRoom(code) : null;
}

function buildEntry(user, socketId, charge) {
    return {
        userId: user.id,
        socketId,
        level: user.level,
        joinedAt: Date.now(),
        entryFee: charge.tour.entry_fee,
        prize: charge.tour.prize,
        profile: {
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            countryCode: user.country_code,
            level: user.level
        }
    };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function registerMatchSockets(io) {
    io.on('connection', (socket) => {
        const userId = socket.userId;
        console.log(`[socket] connected: user ${userId} (${socket.id})`);

        // One live connection per account; a second login supersedes the first.
        // The presence map is shared with the REST layer, so the friends list
        // reports who is genuinely connected instead of a hardcoded `online: 1`.
        const existing = presence.setOnline(userId, socket.id);
        if (existing && existing !== socket.id) {
            const old = io.sockets.sockets.get(existing);
            if (old) {
                old.emit('session_superseded', {
                    message: 'Your account was opened somewhere else.'
                });
                old.disconnect(true);
            }
        }

        // Rejoin an in-progress match after a dropped connection.
        const resumeId = userToMatch.get(userId);
        if (resumeId) {
            const match = activeMatches.get(resumeId);
            if (match && match.status !== engine.STATUS.FINISHED) {
                clearTimer(disconnectTimers, userId);
                match.players[userId].connected = true;
                match.players[userId].disconnectedAt = null;
                socket.join(match.roomName);
                socket.emit('match_resumed', engine.publicState(match, userId));
                socket.to(match.roomName).emit('opponent_reconnected', { userId });
            } else {
                userToMatch.delete(userId);
            }
        }

        // --- Matchmaking ---------------------------------------------------

        socket.on('find_match', async ({ tourId } = {}) => {
            if (!allow(socket, 'find_match')) {
                return fail(socket, 'RATE_LIMITED', 'Slow down a moment.');
            }
            if (userToMatch.has(userId)) {
                return fail(socket, 'ALREADY_IN_MATCH', 'You are already in a match.');
            }
            if (removeFromQueue(userId)) {
                // Silently replace a stale queue entry rather than double-queueing.
            }

            const tid = Number(tourId);
            if (!Number.isInteger(tid) || tid <= 0) {
                return fail(socket, 'INVALID_TOUR', 'Pick a valid venue.');
            }

            try {
                const charge = await matchService.chargeEntryFee(userId, tid);
                if (!charge.ok) {
                    return fail(socket, charge.code, charge.message);
                }

                const user = await getUserById(userId);
                const entry = {
                    userId,
                    socketId: socket.id,
                    level: user.level,
                    joinedAt: Date.now(),
                    entryFee: charge.tour.entry_fee,
                    prize: charge.tour.prize,
                    profile: {
                        userId,
                        username: user.username,
                        avatar: user.avatar,
                        countryCode: user.country_code,
                        level: user.level
                    }
                };

                socket.emit('matchmaking_started', {
                    tourId: tid,
                    entryFee: charge.tour.entry_fee,
                    prize: charge.tour.prize,
                    balance: charge.balance,
                    timeoutMs: MATCHMAKING.queueTimeoutMs
                });

                const queue = queues.get(tid) || queueFor(tid);
                const idx = findOpponent(queue, entry);

                if (idx !== -1) {
                    const [opponent] = queue.splice(idx, 1);
                    clearTimer(queueTimers, opponent.userId);
                    await startMatch(io, tid, opponent, entry);
                    return;
                }

                queue.push(entry);

                // Pure PvP: no bot stands in. If the queue stays empty the
                // player is told honestly and their stake comes back.
                queueTimers.set(userId, setTimeout(async () => {
                    const removed = removeFromQueue(userId);
                    if (!removed) return;
                    let balance = null;
                    try {
                        balance = await matchService.refundEntryFee(userId, tid);
                    } catch (err) {
                        console.error('[match] refund on timeout failed:', err);
                    }
                    const s = socketForUser(io, userId);
                    if (s) {
                        s.emit('matchmaking_timeout', {
                            tourId: tid,
                            refunded: removed.entry.entryFee,
                            balance,
                            message: 'No players available right now. Your entry fee has been refunded.'
                        });
                    }
                }, MATCHMAKING.queueTimeoutMs));
            } catch (err) {
                console.error('[match] find_match failed:', err);
                fail(socket, 'SERVER_ERROR', 'Could not start matchmaking. Try again.');
            }
        });

        socket.on('cancel_matchmaking', async () => {
            if (!allow(socket, 'cancel_matchmaking')) return;
            const removed = removeFromQueue(userId);
            if (!removed) return;

            let balance = null;
            try {
                balance = await matchService.refundEntryFee(userId, removed.tourId);
            } catch (err) {
                console.error('[match] refund on cancel failed:', err);
            }
            socket.emit('matchmaking_cancelled', {
                refunded: removed.entry.entryFee,
                balance
            });
        });

        // --- Gameplay ------------------------------------------------------

        socket.on('bowl_action', async ({ matchId, speedKmh, line, length } = {}) => {
            if (!allow(socket, 'bowl_action')) {
                return fail(socket, 'RATE_LIMITED', 'Slow down a moment.');
            }
            const match = activeMatches.get(matchId);
            // Checking membership here as well as in the engine means a socket
            // cannot even probe for the existence of someone else's match.
            if (!match || !engine.isParticipant(match, userId)) {
                return fail(socket, 'NO_SUCH_MATCH', 'That match is not available.');
            }

            const result = engine.applyBowl(match, userId, { speedKmh, line, length });
            if (!result.ok) return fail(socket, result.error.code, result.error.message);

            try {
                await dispatch(io, match, result.events);
            } catch (err) {
                console.error('[match] bowl dispatch failed:', err);
            }
        });

        socket.on('bat_action', async ({ matchId, shot, tapOffsetMs } = {}) => {
            if (!allow(socket, 'bat_action')) {
                return fail(socket, 'RATE_LIMITED', 'Slow down a moment.');
            }
            const match = activeMatches.get(matchId);
            if (!match || !engine.isParticipant(match, userId)) {
                return fail(socket, 'NO_SUCH_MATCH', 'That match is not available.');
            }
            if (shot !== undefined && !VALID_SHOTS.includes(shot)) {
                return fail(socket, 'INVALID_SHOT', 'Unknown shot.');
            }

            // Power is read from the player's squad in the database. The old
            // protocol accepted `batsmanPower` from the client.
            const power = await safeBattingPower(userId);

            const result = engine.applyBat(match, userId, { shot, tapOffsetMs, power });
            if (!result.ok) return fail(socket, result.error.code, result.error.message);

            try {
                await dispatch(io, match, result.events);
            } catch (err) {
                console.error('[match] bat dispatch failed:', err);
            }
        });

        socket.on('leave_match', async ({ matchId } = {}) => {
            const match = activeMatches.get(matchId);
            if (!match || !engine.isParticipant(match, userId)) return;

            const endEvent = engine.forfeit(match, userId);
            if (endEvent) {
                io.to(match.roomName).emit(endEvent.type, endEvent.payload);
                await concludeMatch(io, match);
            }
        });

        // --- Friend challenges ---------------------------------------------

        socket.on('send_1v1_challenge', async ({ toUserId } = {}) => {
            if (!allow(socket, 'send_1v1_challenge')) {
                return fail(socket, 'RATE_LIMITED', 'Slow down a moment.');
            }

            const targetId = Number(toUserId);
            if (!Number.isInteger(targetId) || targetId === userId) {
                return fail(socket, 'INVALID_TARGET', 'Pick a friend to challenge.');
            }

            const targetSocket = socketForUser(io, targetId);
            if (!targetSocket) {
                // Honest answer instead of the old fake auto-accept.
                return socket.emit('1v1_challenge_unavailable', {
                    toUserId: targetId,
                    message: 'That player is offline right now.'
                });
            }

            const challengeId = require('crypto').randomUUID();
            const challenger = await getUserById(userId);

            pendingChallenges.set(challengeId, {
                challengeId,
                fromUserId: userId,
                toUserId: targetId,
                createdAt: Date.now()
            });

            // Expire so the map cannot grow without bound.
            setTimeout(() => pendingChallenges.delete(challengeId), 60000);

            targetSocket.emit('receive_1v1_challenge', {
                challengeId,
                from: {
                    userId,
                    username: challenger.username,
                    avatar: challenger.avatar,
                    level: challenger.level,
                    countryCode: challenger.country_code
                }
            });

            socket.emit('1v1_challenge_sent', { challengeId, toUserId: targetId });
        });

        socket.on('accept_1v1_challenge', async ({ challengeId } = {}) => {
            if (!allow(socket, 'accept_1v1_challenge')) return;

            const challenge = pendingChallenges.get(challengeId);
            if (!challenge || challenge.toUserId !== userId) {
                return fail(socket, 'CHALLENGE_EXPIRED', 'That challenge is no longer available.');
            }
            pendingChallenges.delete(challengeId);

            const challengerSocket = socketForUser(io, challenge.fromUserId);
            if (!challengerSocket) {
                return fail(socket, 'OPPONENT_OFFLINE', 'That player has gone offline.');
            }
            if (userToMatch.has(userId) || userToMatch.has(challenge.fromUserId)) {
                return fail(socket, 'ALREADY_IN_MATCH', 'One of you is already in a match.');
            }

            try {
                // Friendlies settle against a real tour so the stake and prize
                // are server-defined rather than invented client-side.
                const tourId = CUSTOM_ROOM.tourId;
                const chargeA = await matchService.chargeEntryFee(challenge.fromUserId, tourId);
                if (!chargeA.ok) {
                    challengerSocket.emit('match_error', { code: chargeA.code, message: chargeA.message });
                    return fail(socket, 'OPPONENT_CANNOT_PAY', 'Your friend cannot cover the entry fee.');
                }
                const chargeB = await matchService.chargeEntryFee(userId, tourId);
                if (!chargeB.ok) {
                    await matchService.refundEntryFee(challenge.fromUserId, tourId);
                    return fail(socket, chargeB.code, chargeB.message);
                }

                const [challengerUser, accepterUser] = await Promise.all([
                    getUserById(challenge.fromUserId),
                    getUserById(userId)
                ]);

                await startMatch(
                    io,
                    tourId,
                    buildEntry(challengerUser, challengerSocket.id, chargeA),
                    buildEntry(accepterUser, socket.id, chargeB)
                );
            } catch (err) {
                console.error('[match] challenge accept failed:', err);
                fail(socket, 'SERVER_ERROR', 'Could not start the match.');
            }
        });

        socket.on('decline_1v1_challenge', ({ challengeId } = {}) => {
            if (!allow(socket, 'decline_1v1_challenge')) return;
            const challenge = pendingChallenges.get(challengeId);
            if (!challenge || challenge.toUserId !== userId) return;
            pendingChallenges.delete(challengeId);

            const challengerSocket = socketForUser(io, challenge.fromUserId);
            if (challengerSocket) {
                challengerSocket.emit('1v1_challenge_declined', { challengeId });
            }
        });

        // --- Custom rooms ----------------------------------------------------

        socket.on('create_custom_room', async ({ stadium } = {}) => {
            if (!allow(socket, 'create_custom_room')) {
                return fail(socket, 'RATE_LIMITED', 'Slow down a moment.');
            }
            if (userToMatch.has(userId)) {
                return fail(socket, 'ALREADY_IN_MATCH', 'You are already in a match.');
            }

            // The venue is validated against the offered list rather than
            // stored verbatim — it is shown to the other player.
            const venue = VALID_STADIUMS.includes(stadium) ? stadium : VALID_STADIUMS[0];

            // One open room per host. Re-creating replaces the previous code.
            closeRoomForUser(userId);

            const code = generateRoomCode();
            if (!code) {
                return fail(socket, 'NO_ROOM_CODE', 'All room codes are busy. Try again in a moment.');
            }

            let host;
            try {
                host = await getUserById(userId);
            } catch (err) {
                console.error('[room] host lookup failed:', err);
                return fail(socket, 'SERVER_ERROR', 'Could not create the room.');
            }

            const room = {
                code,
                hostUserId: userId,
                hostUsername: host.username,
                stadium: venue,
                createdAt: Date.now(),
                expiryTimer: setTimeout(() => {
                    if (!customRooms.has(code)) return;
                    closeCustomRoom(code);
                    const s = socketForUser(io, userId);
                    if (s) {
                        s.emit('custom_room_expired', {
                            roomCode: code,
                            message: 'Nobody joined your room. The code has expired.'
                        });
                    }
                }, CUSTOM_ROOM.lifetimeMs)
            };

            customRooms.set(code, room);
            userToRoom.set(userId, code);

            socket.emit('custom_room_created', {
                roomCode: code,
                stadium: venue,
                expiresInMs: CUSTOM_ROOM.lifetimeMs
            });
        });

        socket.on('join_custom_room', async ({ roomCode } = {}) => {
            if (!allow(socket, 'join_custom_room')) {
                return fail(socket, 'RATE_LIMITED', 'Too many attempts. Wait a moment.');
            }
            if (userToMatch.has(userId)) {
                return fail(socket, 'ALREADY_IN_MATCH', 'You are already in a match.');
            }

            const code = String(roomCode || '').trim();
            const room = customRooms.get(code);
            if (!room) {
                return fail(socket, 'NO_SUCH_ROOM', 'Invalid or expired room code.');
            }
            if (room.hostUserId === userId) {
                return fail(socket, 'OWN_ROOM', 'You are the host of this room.');
            }

            const hostSocket = socketForUser(io, room.hostUserId);
            if (!hostSocket) {
                closeCustomRoom(code);
                return fail(socket, 'HOST_OFFLINE', 'The host has gone offline.');
            }
            if (userToMatch.has(room.hostUserId)) {
                return fail(socket, 'HOST_BUSY', 'The host is already in a match.');
            }

            // Claim the code before any await so two players racing on the same
            // code cannot both get past this point.
            closeCustomRoom(code);

            // Both players leave the public queue — the room match replaces it,
            // and a stale queue entry would otherwise refund or pair them again.
            for (const id of [userId, room.hostUserId]) {
                const removed = removeFromQueue(id);
                if (removed) {
                    try {
                        await matchService.refundEntryFee(id, removed.tourId);
                    } catch (err) {
                        console.error('[room] queue refund failed:', err);
                    }
                }
            }

            try {
                const tourId = CUSTOM_ROOM.tourId;

                const hostCharge = await matchService.chargeEntryFee(room.hostUserId, tourId);
                if (!hostCharge.ok) {
                    hostSocket.emit('match_error', { code: hostCharge.code, message: hostCharge.message });
                    return fail(socket, 'HOST_CANNOT_PAY', 'The host cannot cover the entry fee.');
                }

                const joinCharge = await matchService.chargeEntryFee(userId, tourId);
                if (!joinCharge.ok) {
                    await matchService.refundEntryFee(room.hostUserId, tourId);
                    return fail(socket, joinCharge.code, joinCharge.message);
                }

                const [hostUser, joinUser] = await Promise.all([
                    getUserById(room.hostUserId),
                    getUserById(userId)
                ]);

                hostSocket.emit('custom_room_joined', {
                    roomCode: code,
                    stadium: room.stadium,
                    opponent: {
                        userId: joinUser.id,
                        username: joinUser.username,
                        avatar: joinUser.avatar,
                        level: joinUser.level,
                        countryCode: joinUser.country_code
                    }
                });

                // This is the part the REST version could not do: the two
                // players who share the code play *each other*.
                await startMatch(
                    io,
                    tourId,
                    buildEntry(hostUser, hostSocket.id, hostCharge),
                    buildEntry(joinUser, socket.id, joinCharge)
                );
            } catch (err) {
                console.error('[room] join failed:', err);
                fail(socket, 'SERVER_ERROR', 'Could not start the match.');
            }
        });

        socket.on('cancel_custom_room', () => {
            if (!allow(socket, 'cancel_custom_room')) return;
            const room = closeRoomForUser(userId);
            if (room) socket.emit('custom_room_cancelled', { roomCode: room.code });
        });

        // --- Emotes ---------------------------------------------------------

        socket.on('send_match_emote', ({ matchId, emoteId } = {}) => {
            if (!allow(socket, 'send_match_emote')) return;
            const match = activeMatches.get(matchId);
            // Room membership is checked server-side; the client used to pass
            // the room name it wanted to broadcast into.
            if (!match || !engine.isParticipant(match, userId)) return;

            socket.to(match.roomName).emit('match_emote_received', {
                emoteId: String(emoteId || '').slice(0, 32),
                fromUserId: userId
            });
        });

        // --- Disconnect ------------------------------------------------------

        socket.on('disconnect', async (reason) => {
            console.log(`[socket] disconnected: user ${userId} (${reason})`);

            // Guarded by socket id so a late `disconnect` from a superseded
            // connection cannot mark the new session offline.
            presence.setOffline(userId, socket.id);

            // Leaving the queue refunds immediately — nothing has started yet.
            const removed = removeFromQueue(userId);
            if (removed) {
                try {
                    await matchService.refundEntryFee(userId, removed.tourId);
                } catch (err) {
                    console.error('[match] refund on disconnect failed:', err);
                }
            }

            for (const [id, challenge] of pendingChallenges.entries()) {
                if (challenge.fromUserId === userId || challenge.toUserId === userId) {
                    pendingChallenges.delete(id);
                }
            }

            // A host who leaves takes their open room code with them, so the
            // code cannot outlive the person who would have to play the match.
            closeRoomForUser(userId);

            // Mid-match: hold the match open briefly so a flaky connection or a
            // backgrounded tab does not cost the player the game.
            const matchId = userToMatch.get(userId);
            if (!matchId) return;
            const match = activeMatches.get(matchId);
            if (!match || match.status === engine.STATUS.FINISHED) return;

            match.players[userId].connected = false;
            match.players[userId].disconnectedAt = Date.now();
            socket.to(match.roomName).emit('opponent_disconnected', {
                userId,
                graceMs: MATCH.reconnectGraceMs
            });

            clearTimer(disconnectTimers, userId);
            disconnectTimers.set(userId, setTimeout(async () => {
                const live = activeMatches.get(matchId);
                if (!live || live.status === engine.STATUS.FINISHED) return;
                if (live.players[userId].connected) return;

                const endEvent = engine.forfeit(live, userId);
                if (endEvent) {
                    io.to(live.roomName).emit(endEvent.type, endEvent.payload);
                    await concludeMatch(io, live);
                }
            }, MATCH.reconnectGraceMs));
        });
    });
}

/** Cancels every outstanding timer. Used by tests and graceful shutdown. */
function shutdownMatchSockets() {
    for (const map of [ballTimers, queueTimers, disconnectTimers]) {
        for (const timer of map.values()) clearTimeout(timer);
        map.clear();
    }
    for (const room of customRooms.values()) clearTimeout(room.expiryTimer);

    queues.clear();
    activeMatches.clear();
    userToMatch.clear();
    presence.clear();
    pendingChallenges.clear();
    customRooms.clear();
    userToRoom.clear();
}

module.exports = {
    registerMatchSockets,
    shutdownMatchSockets,
    // exposed for tests
    _internals: { queues, activeMatches, userToMatch, pendingChallenges, customRooms, userToRoom }
};
