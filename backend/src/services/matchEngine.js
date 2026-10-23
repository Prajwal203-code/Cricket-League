/**
 * Authoritative match state machine.
 *
 * Deliberately free of any Socket.IO or database knowledge: it takes a match
 * object and an action, validates the action, and returns the new state plus
 * the events that should be broadcast. That keeps the rules unit-testable and
 * makes the transport layer in sockets/matchSocket.js a thin adapter.
 *
 * Every value that decides a ball's outcome — timing, batting power, the
 * delivery itself — is resolved here from server-held state. Nothing a client
 * sends is taken at face value.
 */
const crypto = require('crypto');
const {
    MATCH,
    SHOT_OUTCOMES,
    VALID_SHOTS,
    VALID_LINES,
    VALID_LENGTHS,
    BOWLING,
    TIMING,
    POWER
} = require('../config/gameRules');

const STATUS = {
    AWAITING_BOWL: 'awaiting_bowl',
    AWAITING_BAT: 'awaiting_bat',
    INNINGS_BREAK: 'innings_break',
    FINISHED: 'finished',
    ABANDONED: 'abandoned'
};

/**
 * @param {object} p1 - { userId, username, avatar, countryCode, level, power }
 * @param {object} p2 - same shape
 */
function createMatch({ tourId, entryFee, prize, p1, p2, battingFirstUserId = null }) {
    // crypto.randomUUID rather than Date.now(): two matches created in the same
    // millisecond previously collided onto one room name.
    const matchId = crypto.randomUUID();

    // Coin toss, unless the caller pinned it (tests, rematches).
    const battingFirst = battingFirstUserId
        || (crypto.randomInt(2) === 0 ? p1.userId : p2.userId);

    return {
        matchId,
        roomName: `match:${matchId}`,
        tourId,
        entryFee,
        prize,
        players: {
            [p1.userId]: { ...p1, connected: true, disconnectedAt: null },
            [p2.userId]: { ...p2, connected: true, disconnectedAt: null }
        },
        order: [p1.userId, p2.userId],
        battingFirstUserId: battingFirst,

        innings: 1,
        ball: 1,
        status: STATUS.AWAITING_BOWL,

        scores: {
            [p1.userId]: { runs: 0, wickets: 0, balls: [] },
            [p2.userId]: { runs: 0, wickets: 0, balls: [] }
        },
        target: null,

        pendingBowl: null,
        deadlineAt: Date.now() + MATCH.ballTimeoutMs,

        winnerUserId: null,
        endReason: null,
        createdAt: Date.now()
    };
}

/** Whose turn it is to bat, derived from the innings — never from the client. */
function strikerId(match) {
    const [a, b] = match.order;
    const other = match.battingFirstUserId === a ? b : a;
    return match.innings === 1 ? match.battingFirstUserId : other;
}

function bowlerId(match) {
    const [a, b] = match.order;
    const striker = strikerId(match);
    return striker === a ? b : a;
}

function opponentOf(match, userId) {
    const [a, b] = match.order;
    return userId === a ? b : a;
}

function isParticipant(match, userId) {
    return Object.prototype.hasOwnProperty.call(match.players, userId);
}

/** Ball flight time in ms, interpolated from the delivery speed. */
function flightMsForSpeed(speedKmh) {
    const clamped = Math.min(BOWLING.maxSpeedKmh, Math.max(BOWLING.minSpeedKmh, speedKmh));
    const t = (clamped - BOWLING.minSpeedKmh) / (BOWLING.maxSpeedKmh - BOWLING.minSpeedKmh);
    return Math.round(
        TIMING.flightMsAtMinSpeed + t * (TIMING.flightMsAtMaxSpeed - TIMING.flightMsAtMinSpeed)
    );
}

/**
 * Converts *when* the batsman played into a timing bucket.
 *
 * This is the anti-cheat centrepiece. The old protocol let the client post
 * `timing: 'perfect'` on every ball; now the client only reports when it
 * tapped, and that report has to agree with the server's own measurement.
 */
function resolveTimingBucket({ reportedOffsetMs, serverElapsedMs, flightMs }) {
    let offset = Number(reportedOffsetMs);

    // Fall back to the server's own measurement if the client omits or
    // mangles its report, or if the two disagree beyond plausible latency.
    if (!Number.isFinite(offset) || offset < 0) {
        offset = serverElapsedMs;
    } else if (Math.abs(offset - serverElapsedMs) > TIMING.clientOffsetToleranceMs) {
        offset = serverElapsedMs;
    }

    const perfectAt = flightMs * TIMING.perfectAtRatio;
    const delta = offset - perfectAt;
    const absDelta = Math.abs(delta);

    if (absDelta <= TIMING.perfectWindowMs) return 'perfect';
    if (absDelta <= TIMING.goodWindowMs) return 'good';
    return delta < 0 ? 'early' : 'late';
}

/** One step worse, used when a good-length delivery beats the batsman. */
function degradeTiming(bucket) {
    if (bucket === 'perfect') return 'good';
    if (bucket === 'good') return 'early';
    return bucket;
}

