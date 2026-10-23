/* The existing 3D renderer presents events; only the server decides results. */
(() => {
    'use strict';
    let state = null;
    let deliveryKey = null;
    let deliveredAt = null;
    let sent = false;
    let needleFrame = null;
    const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const isCurrent = event => state && event.matchId === state.matchId;
    const setDisabled = disabled => document.querySelectorAll('.shot-action-btn').forEach(button => { button.disabled = disabled; });

    function render() {
        if (!state) return;
        const me = state.scores[state.you.userId];
        const opponent = state.scores[state.opponent.userId];
        text('hudMatchPlayerName', state.you.username);
        text('hudMatchOpponentName', state.opponent.username);
        text('hudMatchPlayerScore', `${me.runs}/${me.wickets}`);
        text('hudMatchOpponentScore', `${opponent.runs}/${opponent.wickets}`);
        text('matchP1Score', me.runs);
        text('matchTargetVal', state.target ?? '—');
        text('matchInningsLabel', `INNINGS ${state.innings}`);
        text('battingHintText', state.opponent.connected === false ? 'Opponent reconnecting. Stay ready.'
            : state.status === 'awaiting_bat' ? 'Tap as the needle reaches the blue zone.' : 'Wait for the bowler to deliver.');
        const bowler = state.isBatting ? state.opponent : state.you;
        document.querySelector('#currentBowlerBadge .bowler-name-label').textContent = bowler.username;
        document.querySelector('#currentBowlerBadge .bowler-type-label').textContent = state.pendingBowl ? `${state.pendingBowl.speedKmh} km/h` : 'Preparing delivery';
        text('matchRoleLabel', !socket.connected ? 'RECONNECTING…' : state.status === 'finished' ? 'MATCH COMPLETE'
            : state.isBatting ? state.status === 'awaiting_bat' ? 'PLAY YOUR SHOT' : 'WAITING FOR DELIVERY' : 'BOWLING');
        document.getElementById('battingControlsOverlay')?.classList.toggle('hidden', !state.isBatting);
        document.getElementById('bowlingControlsOverlay')?.classList.toggle('hidden', state.isBatting);
        document.getElementById('verticalTimingMeter')?.classList.toggle('hidden', !state.isBatting);
        setDisabled(!socket.connected || !state.isBatting || state.status !== 'awaiting_bat' || sent);
        const bowl = document.getElementById('lockDeliveryBtn');
        if (bowl) bowl.disabled = !socket.connected || state.isBatting || state.status !== 'awaiting_bowl' || sent;
        const innings = state.scores[state.strikerId];
        for (let i = 0; i < state.ballsPerInnings; i++) {
            const dot = document.getElementById(`bdot-${i}`);
            if (!dot) continue;
            const result = innings?.balls[i];
            dot.textContent = result === undefined ? '' : result === 0 ? '•' : result;
            dot.className = `ball-slot-circle ${result === 'W' ? 'scored-wicket' : result === 6 ? 'scored-six' : result === 4 ? 'scored-four' : result === 0 ? 'scored-dot' : ''}`;
        }
        window.Match3DEngine?.setCameraMode(state.isBatting ? 'batting' : 'bowling');
    }

    function startNeedle(bowl, resumed = false) {
        const key = `${state.matchId}:${state.innings}:${state.ball}:${bowl.deliveredAt}`;
        if (deliveryKey === key) return;
        deliveryKey = key;
        deliveredAt = performance.now() - (resumed ? Math.max(0, Date.now() - bowl.deliveredAt) : 0);
        window.Match3DEngine?.showDelivery(bowl, deliveredAt);
        sent = false;
        cancelAnimationFrame(needleFrame);
        const animate = () => {
            if (!state || state.status !== 'awaiting_bat' || sent) return;
            const ratio = Math.min(1, (performance.now() - deliveredAt) / bowl.flightMs);
            const needle = document.getElementById('verticalTimingNeedle');
            if (needle) needle.style.top = `${4 + ratio * 90}%`;
            needleFrame = requestAnimationFrame(animate);
        };
        animate();
    }

    function acceptState(next, opening = false) {
        if (state && state.matchId !== next.matchId && !opening) return;
        const previousStatus = state?.status;
        state = next;
        clearInterval(inMatchState.timingInterval);
        if (opening) {
            closeMatchmakingModal();
            for (const id of ['customRoomModal', 'waitingFriendModal', 'incomingChallengeModal']) document.getElementById(id)?.classList.add('hidden');
            clearInterval(active1v1ChallengeTimer);
            navigateTo('screen-match');
            window.Match3DEngine?.init('match3dCanvas', 'inmatchStadiumViewport');
        }
        if (next.status !== previousStatus || next.status === 'awaiting_bowl') sent = false;
        if (next.pendingBowl) startNeedle(next.pendingBowl, opening);
        render();
    }

    socket.on('match_found', next => acceptState(next, true));
    socket.on('match_resumed', next => acceptState(next, true));
    socket.on('match_state', next => acceptState(next, !state));
    socket.on('bowl_delivered', event => {
        if (!isCurrent(event)) return;
        state.status = 'awaiting_bat';
        state.pendingBowl = event;
        startNeedle(event);
        render();
    });
    socket.on('ball_result', event => {
        if (!isCurrent(event)) return;
        sent = true;
        cancelAnimationFrame(needleFrame);
        state.scores = event.scores;
        window.Match3DEngine?.triggerShot(event.shot, event.isWicket ? -1 : event.runs, event.timing.toUpperCase());
        text('shotFeedbackPopup', event.isWicket ? 'WICKET' : `${event.timing.toUpperCase()} · ${event.runs} RUN${event.runs === 1 ? '' : 'S'}`);
        document.getElementById('shotFeedbackPopup')?.classList.remove('hidden');
        setTimeout(() => document.getElementById('shotFeedbackPopup')?.classList.add('hidden'), 1200);
        render();
    });

    function showResult(event, payout) {
        const won = event.winnerUserId === state.you.userId;
        const tied = event.winnerUserId === null;
        state.status = 'finished';
        document.getElementById('matchMenuDialog')?.close();
        state.scores = event.scores;
        sent = true;
        cancelAnimationFrame(needleFrame);
        navigateTo('screen-result');
        text('winnerHeadline', tied ? 'MATCH DRAWN' : won ? 'VICTORY' : 'MATCH DEFEAT');
        document.querySelector('.winner-crown-3d').textContent = tied ? '🏏' : won ? '🏆' : '🏏';
        text('summaryP1Score', event.scores[state.you.userId].runs);
        text('summaryP2Score', event.scores[state.opponent.userId].runs);
        for (const [id, player] of [['resultP1Card', state.you], ['resultP2Card', state.opponent]]) {
            const card = document.getElementById(id);
            card.className = `result-player-card ${event.winnerUserId === player.userId ? 'card-winner' : 'card-loser'}`;
            card.querySelector('.card-winner-badge').hidden = event.winnerUserId !== player.userId;
            card.querySelector('.res-name').textContent = player.username;
            card.querySelector('.res-star').textContent = `Level ${player.level}`;
            card.querySelector('.res-avatar').textContent = '🏏';
        }
        const notice = document.getElementById('payoutNotification');
        const progressUser = payout?.user || gameState;
        const maxXp = progressUser.max_xp || gameState.maxXp || 50;
        text('resultProgressTitle', `LEVEL ${progressUser.level} PROGRESSION`);
        text('resultProgressLabel', `${progressUser.xp} / ${maxXp} XP`);
        document.getElementById('resultProgressFill').style.width = `${Math.min(100, progressUser.xp / maxXp * 100)}%`;
        if (!payout) {
            notice.innerHTML = '<div class="payout-title">CONFIRMING YOUR REWARDS…</div><p>Your result is being saved.</p>';
            return;
        }
        const milestoneCoins = payout.milestoneRewards.reduce((sum, reward) => sum + reward.coins, 0);
        const milestoneGems = payout.milestoneRewards.reduce((sum, reward) => sum + reward.gems, 0);
        notice.innerHTML = `<div class="payout-title">REWARDS COLLECTED</div>
            <div class="payout-rewards-row"><div class="payout-pill">+${payout.coins.toLocaleString()} coins</div><div class="payout-pill">+${payout.xp} XP</div></div>
            <p class="progression-caption">${payout.breakdown.levelMultiplier.toFixed(2)}× level bonus · ${payout.breakdown.performanceXp} performance XP</p>
            ${payout.leveledUp ? `<p class="progression-level-up">LEVEL ${payout.newLevel} REACHED</p><p>Level rewards: +${(payout.levelUpCoins + milestoneCoins).toLocaleString()} coins · +${milestoneGems.toLocaleString()} gems</p>` : ''}`;
        applyServerUser(payout.user);
        window.ProgressionUI?.refresh();
        if (won) window.Match3DEngine?.celebrateVictory();
    }
    socket.on('match_end', event => { if (isCurrent(event)) showResult(event, null); });
    socket.on('match_settled', event => { if (isCurrent(event)) showResult(event, event.payout); });
    socket.on('match_settlement_pending', event => {
        if (isCurrent(event)) text('payoutNotification', event.message);
    });
    socket.on('matchmaking_started', event => {
        gameState.coins = event.balance;
        updateHud();
        setSearchStatus('Finding an opponent near your level…');
    });
    for (const name of ['matchmaking_cancelled', 'matchmaking_timeout']) {
        socket.on(name, event => {
            if (event.balance !== null) { gameState.coins = event.balance; updateHud(); }
            matchmaking.active = false;
            if (!state) {
                if (name === 'matchmaking_timeout') showPlayWithBotPrompt();
                else closeMatchmakingModal();
            }
        });
    }
    socket.on('match_error', event => { sent = false; render(); showAdNotice(event.message); });
    socket.on('disconnect', render);
    socket.on('connect', () => window.ProgressionUI?.refresh());

    document.querySelectorAll('.shot-action-btn').forEach(button => button.addEventListener('click', () => {
        if (!state || !socket.connected || sent || !state.isBatting || state.status !== 'awaiting_bat' || deliveredAt === null) return;
        sent = true;
        socket.emit('bat_action', { matchId: state.matchId, shot: button.dataset.shot.toLowerCase(), tapOffsetMs: performance.now() - deliveredAt });
        render();
    }));
    document.getElementById('lockDeliveryBtn')?.addEventListener('click', () => {
        if (!state || !socket.connected || sent || state.isBatting || state.status !== 'awaiting_bowl') return;
        sent = true;
        socket.emit('bowl_action', { matchId: state.matchId,
            speedKmh: Number(document.getElementById('bowlSpeedSlider').value),
            line: document.querySelector('#bowlLineGroup .active')?.dataset.line || 'middle',
            length: document.querySelector('#bowlLengthGroup .active')?.dataset.length || 'good' });
        render();
    });
    for (const id of ['bowlLineGroup', 'bowlLengthGroup']) {
        document.querySelectorAll(`#${id} button`).forEach(button => button.addEventListener('click', () => {
            document.querySelectorAll(`#${id} button`).forEach(option => option.classList.toggle('active', option === button));
        }));
    }
    document.getElementById('bowlSpeedSlider')?.addEventListener('input', event => text('bowlSpeedValue', event.target.value));

    const matchMenu = document.getElementById('matchMenuDialog');
    document.getElementById('matchMenuBtn')?.addEventListener('click', () => {
        text('matchLeaveDescription', state ? 'The match continues while this menu is open. Leaving forfeits your entry fee and match rewards.' : 'Leave this free practice session and return home.');
        matchMenu.showModal();
    });
    document.getElementById('stayInMatchBtn')?.addEventListener('click', () => matchMenu.close());
    document.getElementById('leaveLiveMatchBtn')?.addEventListener('click', () => {
        if (state) {
            if (!socket.connected) return showAdNotice('Reconnecting. Wait for the connection to return.');
            socket.emit('leave_match', { matchId: state.matchId });
        } else {
            inMatchState.cancelled = true;
            clearInterval(inMatchState.timingInterval);
            navigateTo('screen-home');
        }
        matchMenu.close();
    });

    let outgoingChallenge = null;
    socket.on('1v1_challenge_sent', event => {
        outgoingChallenge = event.challengeId;
        let seconds = 60;
        clearInterval(active1v1ChallengeTimer);
        text('waitingCountdownText', `${seconds}s`);
        active1v1ChallengeTimer = setInterval(() => {
            text('waitingCountdownText', `${--seconds}s`);
            if (seconds <= 0) {
                clearInterval(active1v1ChallengeTimer);
                document.getElementById('waitingFriendModal')?.classList.add('hidden');
                showAdNotice('Challenge expired. No entry fee was charged.');
            }
        }, 1000);
    });
    for (const event of ['1v1_challenge_declined', '1v1_challenge_unavailable']) socket.on(event, data => {
        clearInterval(active1v1ChallengeTimer);
        document.getElementById('waitingFriendModal')?.classList.add('hidden');
        showAdNotice(data.message || 'Your friend declined the challenge.');
    });
    socket.on('receive_1v1_challenge', data => {
        currentPending1v1Challenge = data;
        text('challengerName', data.from.username);
        text('challengerRank', `Level ${data.from.level}`);
        document.getElementById('incomingChallengeModal')?.classList.remove('hidden');
    });
    socket.on('1v1_challenge_cancelled', data => {
        if (data.challengeId !== currentPending1v1Challenge?.challengeId) return;
        currentPending1v1Challenge = null;
        document.getElementById('incomingChallengeModal')?.classList.add('hidden');
        showAdNotice('The challenge was cancelled.');
    });
    document.getElementById('accept1v1Btn')?.addEventListener('click', () => {
        if (!currentPending1v1Challenge) return;
        socket.emit('accept_1v1_challenge', { challengeId: currentPending1v1Challenge.challengeId });
        document.getElementById('incomingChallengeModal')?.classList.add('hidden');
        currentPending1v1Challenge = null;
    });
    document.getElementById('decline1v1Btn')?.addEventListener('click', () => {
        if (currentPending1v1Challenge) socket.emit('decline_1v1_challenge', { challengeId: currentPending1v1Challenge.challengeId });
        document.getElementById('incomingChallengeModal')?.classList.add('hidden');
        currentPending1v1Challenge = null;
    });
    document.getElementById('cancel1v1ChallengeBtn')?.addEventListener('click', () => {
        clearInterval(active1v1ChallengeTimer);
        if (outgoingChallenge) socket.emit('cancel_1v1_challenge', { challengeId: outgoingChallenge });
        outgoingChallenge = null;
        document.getElementById('waitingFriendModal')?.classList.add('hidden');
    });
    document.getElementById('btnCreateCustomRoom')?.addEventListener('click', () => {
        if (!socket.connected) return showAdNotice('Connect to the server to create a room.');
        socket.emit('create_custom_room', { stadium: document.getElementById('customRoomStadiumSelect')?.value });
    });
    socket.on('custom_room_created', event => {
        text('createdRoomCodeVal', event.roomCode);
        [...event.roomCode].forEach((digit, index) => text(`pinDigit${index + 1}`, digit));
        document.getElementById('roomCreatedBox')?.classList.remove('hidden');
    });
    socket.on('custom_room_expired', event => {
        document.getElementById('roomCreatedBox')?.classList.add('hidden');
        showAdNotice(event.message);
    });
    document.getElementById('btnJoinCustomRoom')?.addEventListener('click', () => {
        const roomCode = document.getElementById('joinRoomCodeInput')?.value.trim();
        if (!/^\d{4}$/.test(roomCode)) return showAdNotice('Enter the four-digit room code.');
        if (!socket.connected) return showAdNotice('Connect to the server to join a room.');
        socket.emit('join_custom_room', { roomCode });
    });
    for (const id of ['resultContinueBtn', 'resultRematchBtn']) {
        document.getElementById(id)?.addEventListener('click', () => {
            state = null; deliveryKey = null; deliveredAt = null; sent = false;
            cancelAnimationFrame(needleFrame);
            window.ProgressionUI?.refresh();
        });
    }
    window.LiveMatch = { get active() { return state !== null; } };
})();
