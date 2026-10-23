/* Server-confirmed progression and reward presentation for the existing game shell. */
(() => {
    'use strict';
    let config = null;
    let freeStatus = null;
    let serverOffset = 0;
    let claiming = false;
    let refreshInFlight = null;
    let lastLevel = null;

    const roadmapHero = document.querySelector('.roadmap-hero-card');
    roadmapHero?.insertAdjacentHTML('beforeend', `<div class="progression-guidance">
        <p id="progressionSummary">Loading your next reward…</p>
        <button id="priorityRewardBtn" class="progression-primary" hidden>Collect reward</button>
        <p class="progression-caption">New level rewards are added to your wallet automatically.</p>
        <div class="progression-pages"><button id="previousLevelsBtn">Earlier levels</button><button id="nextLevelsBtn">Later levels</button></div>
    </div>`);
    document.querySelector('#homeTourProgressWidget .widget-title')?.replaceChildren(document.createTextNode('PLAYER PROGRESSION'));
    document.getElementById('homeTourProgressWidget')?.insertAdjacentHTML('beforeend', '<div id="homeProgressHint" class="progression-caption">Syncing progress…</div>');
    document.getElementById('adNoticeToast')?.setAttribute('role', 'status');
    document.getElementById('adNoticeToast')?.setAttribute('aria-live', 'polite');

    async function refresh() {
        if (refreshInFlight) return refreshInFlight;
        refreshInFlight = (async () => {
            try {
                const [profileResponse, configResponse, rewardResponse] = await Promise.all([
                    fetch('/api/user/profile'), fetch('/api/config'), fetch('/api/rewards/status')
                ]);
                if (!profileResponse.ok || !configResponse.ok || !rewardResponse.ok) throw new Error('Sync unavailable');
                const [profile, balanceConfig, rewardData] = await Promise.all([profileResponse.json(), configResponse.json(), rewardResponse.json()]);
                if (!profile.success || !balanceConfig.success || !rewardData.success) throw new Error('Sync unavailable');
                config = balanceConfig;
                freeStatus = rewardData.status;
                serverOffset = freeStatus.serverNow - Date.now();
                applyServerUser(profile.user);
                if (lastLevel !== null && profile.user.level > lastLevel) {
                    showAdNotice(`Level ${profile.user.level} reached. Your level rewards have been added.`);
                }
                lastLevel = profile.user.level;
                const multiplier = Math.min(config.levelScaling.maximum, 1 + (profile.user.level - 1) * config.levelScaling.perLevel);
                const hint = document.getElementById('homeProgressHint');
                if (hint) hint.textContent = `Level ${profile.user.level} · ${multiplier.toFixed(2)}× match rewards`;
                renderFreeStatus();
            } catch {
                const hint = document.getElementById('homeProgressHint');
                if (hint) hint.textContent = 'Connection interrupted · progress will sync when online';
            } finally { refreshInFlight = null; }
        })();
        return refreshInFlight;
    }

    function renderFreeStatus() {
        const button = document.getElementById('freeInstantClaimBtn');
        if (!button) return;
        const label = button.querySelector('.free-claim-sub');
        const amount = button.querySelector('.free-claim-amount');
        if (!freeStatus) {
            button.disabled = true;
            if (label) label.textContent = 'Connecting…';
            return;
        }
        const remaining = Math.max(0, freeStatus.nextFreeAt - Date.now() - serverOffset);
        button.disabled = claiming || remaining > 0;
        button.classList.toggle('claimed', remaining > 0);
        if (amount) amount.textContent = freeStatus.freeCoins.toLocaleString();
        if (label) label.textContent = claiming ? 'Collecting…' : remaining > 0
            ? `Ready in ${Math.floor(remaining / 3600000)}h ${Math.floor(remaining % 3600000 / 60000)}m ${Math.floor(remaining % 60000 / 1000)}s`
            : `Collect +${freeStatus.freeXp} XP · Level ${freeStatus.level}`;
    }

    document.getElementById('freeInstantClaimBtn')?.addEventListener('click', async () => {
        if (claiming || !freeStatus || freeStatus.nextFreeAt > Date.now() + serverOffset) return;
        claiming = true;
        renderFreeStatus();
        try {
            const response = await fetch('/api/rewards/claim-free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || 'Reward was not confirmed. Try again.');
            applyServerUser(data.updatedUser);
            showAdNotice(data.message);
        } catch (error) { showAdNotice(error.message || 'Connection interrupted. Try again.'); }
        finally { claiming = false; await refresh(); renderFreeStatus(); }
    });
    document.getElementById('freeCoinsWidget')?.addEventListener('click', refresh);

    function renderRoadmap(data) {
        const recommended = data.recommendedClaim;
        const next = data.nextMilestone;
        const summary = document.getElementById('progressionSummary');
        if (summary) summary.textContent = recommended
            ? `${data.claimableCount} reward${data.claimableCount === 1 ? '' : 's'} ready. Priority: level ${recommended.level} · ${recommended.coins.toLocaleString()} coins + ${recommended.gems.toLocaleString()} gems.`
            : next ? `Next milestone: level ${next.level} · ${next.coins.toLocaleString()} coins + ${next.gems.toLocaleString()} gems.` : 'All levels completed.';
        const priority = document.getElementById('priorityRewardBtn');
        if (priority) {
            priority.hidden = !recommended;
            priority.textContent = recommended ? `Collect level ${recommended.level} reward` : '';
            priority.onclick = async () => {
                priority.disabled = true;
                try { await window.claimRoadmapMilestone(recommended.level); await refresh(); }
                finally { priority.disabled = false; }
            };
        }
        for (const [id, start] of [['previousLevelsBtn', data.previousStart], ['nextLevelsBtn', data.nextStart]]) {
            const button = document.getElementById(id);
            button.disabled = start === null;
            button.onclick = () => loadRoadmapFromDb(start);
        }
    }

    window.addEventListener('server-action', event => {
        const data = event.detail;
        if (data.updatedUser || data.user) applyServerUser(data.updatedUser || data.user);
        // Let the initiating handler finish before synchronising legacy feature displays.
        setTimeout(refresh, 0);
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) { refresh(); loadToursFromDb(); }
    });
    window.addEventListener('online', refresh);
    window.ProgressionUI = { refresh, renderRoadmap };
    window.Session.ready.then(refresh);
    setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    setInterval(renderFreeStatus, 1000);
    renderFreeStatus();
})();