/**
 * Picks an outcome from the weighted table, nudging boundary weights by the
 * batsman's card power. Power is read from the database by the caller.
 */
function pickOutcome(timingBucket, shot, power) {
    const table = SHOT_OUTCOMES[timingBucket] || SHOT_OUTCOMES.missed;
    const options = table[shot] || table[Object.keys(table)[0]];

    const powerBonus = Math.max(
        0,
        (Math.min(power, POWER.maxPower) - POWER.baseline) * POWER.boundaryWeightPerPoint
    );

    const weighted = options.map(o => ({
        runs: o.runs,
        // Power helps you find the boundary; it does not protect you from a wicket.
        weight: Math.max(0.0001, o.weight + (o.runs >= 4 ? powerBonus : 0))
    }));

    const total = weighted.reduce((sum, o) => sum + o.weight, 0);
    let roll = crypto.randomInt(0, Math.max(1, Math.floor(total * 1000))) / 1000;

    for (const option of weighted) {
        roll -= option.weight;
        if (roll <= 0) return option.runs;
    }
    return weighted[weighted.length - 1].runs;
}

/** Validation result helper. */
function reject(code, message) {
    return { ok: false, error: { code, message } };
}

/**
 * Applies a delivery. Only the bowler may call this, only while the match is
 * waiting for one.
 */
function applyBowl(match, userId, { speedKmh, line, length }) {
    if (match.status !== STATUS.AWAITING_BOWL) {
        return reject('NOT_AWAITING_BOWL', 'Not waiting for a delivery right now.');
    }
    if (!isParticipant(match, userId)) {
        return reject('NOT_A_PARTICIPANT', 'You are not in this match.');
    }
    if (userId !== bowlerId(match)) {
        return reject('NOT_YOUR_TURN', 'You are batting — you cannot bowl this ball.');
    }

    const speed = Number(speedKmh);
    const safeSpeed = Number.isFinite(speed)
        ? Math.min(BOWLING.maxSpeedKmh, Math.max(BOWLING.minSpeedKmh, Math.round(speed)))
        : Math.round((BOWLING.minSpeedKmh + BOWLING.maxSpeedKmh) / 2);

    const safeLine = VALID_LINES.includes(line) ? line : 'middle';
    const safeLength = VALID_LENGTHS.includes(length) ? length : 'good';
    const flightMs = flightMsForSpeed(safeSpeed);

    match.pendingBowl = {
        speedKmh: safeSpeed,
        line: safeLine,
        length: safeLength,
        flightMs,
        deliveredAt: Date.now()
    };
    match.status = STATUS.AWAITING_BAT;
    match.deadlineAt = Date.now() + flightMs + MATCH.ballTimeoutMs;

    return {
        ok: true,
        events: [{
            type: 'bowl_delivered',
            payload: {
                matchId: match.matchId,
                innings: match.innings,
                ball: match.ball,
                speedKmh: safeSpeed,
                line: safeLine,
                length: safeLength,
                flightMs,
                // Clients animate the timing needle from these two numbers so
                // that what the player sees is the same function the server
                // scores against.
                perfectAtMs: Math.round(flightMs * TIMING.perfectAtRatio),
                deliveredAt: match.pendingBowl.deliveredAt
            }
        }]
    };
}

/**
 * Applies a shot and resolves the ball.
 *
 * @param {object} opts
 * @param {string} opts.shot           - one of VALID_SHOTS
 * @param {number} opts.tapOffsetMs    - client's own ms-since-delivery measurement
 * @param {number} opts.power          - batting power, read from the DB by the caller
 * @param {boolean} [opts.timedOut]    - true when the server is resolving an unplayed ball
 */
