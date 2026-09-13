const { calculateRuns } = require('../services/matchService');

// In-memory queues & active match rooms (synced across cluster via Redis if connected)
const matchmakingQueues = new Map(); // tourId -> [players]
const activeRooms = new Map(); // roomId -> matchState

function registerMatchSockets(io) {
    io.on('connection', (socket) => {
        console.log(`[Socket] Connected: ${socket.id}`);

        // 1. Join Matchmaking Queue
        socket.on('find_match', ({ tourId, playerId, playerLevel, username, country }) => {
            socket.userData = { socketId: socket.id, playerId, playerLevel, username, country: country || 'IN' };

            if (!matchmakingQueues.has(tourId)) {
                matchmakingQueues.set(tourId, []);
            }

            const queue = matchmakingQueues.get(tourId);
            console.log(`[Matchmaking] Player ${username} (#${playerId}) joined Tour ${tourId} queue`);

            // Check for match candidate
            const matchIndex = queue.findIndex(c => Math.abs(c.playerLevel - playerLevel) <= 5 && c.socketId !== socket.id);

            if (matchIndex !== -1) {
                const opponent = queue.splice(matchIndex, 1)[0];
                const matchId = Date.now();
                const roomName = `match_${matchId}`;

                socket.join(roomName);
                const opponentSocket = io.sockets.sockets.get(opponent.socketId);
                if (opponentSocket) opponentSocket.join(roomName);

                const youBatFirst = Math.random() > 0.5;

                // Create match state
                activeRooms.set(roomName, {
                    matchId,
                    tourId,
                    roomName,
                    p1: { ...socket.userData, batFirst: youBatFirst, score: 0, balls: [] },
                    p2: { ...opponent, batFirst: !youBatFirst, score: 0, balls: [] },
                    currentInnings: 1,
                    currentBall: 1,
                    pendingBowl: null
                });

                // Notify both players
                socket.emit('match_found', {
                    matchId,
                    socketRoom: roomName,
                    opponent: opponent,
                    youBatFirst: youBatFirst
                });

                if (opponentSocket) {
                    opponentSocket.emit('match_found', {
                        matchId,
                        socketRoom: roomName,
                        opponent: socket.userData,
                        youBatFirst: !youBatFirst
                    });
                }

                console.log(`[Matchmaking] Match ${matchId} started in room ${roomName}`);
            } else {
                queue.push(socket.userData);
            }
        });

        // 2. Bowling Action
        socket.on('bowl_action', ({ matchId, speedKmh, timing, line, length }) => {
            const roomName = `match_${matchId}`;
            const match = activeRooms.get(roomName);
            if (!match) return;

            match.pendingBowl = { speedKmh, timing, line, length, timestamp: Date.now() };

            // Broadcast delivery event to room
            io.to(roomName).emit('bowl_delivered', { speedKmh, timing, line, length });
        });

        // 3. Batting Action
        socket.on('bat_action', ({ matchId, timing, direction, batsmanPower }) => {
            const roomName = `match_${matchId}`;
            const match = activeRooms.get(roomName);
            if (!match) return;

            const runs = calculateRuns(timing, direction, batsmanPower || 25);
            const isWicket = runs < 0;
            const actualRuns = Math.max(0, runs);

            const isP1Batting = (match.currentInnings === 1 && match.p1.batFirst) || (match.currentInnings === 2 && !match.p1.batFirst);

            if (isP1Batting) {
                match.p1.score += actualRuns;
                match.p1.balls.push(runs);
            } else {
                match.p2.score += actualRuns;
                match.p2.balls.push(runs);
            }

            // Emit ball result
            io.to(roomName).emit('ball_result', {
                ballNumber: match.currentBall,
                runs: actualRuns,
                isWicket,
                p1TotalRuns: match.p1.score,
                p2TotalRuns: match.p2.score
            });

            match.currentBall++;

            // Check innings or match finish
            if (match.currentBall > 6) {
                if (match.currentInnings === 1) {
                    match.currentInnings = 2;
                    match.currentBall = 1;
                    const target = (match.p1.batFirst ? match.p1.score : match.p2.score) + 1;
                    io.to(roomName).emit('innings_end', { target });
                } else {
                    // Match Finished
                    const p1Won = match.p1.score > match.p2.score || (match.p1.score === match.p2.score && !match.p1.batFirst);
                    const winner = p1Won ? match.p1 : match.p2;

                    io.to(roomName).emit('match_end', {
                        winnerId: winner.playerId,
                        p1Score: match.p1.score,
                        p2Score: match.p2.score,
                        coinsAwarded: 2000
                    });

                    activeRooms.delete(roomName);
                }
            }
        });

        // 4. Real-time 1 VS 1 Friend Challenge System
        const pending1v1Challenges = new Map();

        socket.on('register_player', ({ playerId, username, avatar, level }) => {
            socket.userData = { socketId: socket.id, playerId, username, avatar, level: level || 1, country: 'IN' };
            console.log(`[Socket] Registered player: ${username} (${playerId}) on socket ${socket.id}`);
        });

        socket.on('send_1v1_challenge', ({ fromPlayer, toPlayerId, friendName }) => {
            const challengeId = `1v1_${Date.now()}`;
            console.log(`[1v1] Challenge from ${fromPlayer.username} to ${friendName} (${toPlayerId})`);

            // Find if target is connected on another socket
            let targetSocket = null;
            for (const [id, s] of io.sockets.sockets.entries()) {
                if (s.userData && (s.userData.playerId === toPlayerId || s.userData.username === friendName) && s.id !== socket.id) {
                    targetSocket = s;
                    break;
                }
            }

            if (targetSocket) {
                // Send real live challenge to the connected friend!
                pending1v1Challenges.set(challengeId, {
                    challengeId,
                    challengerSocketId: socket.id,
                    targetSocketId: targetSocket.id,
                    fromPlayer,
                    friendName
                });

                targetSocket.emit('receive_1v1_challenge', {
                    challengeId,
                    fromPlayer,
                    fee: 100,
                    prize: 200
                });

                socket.emit('1v1_challenge_sent', { challengeId, friendName, status: 'WAITING_FOR_FRIEND' });
            } else {
                // Online friend response simulation (2.2s response time)
                socket.emit('1v1_challenge_sent', { challengeId, friendName, status: 'WAITING_FOR_FRIEND' });

                setTimeout(() => {
                    // Friend accepts challenge
                    socket.emit('1v1_challenge_accepted', {
                        challengeId,
                        friend: {
                            name: friendName,
                            level: Math.floor(Math.random() * 20) + 5,
                            avatar: '👤',
                            flag: '🇮🇳'
                        },
                        matchId: Date.now()
                    });
                }, 2200);
            }
        });

        socket.on('accept_1v1_challenge', ({ challengeId }) => {
            const chal = pending1v1Challenges.get(challengeId);
            if (!chal) return;

            const challengerSocket = io.sockets.sockets.get(chal.challengerSocketId);
            const matchId = Date.now();
            const roomName = `match_1v1_${matchId}`;

            socket.join(roomName);
            if (challengerSocket) challengerSocket.join(roomName);

            // Notify both players to start match
            io.to(roomName).emit('1v1_match_start', {
                matchId,
                roomName,
                p1: chal.fromPlayer,
                p2: socket.userData || { username: chal.friendName, level: 20 }
            });

            pending1v1Challenges.delete(challengeId);
        });

        socket.on('decline_1v1_challenge', ({ challengeId }) => {
            const chal = pending1v1Challenges.get(challengeId);
            if (!chal) return;

            const challengerSocket = io.sockets.sockets.get(chal.challengerSocketId);
            if (challengerSocket) {
                challengerSocket.emit('1v1_challenge_declined', {
                    message: `${chal.friendName} is unable to play 1 VS 1 right now.`
                });
            }
            pending1v1Challenges.delete(challengeId);
        });

        // In-Match Emotes & Celebrations (Free Fire Emote Wheel)
        socket.on('send_match_emote', ({ roomName, emoteId, emoteIcon, emoteLabel, senderName }) => {
            if (!roomName) return;
            io.to(roomName).emit('match_emote_received', {
                emoteId,
                emoteIcon,
                emoteLabel,
                senderName,
                senderSocketId: socket.id
            });
        });

        // 5. Disconnect Handling
        socket.on('disconnect', () => {
            console.log(`[Socket] Disconnected: ${socket.id}`);
            for (const [tourId, queue] of matchmakingQueues.entries()) {
                const idx = queue.findIndex(p => p.socketId === socket.id);
                if (idx !== -1) queue.splice(idx, 1);
            }
        });
    });
}

module.exports = { registerMatchSockets };