function applyBat(match, userId, { shot, tapOffsetMs, power, timedOut = false }) {
    if (match.status !== STATUS.AWAITING_BAT) {
        return reject('NOT_AWAITING_BAT', 'No delivery is in flight.');
    }
    if (!timedOut) {
        if (!isParticipant(match, userId)) {
            return reject('NOT_A_PARTICIPANT', 'You are not in this match.');
        }
        if (userId !== strikerId(match)) {
            return reject('NOT_YOUR_TURN', 'You are bowling — you cannot bat this ball.');
        }
    }

    const striker = strikerId(match);
    const bowler = bowlerId(match);
    const bowl = match.pendingBowl;

    let timingBucket;
    let safeShot;

    if (timedOut) {
        timingBucket = 'missed';
        safeShot = 'none';
    } else {
        safeShot = VALID_SHOTS.includes(shot) ? shot : 'defensive';
        timingBucket = resolveTimingBucket({
            reportedOffsetMs: tapOffsetMs,
            serverElapsedMs: Date.now() - bowl.deliveredAt,
            flightMs: bowl.flightMs
        });

        // A good-length ball on the stumps can beat even a well-timed shot.
        if (bowl.length === 'good' && bowl.line === 'middle') {
            if (crypto.randomInt(100) < BOWLING.goodLengthPenaltyChance * 100) {
                timingBucket = degradeTiming(timingBucket);
            }
        }
    }

    const runs = pickOutcome(timingBucket, safeShot, Number(power) || POWER.baseline);
    const isWicket = runs < 0;
    const scored = isWicket ? 0 : runs;

    const strikerScore = match.scores[striker];
    strikerScore.runs += scored;
    if (isWicket) strikerScore.wickets += 1;
    strikerScore.balls.push(isWicket ? 'W' : scored);

    const events = [{
        type: 'ball_result',
        payload: {
            matchId: match.matchId,
            innings: match.innings,
            ball: match.ball,
            strikerId: striker,
            bowlerId: bowler,
            shot: safeShot,
            timing: timingBucket,
            runs: scored,
            isWicket,
            timedOut,
            scores: publicScores(match),
            target: match.target
        }
    }];

    match.pendingBowl = null;
    match.ball += 1;

    const inningsOver =
        match.ball > MATCH.ballsPerInnings ||
        strikerScore.wickets >= MATCH.wicketsPerInnings;

    // Chasing side passing the target ends the match immediately, as it should.
    const chaseComplete =
        match.innings === 2 && match.target !== null && strikerScore.runs >= match.target;

    if (chaseComplete) {
        finishMatch(match, striker, 'chase_complete');
        events.push(matchEndEvent(match));
    } else if (inningsOver) {
        if (match.innings === 1) {
            match.innings = 2;
            match.ball = 1;
            match.status = STATUS.AWAITING_BOWL;
            match.target = strikerScore.runs + 1;
            match.deadlineAt = Date.now() + MATCH.ballTimeoutMs;

            events.push({
                type: 'innings_end',
                payload: {
                    matchId: match.matchId,
                    target: match.target,
                    scores: publicScores(match),
                    nextStrikerId: strikerId(match),
                    nextBowlerId: bowlerId(match)
                }
            });
        } else {
            const [a, b] = match.order;
            let winner = null;
            if (match.scores[a].runs > match.scores[b].runs) winner = a;
            else if (match.scores[b].runs > match.scores[a].runs) winner = b;

            finishMatch(match, winner, winner ? 'runs' : 'tie');
            events.push(matchEndEvent(match));
        }
    } else {
        match.status = STATUS.AWAITING_BOWL;
        match.deadlineAt = Date.now() + MATCH.ballTimeoutMs;
    }

    return { ok: true, events };
}

function finishMatch(match, winnerUserId, reason) {
    match.status = STATUS.FINISHED;
    match.winnerUserId = winnerUserId;
    match.endReason = reason;
    match.pendingBowl = null;
    match.deadlineAt = null;
}

/** Ends a match early because a player left and did not come back. */
function forfeit(match, quitterUserId) {
    if (match.status === STATUS.FINISHED || match.status === STATUS.ABANDONED) return null;
    const winner = opponentOf(match, quitterUserId);
    finishMatch(match, winner, 'forfeit');
    match.forfeitedBy = quitterUserId;
    return matchEndEvent(match);
}

function matchEndEvent(match) {
    return {
        type: 'match_end',
        payload: {
            matchId: match.matchId,
            winnerUserId: match.winnerUserId,
            reason: match.endReason,
            scores: publicScores(match),
            target: match.target
        }
    };
}

/** Score view safe to send to both clients. */
function publicScores(match) {
    const out = {};
    for (const userId of match.order) {
        const s = match.scores[userId];
        out[userId] = { runs: s.runs, wickets: s.wickets, balls: [...s.balls] };
    }
    return out;
}

/**
 * Full state for a client joining or rejoining a match. Sent on reconnect so a
 * player who dropped mid-over comes back to the correct scoreboard.
 */
function publicState(match, forUserId) {
    const opponentId = opponentOf(match, forUserId);
    return {
        matchId: match.matchId,
        tourId: match.tourId,
        innings: match.innings,
        ball: match.ball,
        ballsPerInnings: MATCH.ballsPerInnings,
        wicketsPerInnings: MATCH.wicketsPerInnings,
        status: match.status,
        target: match.target,
        scores: publicScores(match),
        you: publicPlayer(match.players[forUserId]),
        opponent: publicPlayer(match.players[opponentId]),
        isBatting: strikerId(match) === forUserId,
        strikerId: strikerId(match),
        bowlerId: bowlerId(match),
        winnerUserId: match.winnerUserId,
        endReason: match.endReason,
        pendingBowl: match.pendingBowl ? { ...match.pendingBowl, perfectAtMs: Math.round(match.pendingBowl.flightMs * TIMING.perfectAtRatio) } : null
    };
}

function publicPlayer(p) {
    if (!p) return null;
    return {
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        countryCode: p.countryCode,
        level: p.level,
        connected: p.connected
    };
}

module.exports = {
    STATUS,
    createMatch,
    applyBowl,
    applyBat,
    forfeit,
    finishMatch,
    strikerId,
    bowlerId,
    opponentOf,
    isParticipant,
    publicState,
    publicScores,
    publicPlayer,
    matchEndEvent,
    // exported for tests
    resolveTimingBucket,
    flightMsForSpeed,
    pickOutcome
};
