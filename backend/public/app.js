// Real-Time Socket Connection with Auto-Reconnection & BFCache Handling
// Resilient bootstrap: if socket.io failed to load (offline, or the realtime
// backend is briefly unavailable) fall back to an inert stub so the rest of
// the app — 3D hero, navigation, wallet UI — still runs instead of dying here
// on "io is not defined".
const socket = (typeof io !== 'undefined')
    ? io({
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling']
    })
    : (function () {
        console.warn('⚠️ socket.io unavailable — running in offline UI mode (no realtime sync).');
        const noop = function () { return this; };
        return { on: noop, off: noop, emit: noop, connect: noop, disconnect: noop, connected: false, id: null };
    })();

// Handle Back-Forward Cache (BFCache) & Page Lifecycle Gracefully
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        console.log('🔄 Restored from BFCache: Resyncing socket & game state...');
        if (socket && !socket.connected) {
            socket.connect();
        }
        if (typeof initUserProfileFromDb === 'function') {
            initUserProfileFromDb();
        }
    }
});

window.addEventListener('pagehide', (event) => {
    if (event.persisted && socket && socket.connected) {
        socket.disconnect();
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && socket && !socket.connected) {
        socket.connect();
    }
});

socket.on('connect', () => {
    console.log('⚡ Socket connected to server:', socket.id);
});

socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
});

// Persistent Wallet & Game State (All loaded dynamically from MySQL)
let gameState = {
    coins: 0,
    gems: 0,
    level: 1,
    xp: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    totalSixes: 0,
    username: "Player",
    countryCode: "IN",
    countryFlag: "🇮🇳",
    countryName: "India",
    isMajorCountry: true,
    teamPower: 380,
    referralCode: "",
    activeTab: "playing11",
    playing11: [],
    bowlers: [],
    batsmen: [],
    ballSkins: []
};

// XP Required for Level Formula (Unlimited scaling)
function getXpForLevel(lvl) {
    return Math.round(50 * Math.pow(lvl, 1.35));
}

// Add XP and handle level up
function addXp(amount, reason = "Game Action") {
    gameState.xp += amount;
    let leveledUp = false;
    let lastNewLevel = gameState.level;

    while (gameState.xp >= getXpForLevel(gameState.level)) {
        gameState.xp -= getXpForLevel(gameState.level);
        gameState.level++;
        leveledUp = true;
        lastNewLevel = gameState.level;
    }

    if (leveledUp) {
        const bonusCoins = lastNewLevel * 100;
        gameState.coins += bonusCoins;
        showLevelUpCelebration(lastNewLevel, bonusCoins);
    }

    updateHud();
}

function showLevelUpCelebration(newLevel, bonusCoins) {
    const modal = document.getElementById('levelUpModal');
    if (!modal) return;
    document.getElementById('levelUpNewNum').textContent = `⭐ ${newLevel}`;
    document.getElementById('levelUpBonusVal').textContent = `+${bonusCoins.toLocaleString()} 🪙 Coins`;
    modal.classList.remove('hidden');
}

document.getElementById('claimLevelUpBtn')?.addEventListener('click', () => {
    document.getElementById('levelUpModal')?.classList.add('hidden');
    updateHud();
    renderTourList();
});

// Load User Profile from MySQL Database
async function initUserProfileFromDb() {
    try {
        const res = await fetch('/api/user/profile');
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.user) {
                gameState.userId = data.user.id ?? 1;
                gameState.coins = data.user.coins ?? gameState.coins;
                gameState.gems = data.user.gems ?? gameState.gems;
                gameState.level = data.user.level ?? gameState.level;
                gameState.xp = data.user.xp ?? gameState.xp;
                gameState.matchesPlayed = data.user.matches_played ?? gameState.matchesPlayed;
                gameState.matchesWon = data.user.matches_won ?? gameState.matchesWon;
                gameState.totalSixes = data.user.total_sixes ?? gameState.totalSixes;
                gameState.username = data.user.username ?? gameState.username;
                gameState.countryCode = data.user.country_code ?? gameState.countryCode;
                gameState.countryFlag = data.user.country_flag ?? gameState.countryFlag;
                gameState.countryName = data.user.country_name ?? gameState.countryName;
                gameState.isMajorCountry = data.user.is_major_country ?? gameState.isMajorCountry;
                gameState.referralCode = data.user.referral_code ?? gameState.referralCode;
                updateHud();
                updateHeroBatsmanVisual(gameState.countryCode);
                // Apply the saved 3D character look (SQL wins for a logged-in user)
                // and let the studio settle the first-launch onboarding decision.
                if (window.CharacterStudio) window.CharacterStudio.onProfileLoaded(data.user.character_config || null);
            }
        }
    } catch (e) {
        console.warn('MySQL API sync fallback to local');
        if (window.CharacterStudio) window.CharacterStudio.onProfileLoaded(null);
    }
}

function updateHeroBatsmanVisual(countryCode) {
    if (window.Hero3DBatsman && window.Hero3DBatsman.setCountry) {
        window.Hero3DBatsman.setCountry(countryCode || gameState.countryCode || 'IN');
    }
}

// Initialize 3D Batsman Engine
function init3DBatsmanEngine() {
    if (window.Hero3DBatsman && window.Hero3DBatsman.init) {
        window.Hero3DBatsman.init('hero3dCanvas', 'heroCharacterStage');
        const cs = window.CharacterStudio;
        if (cs && cs.isOnboarded && cs.isOnboarded()) {
            // returning player — restore their exact saved character
            window.Hero3DBatsman.applyConfig(cs.getActiveConfig());
        } else if (gameState.countryCode) {
            window.Hero3DBatsman.setCountry(gameState.countryCode);
        }
    }
}

// Setup Avatar Customizer Studio Events
function setupAvatarCustomizerEvents() {
    const modal = document.getElementById('avatarCustomizerModal');
    const openBtn = document.getElementById('openAvatarCustomizerBtn');
    const closeBtn = document.getElementById('closeAvatarCustomizerModal');
    const saveBtn = document.getElementById('saveAvatarCustomizerBtn');

    if (openBtn) {
        openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (modal) modal.classList.remove('hidden');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (modal) modal.classList.add('hidden');
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (modal) modal.classList.add('hidden');
            const toast = document.getElementById('practiceToast');
            if (toast) {
                toast.textContent = 'AVATAR SAVED! 🌟';
                toast.classList.remove('hidden');
                setTimeout(() => {
                    toast.textContent = 'POWERFUL SHOT! 🏏';
                    toast.classList.add('hidden');
                }, 1500);
            }
        });
    }

    // Tab Switching
    document.querySelectorAll('.customizer-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.customizer-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const targetTab = btn.dataset.tab;
            document.querySelectorAll('.customizer-tab-content').forEach(c => c.classList.add('hidden'));

            const tabMap = {
                'skin': 'tabContentSkin',
                'hair': 'tabContentHair',
                'beard': 'tabContentBeard',
                'kit': 'tabContentKit',
                'bat': 'tabContentBat'
            };
            const activeContent = document.getElementById(tabMap[targetTab]);
            if (activeContent) activeContent.classList.remove('hidden');
        });
    });

    // Skin Swatches
    document.querySelectorAll('.skin-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.skin-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            if (window.Hero3DBatsman) {
                window.Hero3DBatsman.setSkinTone(swatch.dataset.tone, swatch.dataset.index);
            }
        });
    });

    // Hair Style & Color
    document.querySelectorAll('.option-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.option-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            if (window.Hero3DBatsman) {
                window.Hero3DBatsman.setHair(pill.dataset.style, null);
            }
        });
    });

    document.querySelectorAll('.hair-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.hair-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            if (window.Hero3DBatsman) {
                window.Hero3DBatsman.setHair(null, swatch.dataset.color);
            }
        });
    });

    // Beard Styles
    document.querySelectorAll('.beard-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.beard-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            if (window.Hero3DBatsman) {
                window.Hero3DBatsman.setBeard(pill.dataset.style, null);
            }
        });
    });

    // Country Kits
    document.querySelectorAll('.kit-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.kit-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            const countryCode = pill.dataset.country;
            gameState.countryCode = countryCode;
            updateHud();
            if (window.Hero3DBatsman) {
                window.Hero3DBatsman.setCountry(countryCode);
            }
        });
    });

    // Bat Skins
    document.querySelectorAll('.bat-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.bat-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            if (window.Hero3DBatsman) {
                window.Hero3DBatsman.setBatSkin(pill.dataset.bat);
            }
        });
    });
}

function saveState() {
    try {
        localStorage.setItem('cricket_league_save_v4', JSON.stringify({
            coins: gameState.coins,
            gems: gameState.gems,
            level: gameState.level,
            xp: gameState.xp,
            matchesPlayed: gameState.matchesPlayed,
            matchesWon: gameState.matchesWon,
            totalSixes: gameState.totalSixes,
            username: gameState.username,
            referralCode: gameState.referralCode
        }));

        // Persist to MySQL database in background
        fetch('/api/user/update-wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coins: gameState.coins,
                gems: gameState.gems,
                xp: gameState.xp,
                level: gameState.level
            })
        }).catch(() => { });
    } catch (e) { }
}

// Update HUD Balances and Level Badge
function updateHud(animate = true) {
    const coinsEl = document.getElementById('hudCoins');
    const gemsEl = document.getElementById('hudGems');
    const levelEl = document.getElementById('hudPlayerLevel');

    if (coinsEl) coinsEl.textContent = gameState.coins.toLocaleString();
    if (gemsEl) gemsEl.textContent = gameState.gems.toLocaleString();
    if (levelEl) levelEl.textContent = `⭐ ${gameState.level}`;

    // Update all dynamic username elements across screens
    const matchName = document.getElementById('matchmakingMyName');
    const prematchName = document.getElementById('prematchMyName');
    const hudMatchName = document.getElementById('hudMatchPlayerName');
    const matchResName = document.getElementById('matchResMyName');
    const leagueName = document.getElementById('leagueMyName');
    const profileName = document.getElementById('profileUsername');

    if (matchName) matchName.textContent = gameState.username;
    if (prematchName) prematchName.textContent = gameState.username;
    if (hudMatchName) hudMatchName.textContent = gameState.username;
    if (matchResName) matchResName.textContent = gameState.username;
    if (leagueName) leagueName.textContent = gameState.username;
    if (profileName) profileName.textContent = gameState.username;

    // Update Home Cricket World Tour XP Widget
    const homeXpFill = document.getElementById('homeXpFill');
    const homeNextReward = document.getElementById('homeNextRewardTag');
    const reqXp = getXpForLevel(gameState.level);
    const xpPct = Math.min(100, Math.round((gameState.xp / reqXp) * 100));

    if (homeXpFill) {
        homeXpFill.style.width = `${xpPct}%`;
        homeXpFill.textContent = `${gameState.xp}/${reqXp}`;
    }
    if (homeNextReward) {
        homeNextReward.textContent = `⭐ ${gameState.level + 1}`;
    }

    // Update Country Flags across HUD & Header
    const avatarEl = document.querySelector('.avatar-img');
    if (avatarEl) avatarEl.textContent = gameState.countryFlag || '🇮🇳';

    const pAvatars = document.querySelectorAll('.p-avatar, .p-avatar-circle, .hud-avatar, .res-avatar, .my-avatar');
    pAvatars.forEach(el => {
        el.textContent = gameState.countryFlag || '🇮🇳';
    });

    saveState();
}

// Bind Header Avatar to open Country & Starting 11 Selection Modal
document.getElementById('headerAvatarBtn')?.addEventListener('click', () => {
    openCountrySelectionModal();
});

// Bind ⚙️ settings button to open the re-editable Character Studio
document.getElementById('settingsBtn')?.addEventListener('click', () => {
    if (window.CharacterStudio) window.CharacterStudio.openStudio('edit');
});

// Bind Home World Tour widget click to open Level Roadmap
document.getElementById('homeTourProgressWidget')?.addEventListener('click', () => {
    openLevelRoadmap();
});

// Switch Screens
function navigateTo(screenId) {
    document.querySelectorAll('.screen-panel').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(screenId);
    if (target) target.classList.remove('hidden');

    // Update Bottom Nav active state
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === screenId);
    });

    // Refresh dynamic friends/clubs data when entering screen
    if (screenId === 'screen-friends') {
        loadDynamicFriendsData();
    }

    // Render 3D Ball Skins Store when entering Shop screen
    if (screenId === 'screen-shop') {
        if (typeof initBallSkinsEngine === 'function') initBallSkinsEngine();
        else if (typeof renderShopBallSkinsGrid === 'function') renderShopBallSkinsGrid();
    }

    // Synchronize Team tab sections when entering screen-team
    if (screenId === 'screen-team') {
        const currentTab = gameState.activeTab || 'playing11';
        if (typeof setActiveSquadTab === 'function' && typeof showTeamSection === 'function') {
            if (currentTab === 'balls') {
                setActiveSquadTab('tabBalls');
                showTeamSection('sectionBalls');
                if (typeof initBallSkinsEngine === 'function') initBallSkinsEngine();
            } else if (currentTab === 'bowlers') {
                setActiveSquadTab('tabBowlers');
                showTeamSection('sectionTraditionalSquad');
                if (typeof renderSquadCards === 'function') renderSquadCards();
            } else if (currentTab === 'batsmen') {
                setActiveSquadTab('tabBatsmen');
                showTeamSection('sectionTraditionalSquad');
                if (typeof renderSquadCards === 'function') renderSquadCards();
            } else {
                setActiveSquadTab('tabPlaying11');
                showTeamSection('sectionPlaying11');
                if (typeof renderSquadCards === 'function') renderSquadCards();
            }
        }
    }
}

// Global Screen Back Buttons (Returns smoothly to Home)
document.getElementById('tourBackBtn')?.addEventListener('click', () => navigateTo('screen-home'));
document.getElementById('friendsBackBtn')?.addEventListener('click', () => navigateTo('screen-home'));
document.getElementById('leaderboardBackBtn')?.addEventListener('click', () => navigateTo('screen-home'));
document.getElementById('clubsBackBtn')?.addEventListener('click', () => navigateTo('screen-home'));
document.getElementById('teamBackBtn')?.addEventListener('click', () => navigateTo('screen-home'));
document.getElementById('shopBackBtn')?.addEventListener('click', () => navigateTo('screen-home'));
document.getElementById('ballsBackBtn')?.addEventListener('click', () => navigateTo('screen-team'));

// Bottom Navigation Bar Tab Switching
document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetScreen = btn.dataset.target;
        if (targetScreen) {
            navigateTo(targetScreen);
        }
    });
});

// Home Screen Action Widgets
document.getElementById('friendsWidget')?.addEventListener('click', () => navigateTo('screen-friends'));

// ----------------------------------------------------
// Screen 1: Splash Screen Initialization
// ----------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
    updateHud(false);

    let progress = 0;
    const bar = document.getElementById('splashBarFill');
    const tip = document.getElementById('splashTip');

    const splashTimer = setInterval(() => {
        progress += 4;
        if (bar) bar.style.width = `${progress}%`;

        if (progress === 32 && tip) tip.textContent = 'Synchronizing Player Cards & Wallet...';
        if (progress === 72 && tip) tip.textContent = 'Connecting to Real-time Cricket Engine...';

        if (progress >= 100) {
            clearInterval(splashTimer);
            setTimeout(() => {
                navigateTo('screen-home');
                if (window.CharacterStudio) window.CharacterStudio.onSplashComplete();
            }, 300);
        }
    }, 45);

    renderSquadCards();
    if (typeof initBallSkinsEngine === 'function') initBallSkinsEngine();
    renderTourList();
});

// ----------------------------------------------------
// Screen 2: Home Interactions
// ----------------------------------------------------
// Batsman Practice Tap
const batsmanStage = document.getElementById('heroCharacterStage');
if (batsmanStage) {
    batsmanStage.addEventListener('click', () => {
        const batsman = document.getElementById('batsman3d');
        const toast = document.getElementById('practiceToast');

        if (batsman) {
            batsman.style.transform = 'scale(1.15) rotate(-15deg)';
            setTimeout(() => { batsman.style.transform = 'scale(1)'; }, 200);
        }

        if (toast) {
            toast.classList.remove('hidden');
            setTimeout(() => { toast.classList.add('hidden'); }, 1200);
        }
    });
}

// Play Button -> Matchmaking
document.getElementById('homePlayBtn')?.addEventListener('click', () => {
    navigateTo('screen-matchmaking');
});

// ----------------------------------------------------
// Realistic Foil Packet Tearing & 1-by-1 Card Reveal
// ----------------------------------------------------
let packRevealState = {
    currentIndex: 0,
    items: [],
    isTorn: false
};

// Ready Pack Open (Slot 2)
document.getElementById('openReadyPackBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    launchPackTearSequence();
});

function launchPackTearSequence() {
    const modal = document.getElementById('packOpeningModal');
    const tearContainer = document.getElementById('packetTearContainer');
    const topStrip = document.getElementById('packetTopStrip');
    const mainBody = document.querySelector('.packet-main-body');
    const revealStage = document.getElementById('revealStage');

    // Reset Stages
    tearContainer?.classList.remove('hidden');
    revealStage?.classList.add('hidden');
    topStrip?.classList.remove('torn');
    mainBody?.classList.remove('burst');
    modal?.classList.remove('hidden');

    packRevealState.isTorn = false;
    packRevealState.currentIndex = 0;
    packRevealState.items = [
        {
            type: 'coins',
            amount: 2500,
            title: '+2,500 COINS',
            subtitle: 'Tour 3 Adelaide Reward',
            icon: '🪙'
        },
        {
            type: 'gems',
            amount: 25,
            title: '+25 GEMS',
            subtitle: 'Deluxe Pouch Bonus',
            icon: '💎'
        },
        {
            type: 'card',
            name: 'Mike',
            role: 'Fast Bowler',
            rarity: 'Epic',
            power: 30,
            level: 1,
            copies: 4,
            avatar: '👨‍🦱'
        }
    ];

    // Packet Tear Trigger (Tap on packet)
    const handlePacketTear = () => {
        if (packRevealState.isTorn) return;
        packRevealState.isTorn = true;

        // Animate Tear Off
        topStrip?.classList.add('torn');

        setTimeout(() => {
            mainBody?.classList.add('burst');
            setTimeout(() => {
                tearContainer?.classList.add('hidden');
                revealStage?.classList.remove('hidden');
                renderCurrentCardReveal();
            }, 350);
        }, 300);
    };

    tearContainer.onclick = handlePacketTear;
}

function renderCurrentCardReveal() {
    const revealSpot = document.getElementById('revealCardSpot');
    const remainingCount = document.getElementById('revealRemainingCount');
    const hint = document.getElementById('tapNextHint');

    if (!revealSpot || !remainingCount || !hint) return;

    const remaining = packRevealState.items.length - packRevealState.currentIndex;
    remainingCount.textContent = `${remaining} Item${remaining > 1 ? 's' : ''} Remaining`;
    hint.textContent = "Tap anywhere to continue 👉";

    const item = packRevealState.items[packRevealState.currentIndex];

    // Create 3D Flip Card Container
    revealSpot.innerHTML = `
        <div class="flip-card-inner" id="flipCardInner">
            <!-- Face Down (Mystery Card) -->
            <div class="card-face card-face-back">
                <div class="mystery-shield">🏏</div>
                <div class="mystery-label">CRICKET LEAGUE</div>
            </div>
            <!-- Face Up (Revealed Content) -->
            <div class="card-face card-face-front ${item.type === 'card' ? 'player-reveal-card' : 'currency-reveal-card'}">
                ${item.type === 'coins' ? `
                    <div class="currency-giant-icon">🪙</div>
                    <div class="currency-amount-title">+2,500</div>
                    <div class="currency-subtitle">Coins Collected!</div>
                ` : item.type === 'gems' ? `
                    <div class="currency-giant-icon">💎</div>
                    <div class="currency-amount-title">+25</div>
                    <div class="currency-subtitle">Gems Collected!</div>
                ` : `
                    <div class="reveal-card-header">
                        <span class="reveal-rarity-pill">Epic</span>
                        <span class="reveal-power-stat">30</span>
                    </div>
                    <div class="reveal-avatar-box">👨‍🦱</div>
                    <div class="reveal-player-name">Mike</div>
                    <div class="reveal-player-role">Fast Bowler • Lv. 1</div>
                    <div class="reveal-copies-badge">+4 COPIES COLLECTED!</div>
                `}
            </div>
        </div>
    `;

    // Trigger 3D Card Flip after brief suspense
    setTimeout(() => {
        document.getElementById('flipCardInner')?.classList.add('flipped');
        // Credit Currency
        if (item.type === 'coins') { gameState.coins += item.amount; updateHud(); }
        else if (item.type === 'gems') { gameState.gems += item.amount; updateHud(); }
    }, 180);
}

// Tap anywhere on Reveal Stage to advance to next card
document.getElementById('revealStage')?.addEventListener('click', () => {
    packRevealState.currentIndex++;

    if (packRevealState.currentIndex < packRevealState.items.length) {
        renderCurrentCardReveal();
    } else {
        // All items collected
        document.getElementById('packOpeningModal')?.classList.add('hidden');

        // Transform Slot 2 to opened/empty
        const slot2 = document.getElementById('packSlot2');
        if (slot2) {
            slot2.className = 'pack-slot-card';
            slot2.innerHTML = `
                <div class="slot-header">Tap to unlock</div>
                <div class="foil-pouch blue-pouch">
                    <div class="pouch-logo">ADELAIDE</div>
                    <div class="pouch-type">Basic</div>
                </div>
                <div class="slot-footer">Tour 3</div>
            `;
        }
    }
});

// ----------------------------------------------------
// Screen 8: Comprehensive Clubs System (Dynamic from MySQL)
// ----------------------------------------------------
let activeClubData = null;

async function loadClubsFromDb() {
    try {
        const res = await fetch('/api/clubs');
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                activeClubData = data;
                renderClubsScreen(data.myClub, data.clubs, data.members, data.messages, data.isGuest, data.pendingRequests, data.myPendingClubIds);
            }
        }
    } catch (e) {
        console.warn('Fallback clubs loading');
    }
}

function renderClubsScreen(myClub, allClubs, members, messages, isGuest, pendingRequests, myPendingClubIds) {
    const guestLockView = document.getElementById('clubsGuestLockView');
    const connectedView = document.getElementById('clubsConnectedView');
    const heroSection = document.getElementById('myActiveClubSection');
    const headerTitle = document.getElementById('clubScreenHeaderTitle');
    const createBtn = document.getElementById('openCreateClubBtn');
    const requestsTab = document.getElementById('clubTabRequests');
    const requestsBadge = document.getElementById('clubRequestsCount');

    // Check if player is a guest
    const isLocked = isGuest !== undefined ? Boolean(isGuest) : isCurrentPlayerGuest;

    if (isLocked) {
        if (guestLockView) guestLockView.classList.remove('hidden');
        if (connectedView) connectedView.classList.add('hidden');
        if (createBtn) createBtn.style.display = 'none';
        if (headerTitle) headerTitle.textContent = 'CLUBS';
        return;
    }

    if (guestLockView) guestLockView.classList.add('hidden');
    if (connectedView) connectedView.classList.remove('hidden');
    if (createBtn) createBtn.style.display = '';

    if (myClub) {
        if (heroSection) heroSection.classList.remove('hidden');
        if (headerTitle) headerTitle.textContent = myClub.club_name.toUpperCase();

        document.getElementById('myClubBadge').textContent = myClub.badge_icon || '🎯';
        document.getElementById('myClubLevelPill').textContent = `Lv. ${myClub.level || 1}`;
        document.getElementById('myClubTitle').textContent = myClub.club_name;
        document.getElementById('myClubTag').textContent = myClub.tag;
        document.getElementById('myClubDesc').textContent = myClub.description;
        document.getElementById('myClubMembers').textContent = `${members ? members.length : myClub.member_count}/50`;
        document.getElementById('myClubTrophies').textContent = `${(myClub.total_trophies || 0).toLocaleString()} 🏆`;
        document.getElementById('myClubRoleTag').textContent = `${myClub.role || 'LEADER'} 👑`;

        // Render Chat & Card Requests
        renderClubChat(messages || []);

        // Render Members Roster
        renderClubRoster(members || []);

        // Render Requests for Leaders
        if (['LEADER', 'CO_LEADER', 'ELDER'].includes(myClub.role)) {
            if (requestsTab) requestsTab.classList.remove('hidden');
            if (requestsBadge) requestsBadge.textContent = (pendingRequests ? pendingRequests.length : 0);
            renderClubRequests(pendingRequests || []);
        } else {
            if (requestsTab) requestsTab.classList.add('hidden');
        }

        // Render Club Chest
        renderClubChest(myClub);
    } else {
        if (heroSection) heroSection.classList.add('hidden');
        if (requestsTab) requestsTab.classList.add('hidden');
        if (headerTitle) headerTitle.textContent = 'BROWSE CLUBS';
        switchClubSubView('clubViewBrowse', 'clubTabBrowse');
    }

    // Render Browse List
    renderClubsBrowseList(allClubs || [], myPendingClubIds || []);
}

function renderClubRequests(requests) {
    const list = document.getElementById('clubRequestsList');
    if (!list) return;
    list.innerHTML = '';

    if (!requests || requests.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <div style="font-size: 32px; margin-bottom: 8px;">📬</div>
                <div style="font-size: 14px; font-weight: 800; color: #ffffff; margin-bottom: 4px;">No Pending Requests</div>
                <div style="font-size: 11px;">When players request to join your club, their requests will appear here.</div>
            </div>
        `;
        return;
    }

    requests.forEach(r => {
        const item = document.createElement('div');
        item.className = 'req-item-card';
        item.innerHTML = `
            <div class="req-item-left">
                <div class="req-item-avatar">${r.avatar || '👤'}</div>
                <div class="req-item-info">
                    <h4>${r.username}</h4>
                    <span>🏆 ${(r.trophies || 0).toLocaleString()} • Lv. ${r.level || 1}</span>
                </div>
            </div>
            <div class="req-item-actions">
                <button class="req-btn-accept">ACCEPT ✓</button>
                <button class="req-btn-decline">DECLINE ✕</button>
            </div>
        `;

        item.querySelector('.req-btn-accept').addEventListener('click', async () => {
            try {
                const res = await fetch('/api/clubs/accept-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requestId: r.id })
                });
                const resData = await res.json();
                alert(resData.message);
                if (resData.success) {
                    loadClubsFromDb();
                }
            } catch (err) {
                alert("Failed to accept request.");
            }
        });

        item.querySelector('.req-btn-decline').addEventListener('click', async () => {
            try {
                const res = await fetch('/api/clubs/decline-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requestId: r.id })
                });
                const resData = await res.json();
                alert(resData.message);
                if (resData.success) {
                    loadClubsFromDb();
                }
            } catch (err) {
                alert("Failed to decline request.");
            }
        });

        list.appendChild(item);
    });
}

function renderClubChat(messages) {
    const container = document.getElementById('clubChatMessagesList');
    if (!container) return;
    container.innerHTML = '';

    messages.forEach(m => {
        if (m.message_type === 'SYSTEM') {
            const sys = document.createElement('div');
            sys.className = 'club-msg-item club-msg-system';
            sys.textContent = m.content;
            container.appendChild(sys);
        } else if (m.message_type === 'CARD_REQUEST') {
            const req = document.createElement('div');
            req.className = 'club-msg-item';
            const isFilled = m.donations_received >= m.donations_max;
            const isMe = m.user_id === 1;

            req.innerHTML = `
                <div class="club-msg-header">
                    <span class="club-msg-author">${m.avatar || '👤'} ${m.username}</span>
                    <span class="club-msg-time">CARD REQUEST</span>
                </div>
                <div class="club-card-req-box">
                    <div class="req-card-left">
                        <div class="req-card-icon">🏏</div>
                        <div class="req-card-info">
                            <h4>${m.card_name}</h4>
                            <div class="req-card-progress">🎁 ${m.donations_received} / ${m.donations_max} Donated</div>
                        </div>
                    </div>
                    <button class="donate-card-btn" ${isFilled || isMe ? 'disabled' : ''}>
                        ${isFilled ? 'FILLED ✓' : (isMe ? 'YOUR REQUEST' : 'DONATE +50🪙')}
                    </button>
                </div>
            `;

            if (!isFilled && !isMe) {
                req.querySelector('.donate-card-btn').addEventListener('click', async () => {
                    try {
                        const donRes = await fetch('/api/clubs/donate-card', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ messageId: m.id })
                        });
                        if (donRes.ok) {
                            const donData = await donRes.json();
                            gameState.coins += donData.coinsEarned || 50;
                            addXp(donData.xpEarned || 10, "Card Donation");
                            updateHud();
                            loadClubsFromDb();
                            alert(donData.message);
                        }
                    } catch (e) {
                        alert("Donated +1 card copy! Earned +50 🪙 Coins & +10 XP");
                    }
                });
            }

            container.appendChild(req);
        } else if (m.message_type === 'FRIENDLY_CHALLENGE') {
            const challengeEl = document.createElement('div');
            challengeEl.className = 'friendly-challenge-msg-box';
            const isMe = (m.user_id === (gameState.userId || 1));
            challengeEl.innerHTML = `
                <div class="friendly-challenge-info">
                    <div class="friendly-challenge-title">⚔️ Friendly Battle: ${m.card_name || 'Adelaide Oval'}</div>
                    <div class="friendly-challenge-meta">Challenger: <strong>${m.username}</strong> • Equalized Level 5 Cards (0 🏆)</div>
                </div>
                ${!isMe ? `<button class="friendly-challenge-accept-btn" onclick="acceptFriendlyBattle('${m.card_name || 'Adelaide'}')">ACCEPT ⚔️</button>` : `<span style="font-size:11px; color:#facc15; font-weight:800;">YOUR CHALLENGE</span>`}
            `;
            container.appendChild(challengeEl);
        } else {
            const chatMsg = document.createElement('div');
            chatMsg.className = 'club-msg-item';
            chatMsg.innerHTML = `
                <div class="club-msg-header">
                    <span class="club-msg-author">${m.avatar || '👤'} ${m.username}</span>
                    <span class="club-msg-time">Just now</span>
                </div>
                <div class="club-msg-body">${m.content}</div>
            `;
            container.appendChild(chatMsg);
        }
    });

    container.scrollTop = container.scrollHeight;
}

let selectedRosterMember = null;

function renderClubRoster(members) {
    const list = document.getElementById('clubRosterList');
    if (!list) return;
    list.innerHTML = '';

    const myRole = (activeClubData && activeClubData.myClub) ? activeClubData.myClub.role : 'MEMBER';
    const myUserId = gameState.userId || 1;

    members.forEach((mem, idx) => {
        const row = document.createElement('div');
        row.className = 'roster-member-row';
        row.innerHTML = `
            <div class="roster-left">
                <span class="roster-rank">#${idx + 1}</span>
                <div class="roster-avatar">${mem.avatar || '👤'}</div>
                <div class="roster-info">
                    <span class="roster-name">${mem.name} ${mem.user_id === myUserId ? '<span style="color:#38bdf8; font-size:10px;">(YOU)</span>' : ''}</span>
                    <span class="roster-role-tag">${mem.role}</span>
                </div>
            </div>
            <div class="roster-right">
                <span class="roster-trophies">${(mem.trophies || 0).toLocaleString()} 🏆</span>
                <span class="roster-donations">🎁 ${mem.donations_weekly || 0} donated</span>
            </div>
        `;

        // If I am Leader or Co-Leader and this is not myself, enable clicking for management
        if (mem.user_id !== myUserId && (myRole === 'LEADER' || myRole === 'CO_LEADER' || myRole === 'ELDER')) {
            row.addEventListener('click', () => {
                openMemberActionModal(mem, myRole);
            });
        }

        list.appendChild(row);
    });
}

function openMemberActionModal(member, myRole) {
    selectedRosterMember = member;
    const modal = document.getElementById('clubMemberActionModal');
    if (!modal) return;

    document.getElementById('memberActionAvatar').textContent = member.avatar || '👤';
    document.getElementById('memberActionUsername').textContent = member.name;
    document.getElementById('memberActionMeta').textContent = `Role: ${member.role} • ${(member.trophies || 0).toLocaleString()} 🏆`;

    const btnPromoteCoLeader = document.getElementById('btnPromoteCoLeader');
    const btnPromoteElder = document.getElementById('btnPromoteElder');
    const btnDemoteMember = document.getElementById('btnDemoteMember');
    const btnTransferLeadership = document.getElementById('btnTransferLeadership');
    const btnKickMember = document.getElementById('btnKickMember');

    // Configure visibility based on RBAC rules
    if (myRole === 'LEADER') {
        btnTransferLeadership.classList.remove('hidden');
        btnKickMember.classList.remove('hidden');
        btnPromoteCoLeader.classList.toggle('hidden', member.role === 'CO_LEADER');
        btnPromoteElder.classList.toggle('hidden', member.role === 'ELDER' || member.role === 'CO_LEADER');
        btnDemoteMember.classList.toggle('hidden', member.role === 'MEMBER');
    } else if (myRole === 'CO_LEADER') {
        btnTransferLeadership.classList.add('hidden');
        btnPromoteCoLeader.classList.add('hidden');
        btnPromoteElder.classList.toggle('hidden', member.role === 'ELDER' || member.role === 'CO_LEADER');
        btnDemoteMember.classList.toggle('hidden', member.role === 'MEMBER' || member.role === 'CO_LEADER');
        btnKickMember.classList.toggle('hidden', member.role === 'CO_LEADER' || member.role === 'LEADER');
    } else if (myRole === 'ELDER') {
        btnTransferLeadership.classList.add('hidden');
        btnPromoteCoLeader.classList.add('hidden');
        btnPromoteElder.classList.add('hidden');
        btnDemoteMember.classList.add('hidden');
        btnKickMember.classList.toggle('hidden', member.role !== 'MEMBER');
    }

    modal.classList.remove('hidden');
}

// Bind Member Action Modal Buttons
document.getElementById('closeMemberActionModal')?.addEventListener('click', () => {
    document.getElementById('clubMemberActionModal')?.classList.add('hidden');
});

document.getElementById('btnPromoteCoLeader')?.addEventListener('click', async () => {
    if (!selectedRosterMember) return;
    await executeRoleChange(selectedRosterMember.user_id, 'CO_LEADER');
});

document.getElementById('btnPromoteElder')?.addEventListener('click', async () => {
    if (!selectedRosterMember) return;
    await executeRoleChange(selectedRosterMember.user_id, 'ELDER');
});

document.getElementById('btnDemoteMember')?.addEventListener('click', async () => {
    if (!selectedRosterMember) return;
    await executeRoleChange(selectedRosterMember.user_id, 'MEMBER');
});

document.getElementById('btnTransferLeadership')?.addEventListener('click', async () => {
    if (!selectedRosterMember) return;
    if (confirm(`⚠️ Are you sure you want to transfer full Club Leadership to ${selectedRosterMember.name}?\n\nYou will become a Co-Leader.`)) {
        try {
            const res = await fetch('/api/clubs/transfer-leadership', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newLeaderUserId: selectedRosterMember.user_id })
            });
            const data = await res.json();
            alert(data.message);
            document.getElementById('clubMemberActionModal')?.classList.add('hidden');
            loadClubsFromDb();
        } catch (e) { }
    }
});

document.getElementById('btnKickMember')?.addEventListener('click', async () => {
    if (!selectedRosterMember) return;
    if (confirm(`Are you sure you want to kick ${selectedRosterMember.name} from the club?`)) {
        try {
            const res = await fetch('/api/clubs/kick-member', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId: selectedRosterMember.user_id })
            });
            const data = await res.json();
            alert(data.message);
            document.getElementById('clubMemberActionModal')?.classList.add('hidden');
            loadClubsFromDb();
        } catch (e) { }
    }
});

async function executeRoleChange(targetUserId, newRole) {
    try {
        const res = await fetch('/api/clubs/change-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId, newRole })
        });
        const data = await res.json();
        alert(data.message);
        document.getElementById('clubMemberActionModal')?.classList.add('hidden');
        loadClubsFromDb();
    } catch (e) { }
}

// Bind Friendly Match Challenge
document.getElementById('clubFriendlyMatchBtn')?.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/clubs/friendly-challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stadium: 'Adelaide Oval' })
        });
        const data = await res.json();
        if (data.success) {
            loadClubsFromDb();
            switchClubSubView('clubViewChat', 'clubTabChat');
        }
    } catch (e) { }
});

window.acceptFriendlyBattle = function (stadium) {
    startMatchmaking(stadium || 'Adelaide Oval', 0, 'friendly');
};

function renderClubChest(club) {
    const score = club.weekly_chest_score || 0;
    const goal = club.weekly_chest_goal || 2500;
    const pct = Math.min(100, Math.round((score / goal) * 100));

    document.getElementById('chestTierBadge').textContent = `⭐ TIER ${club.weekly_chest_tier || 1} / 10`;
    document.getElementById('chestProgressFill').style.width = `${pct}%`;
    document.getElementById('chestProgressLabel').textContent = `${score.toLocaleString()} / ${goal.toLocaleString()} 🏆`;
}

function renderClubsBrowseList(allClubs, myPendingClubIds) {
    const list = document.getElementById('clubsScrollList');
    if (!list) return;
    list.innerHTML = '';

    if (!allClubs || allClubs.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <div style="font-size: 36px; margin-bottom: 8px;">🛡️</div>
                <div style="font-size: 15px; font-weight: 800; color: #ffffff; margin-bottom: 4px;">No Clubs Found</div>
                <div style="font-size: 12px; line-height: 1.4;">No player-created clubs yet.<br>Tap <strong style="color:#38bdf8;">+ CREATE</strong> above to found your own squad!</div>
            </div>
        `;
        return;
    }

    allClubs.forEach(c => {
        const item = document.createElement('div');
        item.className = 'club-item-card';
        const isPending = myPendingClubIds && myPendingClubIds.includes(c.id);

        item.innerHTML = `
            <div class="club-item-left">
                <div class="club-item-badge">${c.badge_icon || '🛡️'}</div>
                <div class="club-item-info">
                    <div class="club-item-name">${c.club_name} <span style="color:#facc15; font-size:11px;">${c.tag}</span></div>
                    <div class="club-item-meta">👥 ${c.member_count}/50 • 🏆 ${(c.total_trophies || 0).toLocaleString()} • Min: ${c.min_trophies} 🏆</div>
                </div>
            </div>
            ${isPending ? `<div class="club-item-pending-pill">REQUESTED ⏳</div>` : `<button class="club-join-btn">REQUEST TO JOIN</button>`}
        `;

        if (!isPending) {
            item.querySelector('.club-join-btn').addEventListener('click', async () => {
                try {
                    const reqRes = await fetch('/api/clubs/request-join', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clubId: c.id })
                    });
                    const resData = await reqRes.json();
                    alert(resData.message);
                    if (resData.success) {
                        loadClubsFromDb();
                    }
                } catch (err) {
                    alert(`Join request sent to ${c.club_name}!`);
                }
            });
        }

        list.appendChild(item);
    });
}

// Sub-Tab Switcher
function switchClubSubView(viewId, tabId) {
    document.querySelectorAll('.club-subview').forEach(v => v.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('#screen-clubs .segment-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
}

document.getElementById('clubTabChat')?.addEventListener('click', () => switchClubSubView('clubViewChat', 'clubTabChat'));
document.getElementById('clubTabRoster')?.addEventListener('click', () => switchClubSubView('clubViewRoster', 'clubTabRoster'));
document.getElementById('clubTabRequests')?.addEventListener('click', () => switchClubSubView('clubViewRequests', 'clubTabRequests'));
document.getElementById('clubTabChest')?.addEventListener('click', () => switchClubSubView('clubViewChest', 'clubTabChest'));
document.getElementById('clubTabBrowse')?.addEventListener('click', () => switchClubSubView('clubViewBrowse', 'clubTabBrowse'));

// Instant Live Search Filter for Browse Clubs
document.getElementById('clubSearchInput')?.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (!activeClubData || !activeClubData.clubs) return;
    const filtered = activeClubData.clubs.filter(c =>
        (c.club_name && c.club_name.toLowerCase().includes(query)) ||
        (c.tag && c.tag.toLowerCase().includes(query)) ||
        (c.description && c.description.toLowerCase().includes(query))
    );
    renderClubsBrowseList(filtered, activeClubData.myPendingClubIds || []);
});

// Send Chat Message
async function sendClubChatMessage() {
    const input = document.getElementById('clubChatInput');
    if (!input || !input.value.trim()) return;

    const text = input.value.trim();
    input.value = '';

    try {
        const res = await fetch('/api/clubs/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (res.ok) {
            loadClubsFromDb();
        }
    } catch (e) { }
}

document.getElementById('clubChatSendBtn')?.addEventListener('click', sendClubChatMessage);
document.getElementById('clubChatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendClubChatMessage();
});

// Leave Club Action
document.getElementById('clubLeaveBtn')?.addEventListener('click', async () => {
    if (confirm("Are you sure you want to leave this club?")) {
        try {
            const res = await fetch('/api/clubs/leave', { method: 'POST' });
            if (res.ok) {
                alert("You have left the club.");
                loadClubsFromDb();
                switchClubSubView('clubViewBrowse', 'clubTabBrowse');
            }
        } catch (e) { }
    }
});

// Claim Club Chest Rewards
document.getElementById('claimClubChestBtn')?.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/clubs/claim-chest', { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            gameState.coins += data.coinsReward || 10000;
            gameState.gems += data.gemsReward || 100;
            addXp(150, "Weekly Club Chest");
            updateHud();
            alert(data.message);
        }
    } catch (e) { }
});

// Request Card Modal Flow
document.getElementById('openRequestCardBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('requestCardModal');
    const list = document.getElementById('requestCardsSelectList');
    if (!modal || !list) return;

    list.innerHTML = '';
    const cards = [...gameState.bowlers, ...gameState.batsmen].filter(c => !c.isBat);

    cards.forEach(c => {
        const item = document.createElement('div');
        item.className = 'request-card-opt-item';
        item.innerHTML = `
            <div>
                <strong>${c.name}</strong> <span style="font-size:10px; color:#94a3b8;">(${c.role})</span>
            </div>
            <button class="upgrade-green-pill" style="font-size:11px; padding:4px 8px;">REQUEST</button>
        `;
        item.querySelector('button').addEventListener('click', async () => {
            try {
                const res = await fetch('/api/clubs/request-card', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cardName: c.name, cardRole: c.role })
                });
                if (res.ok) {
                    const data = await res.json();
                    modal.classList.add('hidden');
                    loadClubsFromDb();
                    switchClubSubView('clubViewChat', 'clubTabChat');
                    alert(data.message);
                }
            } catch (e) { }
        });
        list.appendChild(item);
    });

    modal.classList.remove('hidden');
});

document.getElementById('closeRequestCardModal')?.addEventListener('click', () => {
    document.getElementById('requestCardModal')?.classList.add('hidden');
});

// Create Club Modal Flow
let selectedClubBadge = '🛡️';
document.getElementById('openCreateClubBtn')?.addEventListener('click', () => {
    if (activeClubData && activeClubData.myClub) {
        alert(`⚠️ You already belong to "${activeClubData.myClub.club_name}"!\n\nOne person can create only one club. Leave your current club first to create a new one.`);
        return;
    }
    document.getElementById('createClubModal')?.classList.remove('hidden');
});

document.getElementById('closeCreateClubModal')?.addEventListener('click', () => {
    document.getElementById('createClubModal')?.classList.add('hidden');
});

// Click outside modal card to close
document.getElementById('createClubModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'createClubModal') {
        e.target.classList.add('hidden');
    }
});

document.getElementById('requestCardModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'requestCardModal') {
        e.target.classList.add('hidden');
    }
});

document.querySelectorAll('#badgePickerRow .badge-opt').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#badgePickerRow .badge-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedClubBadge = btn.dataset.badge;
    });
});

// Custom Gaming Dropdown Logic for Required Trophies
const trophiesTrigger = document.getElementById('trophiesDropdownTrigger');
const trophiesMenu = document.getElementById('trophiesDropdownMenu');
const trophiesInput = document.getElementById('newClubMinTrophies');
const triggerTierIcon = document.getElementById('triggerTierIcon');
const triggerText = document.getElementById('triggerText');
const triggerPill = document.getElementById('triggerPill');

trophiesTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !trophiesMenu.classList.contains('hidden');
    if (isOpen) {
        trophiesMenu.classList.add('hidden');
        trophiesTrigger.classList.remove('open');
    } else {
        trophiesMenu.classList.remove('hidden');
        trophiesTrigger.classList.add('open');
    }
});

document.querySelectorAll('#trophiesDropdownMenu .dropdown-option-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = item.dataset.value;
        const icon = item.dataset.icon;
        const text = item.dataset.text;
        const pill = item.dataset.pill;
        const pillClass = item.dataset.pillClass;

        if (trophiesInput) trophiesInput.value = val;
        if (triggerTierIcon) triggerTierIcon.textContent = icon;
        if (triggerText) triggerText.textContent = text;
        if (triggerPill) {
            triggerPill.textContent = pill;
            triggerPill.className = `trigger-pill ${pillClass}`;
        }

        document.querySelectorAll('#trophiesDropdownMenu .dropdown-option-item').forEach(opt => opt.classList.remove('active'));
        item.classList.add('active');

        trophiesMenu?.classList.add('hidden');
        trophiesTrigger?.classList.remove('open');
    });
});

// Close custom dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!document.getElementById('trophiesCustomDropdown')?.contains(e.target)) {
        trophiesMenu?.classList.add('hidden');
        trophiesTrigger?.classList.remove('open');
    }
});

document.getElementById('confirmCreateClubBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('newClubName')?.value.trim();
    const minTrophies = parseInt(document.getElementById('newClubMinTrophies')?.value, 10) || 0;
    const desc = document.getElementById('newClubDesc')?.value.trim() || 'Active cricket club!';

    if (!name) {
        alert("Please enter a Club Name!");
        return;
    }

    if (gameState.coins < 5000) {
        alert("You need 5,000 🪙 Coins to create a Club!");
        return;
    }

    try {
        const res = await fetch('/api/clubs/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                badge: selectedClubBadge,
                minTrophies,
                description: desc
            })
        });

        const data = await res.json();
        if (data.success) {
            gameState.coins -= 5000;
            updateHud();
            document.getElementById('createClubModal')?.classList.add('hidden');
            loadClubsFromDb();
            switchClubSubView('clubViewChat', 'clubTabChat');
            alert(data.message);
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert("Failed to create club. Please try again.");
    }
});

// ----------------------------------------------------
// Screen 9: Leaderboards (Dynamic 3-Month Seasons from MySQL)
// ----------------------------------------------------
let currentLeaderboardTab = 'country';
let serverSeasonEndDate = null;
let seasonCountdownInterval = null;

async function loadLeaderboardFromDb(tab = currentLeaderboardTab) {
    currentLeaderboardTab = tab;

    // Update active tab buttons UI instantly
    const tabMap = {
        'alltime': document.getElementById('lbAllTimeTab'),
        'country': document.getElementById('lbCountryTab'),
        'world': document.getElementById('lbWorldTab')
    };

    Object.keys(tabMap).forEach(key => {
        if (tabMap[key]) {
            tabMap[key].classList.toggle('active', key === tab);
        }
    });

    const list = document.getElementById('leaderboardScrollList');
    if (list) list.style.opacity = '0.5';

    try {
        const userId = gameState.userId || 1;
        const country = gameState.countryCode || 'IN';
        const res = await fetch(`/api/leaderboard?tab=${encodeURIComponent(tab)}&userId=${userId}&country=${encodeURIComponent(country)}`);

        if (res.ok) {
            const data = await res.json();

            // 1. Update Season Scope Title (e.g., 🇮🇳 India, 🌍 World, 👑 All Time)
            const scopeTitleEl = document.getElementById('seasonScopeTitle');
            if (scopeTitleEl) {
                scopeTitleEl.textContent = data.scopeTitle || 'Leaderboard';
            }

            // 2. Synchronize 3-Month Season Countdown Timer from Server
            if (data.season && data.season.endDate) {
                serverSeasonEndDate = new Date(data.season.endDate);
                startSeasonCountdown();
            }

            // 3. Render Leaderboard List
            if (data.success && data.leaderboard) {
                renderLeaderboardList(data.leaderboard);
            }

            // 4. Handle Automated Season Reward Diamonds Payout Notification
            if (data.recentReward) {
                handleSeasonRewardWon(data.recentReward);
            }
        }
    } catch (e) {
        console.warn('Leaderboard API fetch error:', e);
    } finally {
        if (list) list.style.opacity = '1';
    }
}

// Bind Multi-Tab Buttons (All Time, Country, World)
document.getElementById('lbAllTimeTab')?.addEventListener('click', () => loadLeaderboardFromDb('alltime'));
document.getElementById('lbCountryTab')?.addEventListener('click', () => loadLeaderboardFromDb('country'));
document.getElementById('lbWorldTab')?.addEventListener('click', () => loadLeaderboardFromDb('world'));

// Synchronized 3-Month Season Countdown Timer (Same for all players globally)
function startSeasonCountdown() {
    if (seasonCountdownInterval) clearInterval(seasonCountdownInterval);

    function updateClock() {
        const el = document.getElementById('seasonCountdownClock');
        if (!el) return;

        if (!serverSeasonEndDate) {
            el.textContent = '—';
            return;
        }

        const now = new Date();
        const diff = serverSeasonEndDate.getTime() - now.getTime();

        if (diff <= 0) {
            el.textContent = 'Season Ended';
            setTimeout(() => loadLeaderboardFromDb(currentLeaderboardTab), 2000);
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        el.textContent = `${days}d ${hours}h ${mins}m`;
    }

    updateClock();
    seasonCountdownInterval = setInterval(updateClock, 60000); // Update every minute
}

function renderLeaderboardList(players) {
    const list = document.getElementById('leaderboardScrollList');
    if (!list) return;

    // Show empty state if no players
    if (!players || players.length === 0) {
        let emptyDesc = 'Play matches and earn trophies to climb the leaderboard!';
        if (currentLeaderboardTab === 'country') emptyDesc = 'No other players from your country yet. Be the first to reach the top!';
        if (currentLeaderboardTab === 'alltime') emptyDesc = 'No player rankings recorded yet. Win matches to set all-time records!';

        list.innerHTML = `
            <div style="text-align:center; padding:48px 20px; color:#94a3b8;">
                <div style="font-size:48px; margin-bottom:12px;">🏆</div>
                <div style="font-size:16px; font-weight:700; color:#e2e8f0; margin-bottom:8px;">No Rankings Yet</div>
                <div style="font-size:13px; color:#64748b;">${emptyDesc}</div>
            </div>
        `;
        return;
    }

    const myUserId = gameState.userId || 1;
    let html = '';

    players.forEach((p, idx) => {
        const rank = idx + 1;
        let rankClass = '';
        let medal = rank;

        if (rank === 1) { rankClass = 'rank-gold'; medal = '🥇 1'; }
        else if (rank === 2) { rankClass = 'rank-silver'; medal = '🥈 2'; }
        else if (rank === 3) { rankClass = 'rank-bronze'; medal = '🥉 3'; }

        const isMe = (p.id === myUserId);
        const cardClass = `lb-row-card ${rankClass} ${isMe ? 'my-card' : ''}`;

        html += `
            <div class="${cardClass}">
                <div class="rank-badge-col">
                    <span class="rank-digit">${medal}</span>
                </div>
                <div class="lb-avatar-col">
                    <div class="lb-avatar-circle">${p.avatar || '👤'}</div>
                    <span class="lb-flag">${p.flag || '🌐'}</span>
                </div>
                <div class="lb-player-info">
                    <div class="lb-username">
                        <span>${p.name}</span>
                        ${isMe ? '<span class="lb-you-badge">YOU</span>' : ''}
                    </div>
                    <div class="lb-tier">⭐ Level ${p.level}</div>
                </div>
                <div class="lb-score-col">
                    <span class="lb-score-number">${(p.trophies || 0).toLocaleString()}</span>
                    <span class="lb-coin-icon">🏆</span>
                </div>
            </div>
        `;
    });

    list.innerHTML = html;
}

// Handle Season Reward Won Diamond Celebration Dialog
function handleSeasonRewardWon(reward) {
    if (!reward || !reward.gems) return;

    // Credit gems to live game state
    gameState.gems += reward.gems;
    updateHud();

    // Show celebration modal
    const modal = document.getElementById('seasonRewardModal');
    if (!modal) return;

    const seasonTag = document.getElementById('seasonRewardSeasonTag');
    const rankVal = document.getElementById('seasonRewardRankVal');
    const gemsVal = document.getElementById('seasonRewardGemsVal');

    if (seasonTag) seasonTag.textContent = `Season #${reward.seasonNumber} Payout`;
    if (rankVal) rankVal.textContent = `Rank #${reward.rank} ${reward.rank === 1 ? '🥇' : reward.rank === 2 ? '🥈' : '🥉'}`;
    if (gemsVal) gemsVal.textContent = reward.gems.toLocaleString();

    modal.classList.remove('hidden');
}

// Bind Claim Season Reward Button
document.getElementById('claimSeasonRewardBtn')?.addEventListener('click', () => {
    document.getElementById('seasonRewardModal')?.classList.add('hidden');
    updateHud();
});

// Bottom Nav Handlers
document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        if (target) {
            navigateTo(target);
            if (target === 'screen-clubs') loadClubsFromDb();
            if (target === 'screen-leaderboard') loadLeaderboardFromDb(currentLeaderboardTab);
            if (target === 'screen-team') loadSquadCardsFromDb();
        }
    });
});

// ----------------------------------------------------
// Screen: Full-Screen Level Roadmap & Progression System
// ----------------------------------------------------
let currentRoadmapData = null;

function openLevelRoadmap() {
    navigateTo('screen-roadmap');
    loadRoadmapFromDb();
}

async function loadRoadmapFromDb() {
    const list = document.getElementById('roadmapNodesList');
    try {
        const userId = gameState.userId || 1;
        const res = await fetch(`/api/roadmap/status?userId=${userId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                currentRoadmapData = data;
                renderRoadmapScreen(data);
            }
        }
    } catch (e) {
        console.warn('Roadmap fetch error:', e);
    }
}

function renderRoadmapScreen(data) {
    // 1. Update Hero Progression Banner
    const heroLevel = document.getElementById('roadmapHeroLevel');
    const heroXpText = document.getElementById('roadmapHeroXpText');
    const heroXpFill = document.getElementById('roadmapHeroXpFill');
    const totalClaimedVal = document.getElementById('roadmapTotalClaimedVal');
    const nextRewardVal = document.getElementById('roadmapNextRewardVal');

    if (heroLevel) heroLevel.textContent = `⭐ ${data.currentLevel}`;
    if (heroXpText) heroXpText.textContent = `${data.currentXp} / ${data.currentLevelXpReq} XP`;

    const xpPct = Math.min(100, Math.round((data.currentXp / data.currentLevelXpReq) * 100));
    if (heroXpFill) heroXpFill.style.width = `${xpPct}%`;

    if (totalClaimedVal) totalClaimedVal.textContent = `${data.totalClaimedCount || 0}/${data.displayMaxLevel || 50}`;
    if (nextRewardVal) nextRewardVal.textContent = `Level ${data.currentLevel + 1}`;

    // 2. Render Vertical Milestone Road Track (Levels 1 to 50+)
    const list = document.getElementById('roadmapNodesList');
    if (!list) return;

    let html = '';
    data.roadmap.forEach((node) => {
        let statusClass = 'node-locked';
        let actionHtml = `<div class="roadmap-locked-badge">🔒 Lv.${node.level}</div>`;

        if (node.isClaimed) {
            statusClass = 'node-claimed';
            actionHtml = `<div class="roadmap-claimed-badge">✓ CLAIMED</div>`;
        } else if (node.canClaim) {
            statusClass = 'node-unlocked';
            actionHtml = `<button class="roadmap-claim-btn" onclick="claimRoadmapMilestone(${node.level})">CLAIM 🎁</button>`;
        } else if (node.isCurrent) {
            statusClass = 'node-current';
            actionHtml = `<div class="roadmap-locked-badge" style="color:#38bdf8; border-color:rgba(56,189,248,0.4);">IN PROGRESS</div>`;
        }

        const keyClass = node.isKeyMilestone ? 'key-milestone' : '';

        // Reward pills
        let rewardsPillsHtml = '';
        if (node.coins) rewardsPillsHtml += `<span class="node-reward-pill coin-pill">🪙 +${node.coins.toLocaleString()}</span>`;
        if (node.gems) rewardsPillsHtml += `<span class="node-reward-pill gem-pill">💎 +${node.gems.toLocaleString()}</span>`;
        if (node.pack) rewardsPillsHtml += `<span class="node-reward-pill pack-pill">📦 ${node.pack}</span>`;

        html += `
            <div class="roadmap-node-card ${statusClass} ${keyClass}" id="roadmapNode_${node.level}">
                <div class="node-level-circle">
                    <div class="node-star-icon">${node.isClaimed ? '✓' : (node.icon || '⭐')}</div>
                    <div class="node-level-num">Lv.${node.level}</div>
                </div>
                <div class="node-content-col">
                    <div class="node-title-row">
                        <div class="node-milestone-title">${node.unlock || `Milestone Level ${node.level}`}</div>
                        ${node.isKeyMilestone ? '<span class="node-key-badge">KEY MILESTONE</span>' : ''}
                    </div>
                    <div class="node-rewards-row">
                        ${rewardsPillsHtml}
                    </div>
                </div>
                <div class="node-action-col">
                    ${actionHtml}
                </div>
            </div>
        `;
    });

    list.innerHTML = html;

    // Center scroll on current level node
    setTimeout(() => {
        scrollToCurrentRoadmapNode(data.currentLevel);
    }, 150);
}

function scrollToCurrentRoadmapNode(level) {
    const targetNode = document.getElementById(`roadmapNode_${level}`);
    const scrollContainer = document.getElementById('roadmapScrollContainer');
    if (targetNode && scrollContainer) {
        targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Jump to current level button handler
document.getElementById('roadmapJumpBtn')?.addEventListener('click', () => {
    if (currentRoadmapData && currentRoadmapData.currentLevel) {
        scrollToCurrentRoadmapNode(currentRoadmapData.currentLevel);
    }
});

// Roadmap Back Button
document.getElementById('roadmapBackBtn')?.addEventListener('click', () => {
    navigateTo('screen-home');
});

// Global function for inline onclick in roadmap cards
window.claimRoadmapMilestone = async function (level) {
    try {
        const userId = gameState.userId || 1;
        const res = await fetch('/api/roadmap/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, level })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.success && data.reward) {
                // Update live wallet
                if (data.reward.coins) gameState.coins += data.reward.coins;
                if (data.reward.gems) gameState.gems += data.reward.gems;
                updateHud();

                // Show celebration modal
                showRoadmapClaimModal(data.reward);

                // Reload roadmap
                loadRoadmapFromDb();
            } else {
                alert(data.message || 'Could not claim reward');
            }
        }
    } catch (e) {
        console.error('Error claiming roadmap milestone:', e);
    }
};

function showRoadmapClaimModal(reward) {
    const modal = document.getElementById('roadmapClaimModal');
    if (!modal) return;

    const levelTag = document.getElementById('roadmapModalLevelTag');
    const unlockTag = document.getElementById('roadmapModalUnlockTag');
    const pillsRow = document.getElementById('roadmapModalPillsRow');

    if (levelTag) levelTag.textContent = `Level ${reward.level} Milestone Reward`;
    if (unlockTag) unlockTag.textContent = reward.unlock || 'REWARD UNLOCKED';

    if (pillsRow) {
        let html = '';
        if (reward.coins) html += `<div class="payout-pill"><span class="p-icon">🪙</span> +${reward.coins.toLocaleString()} Coins</div>`;
        if (reward.gems) html += `<div class="payout-pill"><span class="p-icon">💎</span> +${reward.gems.toLocaleString()} Gems</div>`;
        if (reward.pack) html += `<div class="payout-pill"><span class="p-icon">📦</span> ${reward.pack}</div>`;
        pillsRow.innerHTML = html;
    }

    modal.classList.remove('hidden');
}

document.getElementById('dismissRoadmapClaimBtn')?.addEventListener('click', () => {
    document.getElementById('roadmapClaimModal')?.classList.add('hidden');
    updateHud();
});

// ----------------------------------------------------
// Screen 3: Tour Selection & Matchmaking (Dynamic from MySQL)
// ----------------------------------------------------
let TOURS_DATA = [];
let currentMatchTour = null;

async function loadToursFromDb() {
    try {
        const res = await fetch('/api/tours');
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.tours && data.tours.length > 0) {
                TOURS_DATA = data.tours.map(t => ({
                    id: t.id,
                    name: t.name,
                    fee: t.entry_fee,
                    prize: t.prize,
                    color: t.color_hex,
                    online: t.online_players,
                    unlockLevel: t.min_level
                }));
                currentMatchTour = TOURS_DATA[0];
            }
        }
    } catch (e) {
        console.warn('Error loading tours from MySQL:', e);
    }
    renderTourList();
}

function renderTourList() {
    const list = document.getElementById('toursScrollList');
    if (!list) return;
    list.innerHTML = '';

    if (TOURS_DATA.length === 0) {
        list.innerHTML = '<div style="color: #a0aec0; text-align: center; padding: 20px;">Loading tour venues from database...</div>';
        return;
    }

    TOURS_DATA.forEach(t => {
        const isLocked = gameState.level < t.unlockLevel;
        const card = document.createElement('div');
        card.className = `venue-tour-card ${isLocked ? 'locked' : ''}`;
        card.style.borderLeft = `6px solid ${t.color}`;
        card.innerHTML = `
            <div class="venue-card-banner" style="background: linear-gradient(135deg, ${t.color} 0%, #0d1e3d 100%)">
                <div class="venue-hex-badge">
                    <span class="venue-icon">${isLocked ? '🔒' : '🏟️'}</span>
                </div>
                <div class="venue-title-row">
                    <h3 class="venue-city-name">${t.name}</h3>
                    <span class="tour-tag-pill">TOUR ${t.id}</span>
                </div>
            </div>
            <div class="venue-card-body">
                <div class="prize-display-box">
                    <span class="prize-label">PRIZE POOL</span>
                    <span class="prize-value">${t.prize.toLocaleString()} <span class="coin-emoji">🪙</span></span>
                </div>
                <div class="venue-meta-row">
                    <div class="meta-item"><span class="meta-icon">🪙</span> Fee: <strong>${t.fee.toLocaleString()}</strong></div>
                    <div class="meta-item"><span class="online-indicator">🟢</span> <strong>${t.online.toLocaleString()}</strong> Online</div>
                </div>
                ${isLocked
                ? `<div class="tour-locked-banner">🔒 UNLOCKS AT LEVEL ⭐ ${t.unlockLevel}</div>`
                : `<button class="venue-play-cta" style="background: linear-gradient(180deg, ${t.color} 0%, #0f172a 150%)">
                        PLAY NOW • ${t.fee.toLocaleString()} 🪙
                       </button>`
            }
            </div>
        `;
        if (!isLocked) {
            card.querySelector('.venue-play-cta')?.addEventListener('click', (e) => {
                e.stopPropagation();
                startMatchmakingFlow(t);
            });
            card.addEventListener('click', () => startMatchmakingFlow(t));
        } else {
            card.addEventListener('click', () => {
                alert(`🔒 ${t.name} unlocks when you reach Level ⭐ ${t.unlockLevel}! Win matches to earn XP and level up.`);
            });
        }
        list.appendChild(card);
    });
}

function startMatchmakingFlow(tour) {
    if (gameState.coins < tour.fee) {
        alert("Not enough coins to enter this tour! Win matches or claim free coins.");
        return;
    }

    currentMatchTour = tour;
    // Deduct entry fee
    gameState.coins -= tour.fee;
    updateHud();

    const modal = document.getElementById('matchSearchModal');
    modal.classList.remove('hidden');
    document.getElementById('modalTourName').textContent = `${tour.name.toUpperCase()} - TOUR ${tour.id}`;

    socket.emit('find_match', {
        tourId: tour.id,
        playerId: 1001,
        playerLevel: 4,
        username: gameState.username
    });

    // Simulate match connection
    setTimeout(() => {
        document.getElementById('opponentSearchBox').innerHTML = `
            <div class="p-avatar">🇵🇰</div>
            <div class="p-name">Guest_434660</div>
            <div class="p-rank">⭐32</div>
        `;
        document.getElementById('searchStatusMsg').textContent = 'OPPONENT MATCHED!';
        setTimeout(() => {
            modal.classList.add('hidden');
            startPreMatchScreen();
        }, 900);
    }, 2000);
}

document.getElementById('cancelMatchSearchBtn')?.addEventListener('click', () => {
    document.getElementById('matchSearchModal')?.classList.add('hidden');
    // Refund entry fee
    if (currentMatchTour) {
        gameState.coins += currentMatchTour.fee;
        updateHud();
    }
});

// ----------------------------------------------------
// Screen 4: Pre-Match Preview
// ----------------------------------------------------
function startPreMatchScreen() {
    navigateTo('screen-prematch');
    let count = 3;
    const ticker = document.getElementById('prematchCountdown');

    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            if (ticker) ticker.textContent = count;
        } else {
            if (ticker) ticker.textContent = "PLAY!";
            clearInterval(countdownInterval);
            setTimeout(startMatchPlay, 600);
        }
    }, 1000);
}

// ----------------------------------------------------
// Screen 5, 6, 7: In-Match Batting & Bowling
// ----------------------------------------------------
let inMatchState = {
    p1Score: 0,
    p2Score: 0,
    innings: 1,
    ballNumber: 1,
    isBatting: true,
    timingInterval: null,
    timingMarkerPos: 0,
    timingMarkerDir: 1
};

function startMatchPlay() {
    navigateTo('screen-match');
    inMatchState.p1Score = 0;
    inMatchState.p2Score = 0;
    inMatchState.innings = 1;
    inMatchState.ballNumber = 1;

    document.getElementById('matchP1Score').textContent = '0';
    document.getElementById('matchTargetVal').textContent = '-';

    resetTimelineDots();
    setupBattingControls();
}

function resetTimelineDots() {
    for (let i = 0; i < 6; i++) {
        const dot = document.getElementById(`bdot-${i}`);
        if (dot) {
            dot.className = 'ball-slot-circle';
            dot.textContent = '';
        }
    }
}

function setupBattingControls() {
    inMatchState.isBatting = true;

    // Run vertical timing meter needle
    clearInterval(inMatchState.timingInterval);
    inMatchState.timingMarkerPos = 0;
    inMatchState.timingMarkerDir = 1;
    const needle = document.getElementById('verticalTimingNeedle');

    inMatchState.timingInterval = setInterval(() => {
        inMatchState.timingMarkerPos += 4 * inMatchState.timingMarkerDir;
        if (inMatchState.timingMarkerPos >= 100) { inMatchState.timingMarkerPos = 100; inMatchState.timingMarkerDir = -1; }
        else if (inMatchState.timingMarkerPos <= 0) { inMatchState.timingMarkerPos = 0; inMatchState.timingMarkerDir = 1; }

        if (needle) {
            // Position from top 10px to 260px (250px range)
            needle.style.top = `${(inMatchState.timingMarkerPos / 100) * 250 + 10}px`;
        }
    }, 20);
}

// Shot Click Handler for .shot-action-btn
document.querySelectorAll('.shot-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!inMatchState.isBatting) return;
        clearInterval(inMatchState.timingInterval);

        const shot = btn.dataset.shot;
        const pos = inMatchState.timingMarkerPos;

        let runs = 0;
        let isWicket = false;
        let feedback = "GOOD!";
        let feedbackColor = "#22c55e";

        // Evaluate Vertical Timing (Center 40-60% is Perfect Cyan)
        if (pos >= 40 && pos <= 60) {
            feedback = "PERFECT!";
            feedbackColor = "#38bdf8";
            runs = (shot === 'Loft') ? 6 : 4;
        } else if (pos >= 20 && pos <= 80) {
            feedback = "GOOD!";
            feedbackColor = "#22c55e";
            runs = (shot === 'Loft') ? 4 : (shot === 'Defensive' ? 1 : 2);
        } else if (pos < 20) {
            feedback = "EARLY!";
            feedbackColor = "#ef4444";
            if (Math.random() < 0.25) { runs = -1; isWicket = true; }
            else { runs = 0; }
        } else {
            feedback = "LATE!";
            feedbackColor = "#ef4444";
            if (Math.random() < 0.25) { runs = -1; isWicket = true; }
            else { runs = 0; }
        }

        if (runs === 6) {
            gameState.totalSixes++;
            addXp(2, "Six Shot");
        }

        // Show Center Shot Feedback Popup (PERFECT! / GOOD!)
        const popup = document.getElementById('shotFeedbackPopup');
        if (popup) {
            popup.textContent = feedback;
            popup.style.color = feedbackColor;
            popup.classList.remove('hidden');
            setTimeout(() => { popup.classList.add('hidden'); }, 900);
        }

        // Animate celebratory result & ball
        setTimeout(() => {
            showCelebrationBanner(runs, isWicket, () => {
                processBallResult(runs, isWicket);
            });
        }, 300);
    });
});

function showCelebrationBanner(runs, isWicket, cb) {
    const overlay = document.getElementById('celebrationOverlay');
    const badge = document.getElementById('celebBadge');
    const sub = document.getElementById('celebSubtitle');

    if (isWicket || runs < 0) {
        badge.textContent = "OUT!";
        badge.style.color = "#ef4444";
        sub.textContent = "BOWLED & CAUGHT!";
    } else if (runs === 6) {
        badge.textContent = "6";
        badge.style.color = "#f59e0b";
        sub.textContent = "MAXIMUM SIX!";
    } else if (runs === 4) {
        badge.textContent = "4";
        badge.style.color = "#22c55e";
        sub.textContent = "FOUR RUNS!";
    } else if (runs === 0) {
        badge.textContent = "•";
        badge.style.color = "#64748b";
        sub.textContent = "DOT BALL";
    } else {
        badge.textContent = runs;
        badge.style.color = "#38bdf8";
        sub.textContent = `${runs} RUNS`;
    }

    overlay.classList.remove('hidden');
    setTimeout(() => {
        overlay.classList.add('hidden');
        cb();
    }, 1100);
}

function processBallResult(runs, isWicket) {
    const scoreVal = Math.max(0, runs);

    if (inMatchState.isBatting) {
        inMatchState.p1Score += scoreVal;
        document.getElementById('matchP1Score').textContent = inMatchState.p1Score;
    } else {
        inMatchState.p2Score += scoreVal;
    }

    // Update 6-Ball Over Slot Circle
    const dot = document.getElementById(`bdot-${inMatchState.ballNumber - 1}`);
    if (dot) {
        if (isWicket || runs < 0) {
            dot.className = 'ball-slot-circle scored-wicket';
            dot.textContent = 'W';
        } else if (runs === 6) {
            dot.className = 'ball-slot-circle scored-six';
            dot.textContent = '6';
        } else if (runs === 4) {
            dot.className = 'ball-slot-circle scored-four';
            dot.textContent = '4';
        } else if (runs === 0) {
            dot.className = 'ball-slot-circle scored-dot';
            dot.textContent = '•';
        } else {
            dot.className = 'ball-slot-circle scored-four';
            dot.textContent = runs;
        }
    }

    inMatchState.ballNumber++;

    if (inMatchState.ballNumber > 6) {
        if (inMatchState.innings === 1) {
            // Innings break -> Opponent Chase
            inMatchState.innings = 2;
            inMatchState.ballNumber = 1;
            resetTimelineDots();
            const target = inMatchState.p1Score + 1;
            document.getElementById('matchTargetVal').textContent = target;
            alert(`🏏 1st Innings Complete! You scored ${inMatchState.p1Score} runs. Defend ${target} runs!`);
            simulateOpponentInnings(target);
        } else {
            finishMatchPlay();
        }
    } else {
        setupBattingControls();
    }
}

function simulateOpponentInnings(target) {
    // Opponent chases 6 balls
    let oppScore = 0;
    let ball = 0;

    const oppInterval = setInterval(() => {
        const outcomes = [0, 1, 2, 4, 6, -1];
        const res = outcomes[Math.floor(Math.random() * outcomes.length)];
        if (res > 0) oppScore += res;

        const dot = document.getElementById(`bdot-${ball}`);
        if (dot) {
            if (res === 6) { dot.className = 'ball-slot-circle scored-six'; dot.textContent = '6'; }
            else if (res === 4) { dot.className = 'ball-slot-circle scored-four'; dot.textContent = '4'; }
            else if (res === -1) { dot.className = 'ball-slot-circle scored-wicket'; dot.textContent = 'W'; }
            else if (res === 0) { dot.className = 'ball-slot-circle scored-dot'; dot.textContent = '•'; }
            else { dot.className = 'ball-slot-circle'; dot.textContent = res; }
        }

        ball++;
        if (ball >= 6 || oppScore >= target) {
            clearInterval(oppInterval);
            inMatchState.p2Score = oppScore;
            setTimeout(finishMatchPlay, 800);
        }
    }, 600);
}

function setupBowlingControls() {
    inMatchState.isBatting = false;
    document.getElementById('battingControlsOverlay')?.classList.add('hidden');
    document.getElementById('bowlingControlsOverlay')?.classList.remove('hidden');
}

// Bowling Deliver Button
document.getElementById('lockDeliveryBtn')?.addEventListener('click', () => {
    // Simulate opponent batsman reaction
    const opponentOutcome = [0, 1, 2, 4, 6, -1][Math.floor(Math.random() * 6)];
    animateDelivery(() => {
        showCelebrationBanner(opponentOutcome, opponentOutcome === -1, () => {
            processBallResult(opponentOutcome, opponentOutcome === -1);
        });
    });
});

// ----------------------------------------------------
// Screen 8: Match Summary & Earnings
// ----------------------------------------------------
function finishMatchPlay() {
    navigateTo('screen-result');
    const won = inMatchState.p1Score >= inMatchState.p2Score;

    gameState.matchesPlayed++;
    if (won) {
        gameState.matchesWon++;
        const xpReward = currentMatchTour ? currentMatchTour.id * 15 : 15;
        addXp(xpReward, "Match Victory");
    }

    const headline = document.getElementById('winnerHeadline');
    if (headline) {
        headline.textContent = won ? "YOU WIN!" : "MATCH DEFEAT";
        headline.style.color = won ? "#facc15" : "#ef4444";
    }

    const p1Card = document.getElementById('resultP1Card');
    const p2Card = document.getElementById('resultP2Card');
    if (p1Card && p2Card) {
        p1Card.className = `result-player-card ${won ? 'card-winner' : 'card-loser'}`;
        p2Card.className = `result-player-card ${won ? 'card-loser' : 'card-winner'}`;
    }

    const p1ScoreEl = document.getElementById('summaryP1Score');
    const p2ScoreEl = document.getElementById('summaryP2Score');
    if (p1ScoreEl) p1ScoreEl.textContent = inMatchState.p1Score;
    if (p2ScoreEl) p2ScoreEl.textContent = inMatchState.p2Score;

    const payoutNotice = document.getElementById('payoutNotification');
    if (payoutNotice) {
        if (won) {
            const prize = currentMatchTour ? currentMatchTour.prize : 200;
            gameState.coins += prize;
            // Diamonds/Gems are ultra-rare and not awarded from regular matches
            payoutNotice.innerHTML = `
                <div class="payout-title">TOUR PRIZE COLLECTED</div>
                <div class="payout-rewards-row">
                    <div class="payout-pill"><span class="p-icon">🪙</span> +${prize.toLocaleString()} Coins</div>
                </div>
            `;
        } else {
            const consolation = 20;
            gameState.coins += consolation;
            payoutNotice.innerHTML = `
                <div class="payout-title">CONSOLATION REWARD</div>
                <div class="payout-rewards-row">
                    <div class="payout-pill"><span class="p-icon">🪙</span> +${consolation} Coins</div>
                </div>
            `;
        }
    }

    updateHud();
}

document.getElementById('resultContinueBtn')?.addEventListener('click', () => navigateTo('screen-home'));
document.getElementById('resultRematchBtn')?.addEventListener('click', () => navigateTo('screen-matchmaking'));

// ----------------------------------------------------
// Screen 10: Squad Management (Starting 11, Bowlers, Batsmen, Balls)
// ----------------------------------------------------
document.getElementById('tabPlaying11')?.addEventListener('click', () => {
    gameState.activeTab = 'playing11';
    setActiveSquadTab('tabPlaying11');
    showTeamSection('sectionPlaying11');
    renderSquadCards();
});

document.getElementById('tabBowlers')?.addEventListener('click', () => {
    gameState.activeTab = 'bowlers';
    setActiveSquadTab('tabBowlers');
    showTeamSection('sectionTraditionalSquad');
    renderSquadCards();
});

document.getElementById('tabBatsmen')?.addEventListener('click', () => {
    gameState.activeTab = 'batsmen';
    setActiveSquadTab('tabBatsmen');
    showTeamSection('sectionTraditionalSquad');
    renderSquadCards();
});

document.getElementById('tabBalls')?.addEventListener('click', () => {
    gameState.activeTab = 'balls';
    setActiveSquadTab('tabBalls');
    showTeamSection('sectionBalls');
    if (typeof initBallSkinsEngine === 'function') initBallSkinsEngine();
});

function showTeamSection(activeId) {
    ['sectionPlaying11', 'sectionTraditionalSquad', 'sectionBalls'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== activeId);
    });
}

function setActiveSquadTab(activeId) {
    ['tabPlaying11', 'tabBowlers', 'tabBatsmen', 'tabBalls'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', id === activeId);
    });
}

async function loadSquadCardsFromDb() {
    try {
        const res = await fetch('/api/squad');
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                gameState.countryCode = data.countryCode || gameState.countryCode || 'IN';
                if (data.countryInfo) {
                    gameState.countryName = data.countryInfo.name || gameState.countryName;
                    gameState.countryFlag = data.countryInfo.flag || gameState.countryFlag;
                    gameState.isMajorCountry = Boolean(data.countryInfo.isMajor);
                }
                gameState.teamPower = data.teamPower || 380;

                if (data.playing11 && data.playing11.length > 0) {
                    gameState.playing11 = data.playing11.map(c => ({
                        id: c.id,
                        name: c.card_name,
                        role: c.role,
                        type: c.card_type,
                        power: c.power,
                        rarity: c.rarity,
                        level: c.level,
                        copies: c.copies,
                        maxCopies: c.max_copies,
                        order: c.batting_order,
                        countryOrigin: c.country_origin,
                        originFlag: c.origin_flag || '🇮🇳',
                        active: Boolean(c.is_active)
                    }));
                }

                if (data.bowlers && data.bowlers.length > 0) {
                    gameState.bowlers = data.bowlers.map(c => ({
                        id: c.id,
                        name: c.card_name,
                        role: c.role,
                        type: c.card_type,
                        power: c.power,
                        rarity: c.rarity,
                        level: c.level,
                        copies: c.copies,
                        maxCopies: c.max_copies,
                        order: c.batting_order,
                        countryOrigin: c.country_origin,
                        originFlag: c.origin_flag || '🇮🇳',
                        active: Boolean(c.is_active)
                    }));
                }

                if (data.batsmen && data.batsmen.length > 0) {
                    gameState.batsmen = data.batsmen.map(c => ({
                        id: c.id,
                        name: c.card_name,
                        role: c.role,
                        type: c.card_type,
                        power: c.power,
                        rarity: c.rarity,
                        level: c.level,
                        copies: c.copies,
                        maxCopies: c.max_copies,
                        order: c.batting_order,
                        countryOrigin: c.country_origin,
                        originFlag: c.origin_flag || '🇮🇳',
                        active: Boolean(c.is_active),
                        isBat: c.card_name.includes('Bat')
                    }));
                }

                renderSquadCards();
                updateNationalBanner();
            }
        }
    } catch (e) {
        console.warn('Fallback squad cards load:', e.message);
    }
}

function getFlagImgHTML(countryCode, customClass = 'national-flag-img') {
    const code = (countryCode || 'IN').toLowerCase();
    return `<img src="/images/flags/${code}.svg" alt="${code}" class="${customClass}" />`;
}

function updateNationalBanner() {
    const flagEl = document.getElementById('teamCountryFlag');
    const nameEl = document.getElementById('teamCountryName');
    const tagEl = document.getElementById('teamCountryTypeTag');
    const pwrEl = document.getElementById('teamOverallPower');

    if (flagEl) flagEl.innerHTML = getFlagImgHTML(gameState.countryCode, 'banner-flag-img');
    if (nameEl) nameEl.textContent = `Team ${gameState.countryName || 'India'}`;
    if (tagEl) tagEl.textContent = gameState.isMajorCountry ? 'Major Cricket Nation' : 'All-Star Global Squad';
    if (pwrEl) pwrEl.textContent = gameState.teamPower || 380;
}

function getRoleClass(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('wk') || r.includes('keeper')) return 'role-wk';
    if (r.includes('all-rounder') || r.includes('ar')) return 'role-ar';
    if (r.includes('fast') || r.includes('pace') || r.includes('cutter')) return 'role-pace';
    if (r.includes('spin') || r.includes('wrist') || r.includes('off') || r.includes('leg')) return 'role-spin';
    return 'role-bat';
}

function getPlayer3DImage(name, role, order, countryCode, type) {
    if (typeof window !== 'undefined' && typeof window.getUniquePlayer3DAvatar === 'function') {
        return window.getUniquePlayer3DAvatar(name, role, order, countryCode || gameState.countryCode, type);
    }
    const r = (role || '').toLowerCase();
    const t = (type || '').toLowerCase();
    const c = (countryCode || gameState.countryCode || 'IN').toUpperCase();
    if (c === 'PK') {
        if (order === 1) return '/images/players/pk_bat.jpg';
        if (order === 8) return '/images/players/pk_pacer.jpg';
        if (order >= 10) return '/images/players/spinner.jpg';
    }
    if (c === 'AU') {
        if (order <= 2) return '/images/players/au_bat.jpg';
        if (order >= 8) return '/images/players/fast_bowler.jpg';
    }
    if (r.includes('wk') || r.includes('keeper') || t === 'wicket_keeper') return '/images/players/wicketkeeper.jpg';
    if (r.includes('all-rounder') || r.includes('ar') || t === 'all_rounder') return '/images/players/allrounder.jpg';
    if (r.includes('spin') || r.includes('wrist') || r.includes('leg') || r.includes('off')) return '/images/players/spinner.jpg';
    if (r.includes('fast') || r.includes('pace') || r.includes('cutter') || t === 'bowler') return '/images/players/fast_bowler.jpg';
    return '/images/players/batsman.jpg';
}

function renderSquadCards() {
    updateNationalBanner();

    const sectionPlaying11 = document.getElementById('sectionPlaying11');
    const sectionTraditional = document.getElementById('sectionTraditionalSquad');
    const sectionBalls = document.getElementById('sectionBalls');
    const grid11 = document.getElementById('playing11Grid');

    if (gameState.activeTab === 'playing11') {
        if (sectionPlaying11) sectionPlaying11.classList.remove('hidden');
        if (sectionTraditional) sectionTraditional.classList.add('hidden');
        if (sectionBalls) sectionBalls.classList.add('hidden');

        if (!grid11) return;
        grid11.innerHTML = '';

        const squadList = (gameState.playing11 && gameState.playing11.length > 0)
            ? gameState.playing11
            : [...gameState.batsmen.filter(b => !b.isBat), ...gameState.bowlers].slice(0, 11);

        squadList.forEach((c, idx) => {
            const cardEl = document.createElement('div');
            cardEl.className = `card-11-player ${c.rarity || 'common'}`;

            const isUpgradeAvailable = c.copies >= c.maxCopies;
            const roleClass = getRoleClass(c.role);
            const playerImg = getPlayer3DImage(c.name, c.role, c.order || (idx + 1), c.countryOrigin || gameState.countryCode, c.type);
            const flagHTML = getFlagImgHTML(c.countryOrigin || gameState.countryCode, 'card-flag-badge-img');

            cardEl.innerHTML = `
                <div class="card-11-top">
                    <span class="order-pill">#${c.order || (idx + 1)}</span>
                    <span class="role-badge-pill ${roleClass}">${c.role}</span>
                </div>
                <div class="card-11-body">
                    <div class="card-11-avatar">
                        <img src="${playerImg}" alt="${c.name}" class="player-3d-img" loading="lazy" />
                        <span class="card-11-flag-badge">${flagHTML}</span>
                    </div>
                    <div class="card-11-info">
                        <div class="card-11-name">${c.name}</div>
                        <div class="card-11-spec">${c.role}</div>
                    </div>
                </div>
                <div class="card-11-stats-row">
                    <span class="stat-pwr-tag">⚡ ${c.power} PWR</span>
                    <span class="stat-level-tag">Lv. ${c.level}</span>
                </div>
                ${isUpgradeAvailable ?
                    `<button class="upgrade-green-pill" onclick="openUpgradeModal(${c.id})">Upgrade ⬆</button>` :
                    `<div class="progress-xp-pill">Lv. ${c.level} • ${c.copies}/${c.maxCopies}</div>`
                }
            `;

            grid11.appendChild(cardEl);
        });

    } else {
        if (sectionPlaying11) sectionPlaying11.classList.add('hidden');
        if (sectionTraditional) sectionTraditional.classList.remove('hidden');
        if (sectionBalls) sectionBalls.classList.add('hidden');

        const titleEl = document.getElementById('traditionalSectionTitle');
        if (titleEl) {
            titleEl.textContent = (gameState.activeTab === 'bowlers') ? 'Active Bowlers' : 'Active Batsmen';
        }

        const activeRow = document.getElementById('activeTeamRow');
        const reserveGrid = document.getElementById('reserveGrid');
        if (!activeRow || !reserveGrid) return;

        activeRow.innerHTML = '';
        reserveGrid.innerHTML = '';

        const list = (gameState.activeTab === 'bowlers') ? gameState.bowlers : gameState.batsmen;

        list.forEach((c, idx) => {
            const cardEl = document.createElement('div');
            cardEl.className = `player-card-3d ${c.rarity}`;

            const isUpgradeAvailable = c.copies >= c.maxCopies && !c.isBat;
            const playerImg = c.isBat ? null : getPlayer3DImage(c.name, c.role, c.order || (idx + 1), c.countryOrigin || gameState.countryCode, c.type);

            cardEl.innerHTML = `
                <div class="card-top-badges">
                    <span class="rarity-pill">${c.rarity}</span>
                    <span class="power-digit">${c.isBat ? '∞' : c.power}</span>
                </div>
                <div class="player-avatar-circle">
                    ${c.isBat ? '🏏' : `<img src="${playerImg}" alt="${c.name}" class="player-3d-img" />`}
                </div>
                <div class="player-card-name">${c.name}</div>
                <div class="player-card-role">${c.role}</div>
                ${c.isBat ? '' : (isUpgradeAvailable ?
                    `<button class="upgrade-green-pill" onclick="openUpgradeModal(${c.id})">Lv. ${c.level} Upgrade ⬆</button>` :
                    `<div class="progress-xp-pill">Lv. ${c.level} • ${c.copies}/${c.maxCopies}</div>`)}
            `;

            if (c.active) activeRow.appendChild(cardEl);
            else reserveGrid.appendChild(cardEl);
        });
    }
}

// Upgrade Modal
let selectedCardToUpgrade = null;
window.openUpgradeModal = function (cardId) {
    const allCards = [...(gameState.playing11 || []), ...(gameState.bowlers || []), ...(gameState.batsmen || [])];
    selectedCardToUpgrade = allCards.find(x => x.id === cardId);
    if (!selectedCardToUpgrade) return;

    const modal = document.getElementById('cardUpgradeModal');
    document.getElementById('upgradePlayerTitle').textContent = `Upgrade ${selectedCardToUpgrade.name}`;
    document.getElementById('upgradeStatsPreview').innerHTML = `Power: ${selectedCardToUpgrade.power} ➜ <strong>${selectedCardToUpgrade.power + 5}</strong> (+5)`;
    document.getElementById('upgradeCopiesInfo').textContent = `Copies: ${selectedCardToUpgrade.copies}/${selectedCardToUpgrade.maxCopies}`;

    const cost = selectedCardToUpgrade.level * 400;
    document.getElementById('confirmUpgradeBtn').textContent = `Upgrade • ${cost.toLocaleString()} 🪙`;

    modal.classList.remove('hidden');
};

document.getElementById('confirmUpgradeBtn')?.addEventListener('click', async () => {
    if (!selectedCardToUpgrade) return;
    const cost = selectedCardToUpgrade.level * 400;

    if (gameState.coins < cost) {
        alert("Not enough coins! Play matches to earn more coins.");
        return;
    }

    try {
        const res = await fetch('/api/squad/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardId: selectedCardToUpgrade.id })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                gameState.coins -= cost;
                selectedCardToUpgrade.power = data.card.power;
                selectedCardToUpgrade.level = data.card.level;
                selectedCardToUpgrade.copies = data.card.copies;
                selectedCardToUpgrade.maxCopies = data.card.max_copies;
                addXp(50, "Card Upgrade");
                updateHud();
                await loadSquadCardsFromDb();
                document.getElementById('cardUpgradeModal')?.classList.add('hidden');
                alert(data.message);
                return;
            }
        }
    } catch (e) { }

    // Fallback local upgrade
    gameState.coins -= cost;
    selectedCardToUpgrade.power += 5;
    selectedCardToUpgrade.level += 1;
    selectedCardToUpgrade.copies = Math.max(0, selectedCardToUpgrade.copies - selectedCardToUpgrade.maxCopies);
    selectedCardToUpgrade.maxCopies += 5;
    addXp(50, "Card Upgrade");
    updateHud();
    renderSquadCards();
    document.getElementById('cardUpgradeModal')?.classList.add('hidden');
});

document.getElementById('closeUpgradeModalBtn')?.addEventListener('click', () => {
    document.getElementById('cardUpgradeModal')?.classList.add('hidden');
});

// ==========================================================
// Country Selection & Starting 11 Squad Modal Logic
// ==========================================================
let availableCountriesCache = null;
let selectedCountryCodeInModal = 'IN';
let activeCountryCategoryTab = 'major';

document.getElementById('openCountrySelectBtn')?.addEventListener('click', () => {
    openCountrySelectionModal();
});

document.getElementById('closeCountryModalBtn')?.addEventListener('click', () => {
    document.getElementById('countrySelectionModal')?.classList.add('hidden');
});

document.getElementById('catMajorNations')?.addEventListener('click', () => {
    activeCountryCategoryTab = 'major';
    document.getElementById('catMajorNations').classList.add('active');
    document.getElementById('catOtherNations').classList.remove('active');
    renderCountryModalGrid();
});

document.getElementById('catOtherNations')?.addEventListener('click', () => {
    activeCountryCategoryTab = 'other';
    document.getElementById('catOtherNations').classList.add('active');
    document.getElementById('catMajorNations').classList.remove('active');
    renderCountryModalGrid();
});

async function openCountrySelectionModal() {
    const modal = document.getElementById('countrySelectionModal');
    if (!modal) return;

    selectedCountryCodeInModal = gameState.countryCode || 'IN';

    try {
        if (!availableCountriesCache) {
            const res = await fetch('/api/squad/countries');
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    availableCountriesCache = data;
                }
            }
        }
    } catch (e) {
        console.warn('Countries API error:', e.message);
    }

    renderCountryModalGrid();
    await previewCountryRoster(selectedCountryCodeInModal);
    modal.classList.remove('hidden');
}

function renderCountryModalGrid() {
    const grid = document.getElementById('countryListGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const list = (activeCountryCategoryTab === 'major')
        ? (availableCountriesCache?.majorCountries || [])
        : (availableCountriesCache?.otherCountries || []);

    list.forEach(c => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `country-item-btn ${c.code === selectedCountryCodeInModal ? 'selected' : ''}`;
        const flagHTML = getFlagImgHTML(c.code, 'country-grid-flag');

        btn.innerHTML = `
            <div class="country-item-flag">${flagHTML}</div>
            <div class="country-item-name">${c.name}</div>
        `;

        btn.addEventListener('click', () => {
            selectedCountryCodeInModal = c.code;
            renderCountryModalGrid();
            previewCountryRoster(c.code);
        });

        grid.appendChild(btn);
    });
}

async function previewCountryRoster(countryCode) {
    try {
        const res = await fetch(`/api/squad/preview?country=${countryCode}`);
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                const cInfo = data.countryInfo;
                const flagEl = document.getElementById('previewCountryFlag');
                const nameEl = document.getElementById('previewCountryName');
                const metaEl = document.getElementById('previewCountryMeta');
                const pwrEl = document.getElementById('previewTeamPowerBadge');

                if (flagEl) flagEl.innerHTML = getFlagImgHTML(cInfo.code || countryCode, 'preview-flag-img');
                if (nameEl) nameEl.textContent = cInfo.name;
                if (metaEl) metaEl.textContent = cInfo.description || '';

                const totalPwr = data.players.reduce((sum, p) => sum + (p.power || 0), 0);
                if (pwrEl) pwrEl.textContent = `${totalPwr} PWR`;

                const scroller = document.getElementById('previewPlayersScroller');
                if (scroller) {
                    scroller.innerHTML = '';
                    data.players.forEach(p => {
                        const chip = document.createElement('div');
                        chip.className = `preview-player-chip ${p.rarity}`;
                        const playerImg = getPlayer3DImage(p.name, p.role, p.order, p.countryOrigin || countryCode, p.type);

                        chip.innerHTML = `
                            <div class="chip-avatar-img-wrap">
                                <img src="${playerImg}" alt="${p.name}" class="chip-3d-img" />
                                <span class="chip-order">#${p.order}</span>
                            </div>
                            <div class="chip-name">${p.name}</div>
                            <div class="chip-role">${p.role}</div>
                            <div class="chip-power">⚡ ${p.power}</div>
                        `;
                        scroller.appendChild(chip);
                    });
                }
            }
        }
    } catch (e) {
        console.warn('Preview error:', e.message);
    }
}

document.getElementById('confirmCountrySelectBtn')?.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/squad/select-country', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ countryCode: selectedCountryCodeInModal })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                gameState.countryCode = data.countryInfo.code;
                gameState.countryFlag = data.countryInfo.flag;
                gameState.countryName = data.countryInfo.name;
                gameState.isMajorCountry = data.countryInfo.isMajor;
                gameState.teamPower = data.teamPower;

                document.getElementById('countrySelectionModal')?.classList.add('hidden');
                await loadSquadCardsFromDb();
                updateHud();
                alert(data.message || `🎉 Starting 11 squad updated for ${gameState.countryName}!`);
                return;
            }
        }
    } catch (e) {
        console.error('Select country error:', e);
    }
});

// ----------------------------------------------------
// Screen 11: Shop & Piggy Bank Actions
// ----------------------------------------------------
document.getElementById('buyFeaturedPackBtn')?.addEventListener('click', () => {
    gameState.coins += 20000;
    gameState.gems += 200;
    addXp(100, "Featured Bundle");
    updateHud();
    alert("🎉 Epic Bowler Pack Unlocked! +20,000 Coins & +200 Gems added to your wallet.");
});

document.getElementById('breakPiggyBtn')?.addEventListener('click', () => {
    if (gameState.gems < 350) {
        alert("You need 350 Gems to open the Piggy Bank!");
        return;
    }

    gameState.gems -= 350;
    gameState.gems += 385;
    gameState.coins += 4000;
    addXp(200, "Piggy Bank");
    updateHud();
    alert("🐷 Piggy Bank Opened! +385 Gems, +4,000 Coins, and +2 Cards claimed!");
});

// ----------------------------------------------------
// Screen 12: Ball Skins
// ----------------------------------------------------
function renderBallSkins() {
    const grid = document.getElementById('ballSkinsGridView');
    if (!grid) return;
    grid.innerHTML = '';

    gameState.ballSkins.forEach((s, idx) => {
        const item = document.createElement('div');
        item.className = `ball-skin-card ${s.active ? 'active' : ''}`;
        item.innerHTML = `
            <div class="ball-icon-circle">${s.icon}</div>
            <div class="player-card-name">${s.name}</div>
            <div class="player-card-role">${s.qty}</div>
        `;
        item.addEventListener('click', () => {
            gameState.ballSkins.forEach(b => b.active = false);
            s.active = true;
            renderBallSkins();
        });
        grid.appendChild(item);
    });
}

// ----------------------------------------------------
// Player Profile & Career Stats Modal
// ----------------------------------------------------
document.getElementById('headerAvatarBtn')?.addEventListener('click', () => {
    openPlayerProfileModal();
});

function openPlayerProfileModal() {
    const modal = document.getElementById('playerProfileModal');
    if (!modal) return;

    const reqXp = getXpForLevel(gameState.level);
    const xpPct = Math.min(100, Math.round((gameState.xp / reqXp) * 100));

    document.getElementById('profileLevelBadge').textContent = `Level ⭐ ${gameState.level}`;
    document.getElementById('profileXpFraction').textContent = `${gameState.xp} / ${reqXp} XP`;
    document.getElementById('profileXpFill').style.width = `${xpPct}%`;

    document.getElementById('statMatchesPlayed').textContent = gameState.matchesPlayed;
    document.getElementById('statMatchesWon').textContent = gameState.matchesWon;

    const winRate = gameState.matchesPlayed > 0
        ? Math.round((gameState.matchesWon / gameState.matchesPlayed) * 100)
        : 0;
    document.getElementById('statWinRate').textContent = `${winRate}%`;
    document.getElementById('statTotalSixes').textContent = gameState.totalSixes;

    modal.classList.remove('hidden');
}

document.getElementById('closeProfileModalBtn')?.addEventListener('click', () => {
    document.getElementById('playerProfileModal')?.classList.add('hidden');
});
document.getElementById('profileOkBtn')?.addEventListener('click', () => {
    document.getElementById('playerProfileModal')?.classList.add('hidden');
});

// ----------------------------------------------------
// Free Rewards Modal (Top-Right Free Coins Button)
// ----------------------------------------------------
document.getElementById('freeCoinsWidget')?.addEventListener('click', () => {
    document.getElementById('freeRewardsModal')?.classList.remove('hidden');
});

document.getElementById('closeFreeRewardsBtn')?.addEventListener('click', () => {
    document.getElementById('freeRewardsModal')?.classList.add('hidden');
});

let currentAdStep = 1; // 1 = 450 coins, 2 = 550 coins, 3 = pack, 4 = gems

function showAdNotice(message = "📢 Video Ads are currently not available. Please try again later!") {
    const toast = document.getElementById('adNoticeToast');
    if (toast) {
        toast.textContent = message;
        toast.classList.remove('hidden');
        if (window._adToastTimer) clearTimeout(window._adToastTimer);
        window._adToastTimer = setTimeout(() => {
            toast.classList.add('hidden');
        }, 2200);
    }
}

const FREE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 Hours Countdown

function initFreeClaimTimer() {
    const btn = document.getElementById('freeInstantClaimBtn');
    const sub = btn?.querySelector('.free-claim-sub');
    if (!btn || !sub) return;

    function tick() {
        const lastClaimStr = localStorage.getItem('freeClaimTimestamp_v1');
        if (!lastClaimStr) {
            btn.classList.remove('claimed');
            sub.textContent = "Collect now!";
            return;
        }

        const lastClaim = parseInt(lastClaimStr, 10);
        const elapsed = Date.now() - lastClaim;
        const remaining = FREE_COOLDOWN_MS - elapsed;

        if (remaining <= 0) {
            btn.classList.remove('claimed');
            sub.textContent = "Collect now!";
            localStorage.removeItem('freeClaimTimestamp_v1');
        } else {
            btn.classList.add('claimed');
            const h = Math.floor(remaining / (1000 * 60 * 60));
            const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((remaining % (1000 * 60)) / 1000);
            sub.textContent = `⏱️ ${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
        }
    }

    tick();
    setInterval(tick, 1000);
}

document.getElementById('freeInstantClaimBtn')?.addEventListener('click', () => {
    const lastClaimStr = localStorage.getItem('freeClaimTimestamp_v1');
    if (lastClaimStr) {
        const remaining = FREE_COOLDOWN_MS - (Date.now() - parseInt(lastClaimStr, 10));
        if (remaining > 0) {
            const h = Math.floor(remaining / (1000 * 60 * 60));
            const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((remaining % (1000 * 60)) / 1000);
            showAdNotice(`⏱️ Next free reward ready in ${h}h ${m}m ${s}s!`);
            return;
        }
    }

    localStorage.setItem('freeClaimTimestamp_v1', Date.now().toString());
    gameState.coins += 100;
    addXp(10, "Free Coins");
    updateHud();

    const btn = document.getElementById('freeInstantClaimBtn');
    btn?.classList.add('claimed');
    const sub = btn?.querySelector('.free-claim-sub');
    if (sub) sub.textContent = "⏱️ 23h 59m 59s";

    showAdNotice("🎉 +100 Free Coins Claimed!");
});

// Initialize timer on script load
initFreeClaimTimer();

document.getElementById('adCollect450')?.addEventListener('click', () => {
    if (currentAdStep < 1) return;
    showAdNotice("📢 Video Ads are currently not available for 450 Coins. Please try again later!");
});

document.getElementById('adCollect550')?.addEventListener('click', () => {
    if (currentAdStep < 2) {
        showAdNotice("🔒 Please collect the 450 Coins reward first!");
        return;
    }
    showAdNotice("📢 Video Ads are currently not available for 550 Coins. Please try again later!");
});

document.getElementById('adCollectPack')?.addEventListener('click', () => {
    if (currentAdStep < 3) {
        showAdNotice("🔒 Please collect the 550 Coins reward first!");
        return;
    }
    showAdNotice("📢 Video Ads are currently not available for Free Pack. Please try again later!");
});

document.getElementById('adCollectGems')?.addEventListener('click', () => {
    if (currentAdStep < 4) {
        showAdNotice("🔒 Please collect the Free Pack reward first!");
        return;
    }
    showAdNotice("📢 Video Ads are currently not available for 5 Diamonds. Please try again later!");
});

// ----------------------------------------------------
// Screen 13: Friends & Dynamic 1 VS 1 Matches (Real-time Socket & REST)
// ----------------------------------------------------
let dynamicPendingRequests = [];
let dynamicFriendsList = [];
let active1v1ChallengeTimer = null;
let currentPending1v1Challenge = null;

if (typeof socket !== 'undefined' && socket) {
    socket.emit('register_player', {
        playerId: 'player_' + (gameState.level * 100 + 7),
        username: gameState.username,
        avatar: '👤',
        level: gameState.level
    });

    // 1. Friend accepted your 1v1 challenge!
    socket.on('1v1_challenge_accepted', (data) => {
        clearInterval(active1v1ChallengeTimer);
        const desc = document.getElementById('waitingFriendDesc');
        if (desc) desc.textContent = `✓ ${data.friend.name} Accepted to play! Loading Stadium...`;

        setTimeout(() => {
            document.getElementById('waitingFriendModal')?.classList.add('hidden');

            // Set custom 1v1 match profile
            currentMatchTour = { id: 1, name: `${data.friend.name} 🇮🇳 (1 VS 1)`, fee: 100, prize: 200, color: "#22c55e" };

            // Update Pre-Match opponent card
            const oppNameEl = document.querySelector('.opponent-prematch-card .p-name');
            const oppRankEl = document.querySelector('.opponent-prematch-card .p-rank-star');
            const oppAvatarEl = document.querySelector('.opponent-prematch-card .p-avatar-circle');
            if (oppNameEl) oppNameEl.textContent = data.friend.name;
            if (oppRankEl) oppRankEl.textContent = `⭐ ${data.friend.level || 25}`;
            if (oppAvatarEl) oppAvatarEl.textContent = data.friend.flag || '🇮🇳';

            // Update Local player card
            const myRankEl = document.querySelector('.local-prematch-card .p-rank-star');
            if (myRankEl) myRankEl.textContent = `⭐ ${gameState.level}`;

            startPreMatchScreen();
        }, 1200);
    });

    // 2. Friend declined your challenge
    socket.on('1v1_challenge_declined', (data) => {
        clearInterval(active1v1ChallengeTimer);
        document.getElementById('waitingFriendModal')?.classList.add('hidden');
        gameState.coins += 100; // Refund fee
        updateHud();
        alert(data.message || "❌ Friend is currently busy and declined the match.");
    });

    // 3. Receive incoming 1v1 challenge from another friend
    socket.on('receive_1v1_challenge', (data) => {
        currentPending1v1Challenge = data;
        const modal = document.getElementById('incomingChallengeModal');
        if (!modal) return;

        document.getElementById('challengerName').textContent = data.fromPlayer.username;
        document.getElementById('challengerRank').textContent = `⭐ ${data.fromPlayer.level} • Pro Player`;

        const timerFill = document.getElementById('challengeTimerFill');
        if (timerFill) timerFill.style.width = '100%';

        modal.classList.remove('hidden');

        // 15-second countdown timer to accept or decline
        let secondsLeft = 15;
        const interval = setInterval(() => {
            secondsLeft--;
            if (timerFill) timerFill.style.width = `${(secondsLeft / 15) * 100}%`;
            if (secondsLeft <= 0) {
                clearInterval(interval);
                modal.classList.add('hidden');
                socket.emit('decline_1v1_challenge', { challengeId: data.challengeId });
            }
        }, 1000);
    });
}

// Accept incoming 1v1 challenge
document.getElementById('accept1v1Btn')?.addEventListener('click', () => {
    if (!currentPending1v1Challenge) return;
    if (gameState.coins < 100) {
        alert("You need at least 100 coins to accept this 1 VS 1 match!");
        return;
    }

    gameState.coins -= 100;
    updateHud();
    document.getElementById('incomingChallengeModal')?.classList.add('hidden');

    if (socket) {
        socket.emit('accept_1v1_challenge', { challengeId: currentPending1v1Challenge.challengeId });
    }

    // Launch Match
    currentMatchTour = { id: 1, name: `${currentPending1v1Challenge.fromPlayer.username} 🇮🇳 (1 VS 1)`, fee: 100, prize: 200, color: "#22c55e" };
    startPreMatchScreen();
});

// Decline incoming 1v1 challenge
document.getElementById('decline1v1Btn')?.addEventListener('click', () => {
    if (currentPending1v1Challenge && socket) {
        socket.emit('decline_1v1_challenge', { challengeId: currentPending1v1Challenge.challengeId });
    }
    document.getElementById('incomingChallengeModal')?.classList.add('hidden');
});

// Load Dynamic Friends & Authentication Status from Backend REST API
let isCurrentPlayerGuest = false;
let currentAuthProvider = 'google';
let selectedSocialProvider = 'google';

async function loadDynamicFriendsData() {
    try {
        const res = await fetch('/api/friends');
        if (res.ok) {
            const data = await res.json();
            isCurrentPlayerGuest = Boolean(data.isGuest);
            currentAuthProvider = data.authProvider || 'google';
            dynamicPendingRequests = data.pendingRequests || [];
            dynamicFriendsList = data.friends || [];
        }
    } catch (e) {
        console.warn('Backend API fallback');
    }
    renderFriendsScreen();
}

function renderFriendsScreen() {
    const guestLockView = document.getElementById('friendsGuestLockView');
    const connectedView = document.getElementById('friendsConnectedView');
    const authStatusLabel = document.getElementById('connectedAccountLabel');

    if (isCurrentPlayerGuest) {
        // GUEST PLAYER: Lock Friends system completely
        if (guestLockView) guestLockView.classList.remove('hidden');
        if (connectedView) connectedView.classList.add('hidden');
    } else {
        // AUTHENTICATED WITH GOOGLE / FACEBOOK: Unlock Friends
        if (guestLockView) guestLockView.classList.add('hidden');
        if (connectedView) connectedView.classList.remove('hidden');

        if (authStatusLabel) {
            const providerName = currentAuthProvider === 'facebook' ? 'Facebook' : 'Google Play Games';
            authStatusLabel.innerHTML = `Connected: <strong>${providerName} (${gameState.username})</strong>`;
        }

        renderPendingRequests();
        renderActiveFriendsList();
    }
}

// Dynamic OAuth Configuration Loader from .env
let oauthConfig = { googleClientId: '', facebookAppId: '' };

async function loadOAuthConfig() {
    try {
        const res = await fetch('/api/auth/config');
        if (res.ok) {
            const data = await res.json();
            oauthConfig = data;
            if (oauthConfig.googleClientId && typeof google !== 'undefined' && google.accounts) {
                google.accounts.id.initialize({
                    client_id: oauthConfig.googleClientId,
                    callback: (response) => {
                        authenticateWithBackend({
                            provider: 'google',
                            socialId: 'google_oauth',
                            googleCredential: response.credential
                        });
                    }
                });
            }
            if (oauthConfig.facebookAppId && typeof FB !== 'undefined') {
                FB.init({
                    appId: oauthConfig.facebookAppId,
                    cookie: true,
                    xfbml: true,
                    version: 'v18.0'
                });
            }
        }
    } catch (e) { }
}

loadOAuthConfig();

// Helper for Google Sign-in trigger
async function handleGoogleSignInTrigger() {
    if (oauthConfig.googleClientId && typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.prompt();
        return;
    }
    await authenticateWithBackend({
        provider: 'google',
        socialId: 'GP-8942-IN',
        displayName: gameState.username || 'Player',
        email: `${(gameState.username || 'player').toLowerCase().replace(/\s+/g, '')}@gmail.com`,
        avatar: '🎮'
    });
}

// Helper for Facebook Sign-in trigger
async function handleFacebookSignInTrigger() {
    if (oauthConfig.facebookAppId && typeof FB !== 'undefined') {
        FB.login(function (response) {
            if (response.authResponse) {
                FB.api('/me', { fields: 'name, email, picture' }, function (userData) {
                    authenticateWithBackend({
                        provider: 'facebook',
                        socialId: userData.id || 'FB-10293847',
                        displayName: userData.name || gameState.username,
                        email: userData.email,
                        avatar: '🇫'
                    });
                });
                return;
            }
        }, { scope: 'public_profile,email' });
        return;
    }

    await authenticateWithBackend({
        provider: 'facebook',
        socialId: 'FB-10293847',
        displayName: gameState.username || 'Player',
        email: `${(gameState.username || 'player').toLowerCase().replace(/\s+/g, '')}@facebook.com`,
        avatar: '🇫'
    });
}

// Sign in event listeners for Friends and Clubs
document.getElementById('guestGoogleSignInBtn')?.addEventListener('click', handleGoogleSignInTrigger);
document.getElementById('clubsGoogleSignInBtn')?.addEventListener('click', handleGoogleSignInTrigger);

document.getElementById('guestFacebookSignInBtn')?.addEventListener('click', handleFacebookSignInTrigger);
document.getElementById('clubsFacebookSignInBtn')?.addEventListener('click', handleFacebookSignInTrigger);

// Common Backend Social Sign-In Helper with Dynamic MySQL Match
async function authenticateWithBackend(payload) {
    try {
        const res = await fetch('/api/auth/social-signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            isCurrentPlayerGuest = false;
            currentAuthProvider = payload.provider;

            // Sync user data with MySQL row
            if (data.user) {
                gameState.username = data.user.username;
                gameState.coins = data.user.coins;
                gameState.gems = data.user.gems;
                gameState.level = data.user.level;
                gameState.trophies = data.user.trophies;
            }

            updateHud();
            await loadDynamicFriendsData();
            await loadClubsFromDb();
            alert(data.message);
        } else {
            alert(data.message || "Authentication failed.");
        }
    } catch (err) {
        console.error("Sign-in error:", err);
        isCurrentPlayerGuest = false;
        renderFriendsScreen();
        loadClubsFromDb();
    }
}

// Cancel Social Auth Modal
document.getElementById('cancelSocialAuthBtn')?.addEventListener('click', () => {
    document.getElementById('socialAuthModal')?.classList.add('hidden');
});

// Switch to Guest Mode Button
document.getElementById('switchToGuestBtn')?.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/auth/switch-guest', { method: 'POST' });
        if (res.ok) {
            isCurrentPlayerGuest = true;
            renderFriendsScreen();
            alert("Switched to Guest Mode. Sign in with Google Play Games or Facebook to re-enable your friends list!");
        }
    } catch (e) {
        isCurrentPlayerGuest = true;
        renderFriendsScreen();
    }
});

document.getElementById('friendsWidget')?.addEventListener('click', () => {
    navigateTo('screen-friends');
    loadDynamicFriendsData();
});

document.getElementById('friendsBackBtn')?.addEventListener('click', () => {
    navigateTo('screen-home');
});

document.getElementById('friendsSearchToggleBtn')?.addEventListener('click', () => {
    const row = document.getElementById('friendSearchBarRow');
    if (row) row.classList.toggle('hidden');
});

// Add friend dynamically via REST API
document.getElementById('sendFriendRequestBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('friendSearchInput');
    const name = input?.value.trim();
    if (!name) {
        alert("Please enter a username or player ID.");
        return;
    }

    try {
        const res = await fetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, level: gameState.level, avatar: '👤' })
        });
        const result = await res.json();
        if (result.success) {
            alert(`🤝 Friend Request sent to ${name}!`);
        }
    } catch (e) { }

    // Add to local list immediately
    dynamicFriendsList.unshift({
        id: 'p_' + Date.now(),
        name: name,
        flag: '🇮🇳',
        level: Math.floor(Math.random() * 20) + 1,
        rank: 'Pro Master',
        avatar: '🏏',
        online: true,
        giftSent: false
    });

    if (input) input.value = '';
    renderFriendsScreen();
});

function renderPendingRequests() {
    const box = document.getElementById('pendingRequestsBox');
    const list = document.getElementById('pendingRequestsList');
    const countEl = document.getElementById('pendingReqCount');
    const badgeEl = document.getElementById('friendsBadgeCount');

    if (!list) return;
    list.innerHTML = '';

    if (countEl) countEl.textContent = dynamicPendingRequests.length;
    if (badgeEl) {
        badgeEl.textContent = dynamicPendingRequests.length;
        badgeEl.style.display = dynamicPendingRequests.length > 0 ? 'flex' : 'none';
    }

    if (dynamicPendingRequests.length === 0) {
        if (box) box.style.display = 'none';
        return;
    } else {
        if (box) box.style.display = 'block';
    }

    dynamicPendingRequests.forEach((req, idx) => {
        const row = document.createElement('div');
        row.className = 'pending-request-card';
        row.innerHTML = `
            <div class="pending-user-left">
                <div class="friend-avatar-wrapper">${req.avatar}</div>
                <div class="friend-meta-col">
                    <div class="friend-name-row">
                        <span class="friend-flag">${req.flag}</span>
                        <span class="friend-username">${req.name}</span>
                    </div>
                    <div class="friend-rank-row">⭐ ${req.level} • ${req.rank}</div>
                </div>
            </div>
            <div class="pending-actions">
                <button class="req-accept-btn" id="acceptReqBtn-${idx}">Accept ✓</button>
                <button class="req-decline-btn" id="declineReqBtn-${idx}">Decline ✕</button>
            </div>
        `;

        row.querySelector(`#acceptReqBtn-${idx}`).addEventListener('click', async () => {
            try {
                await fetch('/api/friends/accept', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requestId: req.id })
                });
            } catch (e) { }

            dynamicFriendsList.unshift({
                id: req.playerId || 'p_' + Date.now(),
                name: req.name,
                flag: req.flag,
                level: req.level,
                rank: req.rank,
                avatar: req.avatar,
                online: true,
                giftSent: false
            });
            dynamicPendingRequests.splice(idx, 1);
            renderFriendsScreen();
            alert(`🤝 Friend Request Accepted! You and ${req.name} are now friends. Tap 1 VS 1 to challenge them!`);
        });

        row.querySelector(`#declineReqBtn-${idx}`).addEventListener('click', async () => {
            try {
                await fetch('/api/friends/decline', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requestId: req.id })
                });
            } catch (e) { }
            dynamicPendingRequests.splice(idx, 1);
            renderFriendsScreen();
        });

        list.appendChild(row);
    });
}

function renderActiveFriendsList() {
    const list = document.getElementById('friendsListContainer');
    if (!list) return;
    list.innerHTML = '';

    dynamicFriendsList.forEach(f => {
        const card = document.createElement('div');
        card.className = 'friend-row-card';
        card.innerHTML = `
            <div class="friend-card-left">
                <div class="friend-avatar-wrapper">
                    ${f.avatar}
                    <span class="friend-online-dot"></span>
                </div>
                <div class="friend-meta-col">
                    <div class="friend-name-row">
                        <span class="friend-flag">${f.flag}</span>
                        <span class="friend-username">${f.name}</span>
                    </div>
                    <div class="friend-rank-row">⭐ ${f.level} ${f.rank}</div>
                </div>
            </div>
            <div class="friend-card-right">
                <button class="friend-gift-btn" title="Send Coins Gift">
                    <span class="gift-icon">🎁</span>
                    <span class="gift-label">${f.giftSent ? 'Sent' : 'Send'}</span>
                </button>
                <button class="friend-vs-btn" title="Start 1 VS 1 Match">
                    1 VS 1
                </button>
            </div>
        `;

        // Gift Button Action
        const giftBtn = card.querySelector('.friend-gift-btn');
        giftBtn.addEventListener('click', async () => {
            if (f.giftSent) {
                alert(`🎁 You already sent today's gift to ${f.name}!`);
                return;
            }
            try {
                await fetch('/api/friends/gift', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ friendId: f.id })
                });
            } catch (e) { }

            f.giftSent = true;
            gameState.coins += 50;
            addXp(5, "Friend Gift");
            updateHud();
            giftBtn.querySelector('.gift-label').textContent = 'Sent';
            alert(`🎁 Sent a Daily Gift to ${f.name}! You received +50 🪙 Coins & +5 XP!`);
        });

        // 1 VS 1 Match Action -> Requires Friend Acceptance!
        const vsBtn = card.querySelector('.friend-vs-btn');
        vsBtn.addEventListener('click', () => {
            start1v1FriendMatchWithAcceptance(f);
        });

        list.appendChild(card);
    });
}

// 1 VS 1 Challenge with Online Friend Acceptance Flow
function start1v1FriendMatchWithAcceptance(friend) {
    if (gameState.coins < 100) {
        alert("You need at least 100 coins to challenge a friend to a 1 VS 1 match!");
        return;
    }

    gameState.coins -= 100;
    updateHud();

    const waitingModal = document.getElementById('waitingFriendModal');
    const waitingDesc = document.getElementById('waitingFriendDesc');
    const waitingCount = document.getElementById('waitingCountdownText');

    if (waitingDesc) waitingDesc.textContent = `Waiting for ${friend.name} to accept...`;
    if (waitingModal) waitingModal.classList.remove('hidden');

    let seconds = 15;
    if (waitingCount) waitingCount.textContent = `⏱️ ${seconds}s`;

    clearInterval(active1v1ChallengeTimer);
    active1v1ChallengeTimer = setInterval(() => {
        seconds--;
        if (waitingCount) waitingCount.textContent = `⏱️ ${seconds}s`;
        if (seconds <= 0) {
            clearInterval(active1v1ChallengeTimer);
            waitingModal?.classList.add('hidden');
            gameState.coins += 100; // Refund fee
            updateHud();
            alert(`⏱️ ${friend.name} did not accept the match in time. 100 coins refunded.`);
        }
    }, 1000);

    // Cancel Challenge button
    document.getElementById('cancel1v1ChallengeBtn').onclick = () => {
        clearInterval(active1v1ChallengeTimer);
        waitingModal?.classList.add('hidden');
        gameState.coins += 100; // Refund fee
        updateHud();
        if (socket) socket.emit('decline_1v1_challenge', { challengeId: 'cancel' });
    };

    // Emit live 1v1 challenge over Socket.io
    if (socket) {
        socket.emit('send_1v1_challenge', {
            fromPlayer: {
                username: gameState.username,
                avatar: '👤',
                level: gameState.level
            },
            toPlayerId: friend.id,
            friendName: friend.name
        });
    }
}

// ----------------------------------------------------
// Referral System: Dynamic Link Generation & Automatic Detection
// ----------------------------------------------------
function getReferralShareUrl() {
    const code = gameState.referralCode || 'CRIC-JOIN-100';
    return `${window.location.origin}${window.location.pathname}?ref=${code}`;
}

// WhatsApp Referral Share Click
document.getElementById('inviteWaBtn')?.addEventListener('click', () => {
    const shareUrl = getReferralShareUrl();
    const shareText = `🏏 Play Cricket League with me and get 1,500 FREE Coins instantly! Tap link to claim: ${shareUrl}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

    try {
        navigator.clipboard.writeText(shareUrl);
    } catch (e) { }

    window.open(waUrl, '_blank');
    alert(`🔗 WhatsApp Referral Link Generated!\n\n${shareUrl}\n\n(Copied to clipboard! Share with friends to get 1,500 🪙 Coins each when they join!)`);
});

// Facebook Referral Share Click
document.getElementById('inviteFbBtn')?.addEventListener('click', () => {
    const shareUrl = getReferralShareUrl();
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;

    try {
        navigator.clipboard.writeText(shareUrl);
    } catch (e) { }

    window.open(fbUrl, '_blank');
    alert(`🔗 Facebook Referral Link Generated!\n\n${shareUrl}\n\n(Copied to clipboard! Share with friends to get 1,500 🪙 Coins each when they join!)`);
});

// Automatic Referral Detection on App Open (No Manual Code Entry!)
async function initReferralDetector() {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref') || params.get('referral');

    if (!refCode) return;

    // Check if this referral was already claimed locally
    if (localStorage.getItem(`claimed_ref_${refCode.toUpperCase()}`)) {
        return;
    }

    try {
        const res = await fetch(`/api/referral/verify?ref=${encodeURIComponent(refCode)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.valid) {
                // Populate Modal with detected referral details automatically
                const modal = document.getElementById('referralRewardModal');
                const inviterEl = document.getElementById('referralInviterName');
                const codeBadgeEl = document.getElementById('referralCodeBadge');

                if (inviterEl) inviterEl.textContent = data.inviterName || 'Teammate';
                if (codeBadgeEl) codeBadgeEl.textContent = data.code;

                // Show Confirmation Modal automatically
                if (modal) modal.classList.remove('hidden');

                // Bind Confirmation Claim Button
                const confirmBtn = document.getElementById('confirmReferralRewardBtn');
                if (confirmBtn) {
                    confirmBtn.onclick = async () => {
                        try {
                            const claimRes = await fetch('/api/referral/claim', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    ref: data.code,
                                    username: gameState.username,
                                    playerId: 1001
                                })
                            });

                            if (claimRes.ok) {
                                const claimData = await claimRes.json();
                                if (claimData.success) {
                                    gameState.coins += claimData.coinsAwarded || 1500;
                                    addXp(claimData.xpAwarded || 50, "Referral Welcome Bonus");
                                    updateHud();

                                    localStorage.setItem(`claimed_ref_${refCode.toUpperCase()}`, 'true');

                                    // Remove ref param from browser URL without reloading
                                    window.history.replaceState({}, document.title, window.location.pathname);

                                    modal.classList.add('hidden');
                                    alert(`🎉 +1,500 🪙 Coins Welcome Bonus Claimed! Have fun playing Cricket League!`);
                                } else {
                                    modal.classList.add('hidden');
                                    alert(claimData.message || "Referral reward already claimed.");
                                }
                            }
                        } catch (err) {
                            // Fallback local credit
                            gameState.coins += 1500;
                            addXp(50, "Referral Welcome Bonus");
                            updateHud();
                            localStorage.setItem(`claimed_ref_${refCode.toUpperCase()}`, 'true');
                            window.history.replaceState({}, document.title, window.location.pathname);
                            modal.classList.add('hidden');
                            alert(`🎉 +1,500 🪙 Coins Welcome Bonus Claimed!`);
                        }
                    };
                }

                // Dismiss Button
                document.getElementById('dismissReferralModalBtn')?.addEventListener('click', () => {
                    modal.classList.add('hidden');
                });
            }
        }
    } catch (e) {
        console.warn('Referral verification error:', e);
    }
}

// Collect and Send to all Button
document.getElementById('collectSendAllBtn')?.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/friends/collect-all', { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            gameState.coins += data.coinsAwarded || 350;
            addXp(data.xpAwarded || 25, "Collect All Gifts");
            updateHud();
        }
    } catch (e) {
        gameState.coins += 350;
        addXp(25, "Collect All Gifts");
        updateHud();
    }

    dynamicFriendsList.forEach(f => f.giftSent = true);
    const badge = document.getElementById('sendAllBadgeCount');
    if (badge) badge.style.display = 'none';

    renderActiveFriendsList();
    alert(`🎁 Collected all gifts and sent gifts to all friends! +350 🪙 Coins & +25 XP Claimed!`);
});

// Auto Sync Phone Progress to SQL DB upon login
async function syncGuestDataToSql() {
    try {
        const localSkins = JSON.parse(localStorage.getItem('unlockedBallSkins')) || ['classic'];
        const eqBall = localStorage.getItem('equippedBallId') || 'classic';

        const payload = {
            coins: gameState.coins,
            gems: gameState.gems,
            trophies: gameState.trophies,
            level: gameState.level,
            countryCode: gameState.countryCode,
            unlockedBallSkins: localSkins,
            equippedBallId: eqBall
        };

        const res = await fetch('/api/user/sync-guest-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                console.log('✅ Phone Storage backed up to SQL DB successfully!');
            }
        }
    } catch (e) {
        console.warn('Sync phone data to SQL failed:', e.message);
    }
}

// Initial startup loaders (Phone Storage First + MySQL DB Async Backup)
initUserProfileFromDb();
loadToursFromDb();
loadSquadCardsFromDb();
loadDynamicFriendsData();
initReferralDetector();
checkDailyLoginStreakOnBoot();

if (typeof window !== 'undefined') {
    window.syncGuestDataToSql = syncGuestDataToSql;
}

/* ====================================================
   FREE FIRE AAA SUITE: 
   1. Strike Battle Pass (Free Fire Elite Pass)
   2. 7-Day Daily Login Streak & Mega Box
   3. Weekend Club Wars (Dog Tags)
   4. In-Match Celebrations & Emote Wheel
   5. Custom 1v1 Room Codes
   ==================================================== */

// ----------------------------------------------------
// 1. STRIKE BATTLE PASS SYSTEM
// ----------------------------------------------------
let battlePassData = null;

async function openBattlePassScreen() {
    navigateTo('screen-battlepass');
    await loadBattlePassData();
}

async function loadBattlePassData() {
    try {
        const userId = gameState.userId || 1;
        const res = await fetch(`/api/battlepass/status?userId=${userId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                battlePassData = data;
                renderBattlePassScreen(data);
            }
        }
    } catch (e) {
        console.warn('Failed to load battlepass:', e);
    }
}

function renderBattlePassScreen(data) {
    const tierNumEl = document.getElementById('passHeroTierVal');
    const statusPill = document.getElementById('passStatusPill');
    const tokensText = document.getElementById('passTokensText');
    const progressFill = document.getElementById('passProgressFill');
    const homePassTierTag = document.getElementById('homePassTierTag');
    const upgradeBtn = document.getElementById('upgradeElitePassBtn');

    if (tierNumEl) tierNumEl.textContent = `TIER ${data.currentTier}`;
    if (homePassTierTag) homePassTierTag.textContent = `T${data.currentTier}`;
    if (statusPill) {
        statusPill.textContent = data.isPremium ? '👑 ELITE ACTIVE' : 'FREE PASS';
        statusPill.style.color = data.isPremium ? '#facc15' : '#38bdf8';
        statusPill.style.borderColor = data.isPremium ? '#facc15' : '#38bdf8';
    }
    if (upgradeBtn) {
        if (data.isPremium) {
            upgradeBtn.textContent = '👑 ELITE UNLOCKED ✓';
            upgradeBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            upgradeBtn.style.borderColor = '#34d399';
            upgradeBtn.style.cursor = 'default';
            upgradeBtn.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.4)';
        } else {
            upgradeBtn.textContent = '👑 ELITE PASS';
            upgradeBtn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
            upgradeBtn.style.borderColor = '#fde047';
            upgradeBtn.style.cursor = 'pointer';
            upgradeBtn.style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.4)';
        }
    }
    if (tokensText) tokensText.textContent = `${data.currentTokens} Pass Tokens (${data.daysRemaining}d left)`;
    if (progressFill) {
        const pct = Math.min(100, Math.round((data.currentTokens / 1500) * 100));
        progressFill.style.width = `${pct}%`;
    }

    renderBattlePassTiers(data.tiers, data.isPremium);
    renderBattlePassMissions(data.missions);
}

function renderBattlePassTiers(tiers, isPremium) {
    const list = document.getElementById('passTiersScrollList');
    if (!list) return;
    list.innerHTML = '';

    // Add Sticky Header Bar for Free vs Elite Tracks
    const headerRow = document.createElement('div');
    headerRow.className = 'pass-highway-header-row';
    headerRow.innerHTML = `
        <div class="highway-col-tag free-tag">🆓 FREE PASS</div>
        <div class="highway-col-tag spine-tag">⚡ TIER</div>
        <div class="highway-col-tag elite-tag">👑 ELITE PASS</div>
    `;
    list.appendChild(headerRow);

    tiers.forEach((t, index) => {
        const isMegaMilestone = (t.tier % 5 === 0);
        const row = document.createElement('div');
        row.className = `pass-highway-row ${isMegaMilestone ? 'mega-milestone-row' : ''} ${t.isUnlocked ? 'unlocked-row' : 'locked-row'}`;
        row.style.setProperty('--i', index);

        // Free Reward Tile
        const freeTileHtml = `
            <div class="pass-3d-tile free-tile ${t.freeClaimed ? 'claimed' : (t.canClaimFree ? 'ready-claim' : '')}">
                <div class="tile-icon-wrap">${t.freeReward.icon}</div>
                <div class="tile-reward-name">${t.freeReward.label}</div>
                <div class="tile-action-wrap">
                    ${t.freeClaimed ? `<span class="tile-claimed-badge">CLAIMED ✓</span>` :
                (t.canClaimFree ? `<button class="tile-claim-btn free-claim" onclick="claimPassReward(${t.tier}, false)">COLLECT</button>` :
                    `<span class="tile-locked-badge">🔒</span>`)}
                </div>
            </div>
        `;

        // Center Spine Node
        const spineNodeHtml = `
            <div class="pass-spine-node ${t.isUnlocked ? 'node-active' : 'node-locked'} ${isMegaMilestone ? 'node-mega' : ''}">
                <div class="spine-line top-line"></div>
                <div class="spine-shield-badge">
                    <span class="shield-num">${t.tier}</span>
                </div>
                <div class="spine-line bottom-line"></div>
            </div>
        `;

        // Elite Reward Tile
        const eliteTileHtml = `
            <div class="pass-3d-tile elite-tile ${t.premiumClaimed ? 'claimed' : (t.canClaimPremium ? 'ready-claim' : '')} ${isMegaMilestone ? 'elite-mega' : ''}">
                <div class="elite-corner-crown">👑</div>
                <div class="tile-icon-wrap elite-glow">${t.premiumReward.icon}</div>
                <div class="tile-reward-name elite-text">${t.premiumReward.label}</div>
                <div class="tile-action-wrap">
                    ${t.premiumClaimed ? `<span class="tile-claimed-badge elite-claimed">CLAIMED ✓</span>` :
                (t.canClaimPremium ? `<button class="tile-claim-btn elite-claim" onclick="claimPassReward(${t.tier}, true)">CLAIM 👑</button>` :
                    (isPremium ? `<span class="tile-locked-badge">🔒</span>` : `<button class="tile-locked-elite-btn" onclick="upgradeToElitePass()">LOCKED 👑</button>`))}
                </div>
            </div>
        `;

        row.innerHTML = freeTileHtml + spineNodeHtml + eliteTileHtml;
        list.appendChild(row);
    });
}

function renderBattlePassMissions(missions) {
    const list = document.getElementById('passMissionsList');
    if (!list) return;
    list.innerHTML = '';

    missions.forEach(m => {
        const card = document.createElement('div');
        card.className = 'mission-card';
        card.innerHTML = `
            <div>
                <div style="font-size:13px; font-weight:800; color:#fff;">${m.desc}</div>
                <div style="font-size:11px; color:#38bdf8; font-weight:600; margin-top:2px;">Progress: ${m.current} / ${m.goal} • Reward: +${m.tokens} 🎟️ Tokens</div>
            </div>
            ${m.completed ? `<span style="font-size:11px; font-weight:900; color:#10b981; padding:4px 8px; background:rgba(16,185,129,0.1); border-radius:6px;">DONE ✓</span>` : `<span style="font-size:11px; font-weight:800; color:#94a3b8;">IN PROGRESS</span>`}
        `;
        list.appendChild(card);
    });
}

window.claimPassReward = async function (tier, isPremium) {
    try {
        const res = await fetch('/api/battlepass/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: gameState.userId || 1, tier, isPremium })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            await initUserProfileFromDb();
            loadBattlePassData();
        } else {
            alert(data.message);
        }
    } catch (e) { }
};

function showMandatoryEliteLoginModal() {
    const modal = document.getElementById('elitePassLoginModal');
    if (modal) modal.classList.remove('hidden');
}

function openElitePassModal() {
    const modal = document.getElementById('elitePassPurchaseModal');
    if (!modal) return;

    const title = document.getElementById('elitePassModalTitle');
    const badge = document.getElementById('elitePassModalBadge');
    const btn = document.getElementById('confirmBuyElitePassBtn');
    const btnText = document.getElementById('confirmBuyElitePassBtnText');

    if (battlePassData && battlePassData.isPremium) {
        if (title) title.textContent = "👑 ELITE PASS ACTIVE";
        if (badge) {
            badge.textContent = "SEASON 1: VIP ACCESS ACTIVATED ✓";
            badge.style.color = "#34d399";
            badge.style.borderColor = "#10b981";
            badge.style.background = "rgba(16, 185, 129, 0.2)";
        }
        if (btn) {
            btn.style.background = "linear-gradient(135deg, #10b981, #059669)";
            btn.onclick = () => modal.classList.add('hidden');
        }
        if (btnText) btnText.textContent = "CLOSE (VIP ACTIVE ✓)";
        modal.classList.remove('hidden');
        return;
    }

    if (isCurrentPlayerGuest) {
        showMandatoryEliteLoginModal();
        return;
    }

    if (title) title.textContent = "ELITE STRIKE PASS";
    if (badge) {
        badge.textContent = "SEASON 1: STRIKE ROYALE";
        badge.style.color = "#facc15";
        badge.style.borderColor = "#facc15";
        badge.style.background = "rgba(245, 158, 11, 0.2)";
    }
    if (btn) {
        btn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        btn.onclick = executeElitePassPurchase;
    }
    if (btnText) btnText.textContent = "👑 UNLOCK FOR 500 💎 GEMS";
    modal.classList.remove('hidden');
}

async function executeElitePassPurchase() {
    try {
        const res = await fetch('/api/battlepass/upgrade-premium', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: gameState.userId || 1 })
        });
        const data = await res.json();
        if (data.requireLogin || data.isGuest) {
            document.getElementById('elitePassPurchaseModal')?.classList.add('hidden');
            showMandatoryEliteLoginModal();
            return;
        }
        if (data.success) {
            document.getElementById('elitePassPurchaseModal')?.classList.add('hidden');
            await initUserProfileFromDb();
            loadBattlePassData();
        } else {
            alert(data.message);
        }
    } catch (e) { }
}

async function upgradeToElitePass() {
    openElitePassModal();
}

// Battle Pass Event Listeners
document.getElementById('homeBattlePassWidget')?.addEventListener('click', openBattlePassScreen);
document.getElementById('battlepassBackBtn')?.addEventListener('click', () => navigateTo('screen-home'));
document.getElementById('upgradeElitePassBtn')?.addEventListener('click', openElitePassModal);
document.getElementById('closeElitePassPurchaseModal')?.addEventListener('click', () => {
    document.getElementById('elitePassPurchaseModal')?.classList.add('hidden');
});

document.getElementById('closeElitePassLoginModal')?.addEventListener('click', () => {
    document.getElementById('elitePassLoginModal')?.classList.add('hidden');
});

document.getElementById('eliteModalGoogleBtn')?.addEventListener('click', async () => {
    await handleGoogleSignInTrigger();
    document.getElementById('elitePassLoginModal')?.classList.add('hidden');
    isCurrentPlayerGuest = false;
    setTimeout(() => openElitePassModal(), 400);
});

document.getElementById('eliteModalFacebookBtn')?.addEventListener('click', async () => {
    await handleFacebookSignInTrigger();
    document.getElementById('elitePassLoginModal')?.classList.add('hidden');
    isCurrentPlayerGuest = false;
    setTimeout(() => upgradeToElitePass(), 400);
});

document.getElementById('tabPassTiers')?.addEventListener('click', () => {
    document.getElementById('tabPassTiers')?.classList.add('active');
    document.getElementById('tabPassMissions')?.classList.remove('active');
    document.getElementById('viewPassTiers')?.classList.remove('hidden');
    document.getElementById('viewPassMissions')?.classList.add('hidden');
});

document.getElementById('tabPassMissions')?.addEventListener('click', () => {
    document.getElementById('tabPassMissions')?.classList.add('active');
    document.getElementById('tabPassTiers')?.classList.remove('active');
    document.getElementById('viewPassMissions')?.classList.remove('hidden');
    document.getElementById('viewPassTiers')?.classList.add('hidden');
});

// ----------------------------------------------------
// 2. 7-DAY DAILY LOGIN STREAK SYSTEM
// ----------------------------------------------------
// ====================================================
// In-Game Audio Synthesizer (Crystal Celebration Chime)
// ====================================================
function playRewardChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
            gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.30, ctx.currentTime + i * 0.08 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.50);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + i * 0.08);
            osc.stop(ctx.currentTime + i * 0.08 + 0.55);
        });
    } catch (e) { }
}

// ====================================================
// High-Production Reward Celebration Dialog
// ====================================================
function showRewardCelebration({ title, subtitle, icon, amount, onCollect }) {
    const modal = document.getElementById('rewardCelebrationModal');
    if (!modal) return;

    const prizeIcon = document.getElementById('celebrationPrizeIcon');
    const titleEl = document.getElementById('celebrationTitle');
    const subtitleEl = document.getElementById('celebrationSubtitle');
    const valEl = document.getElementById('celebrationRewardVal');
    const confettiWrap = document.getElementById('celebrationConfettiWrap');
    const collectBtn = document.getElementById('celebrationCollectBtn');

    if (prizeIcon) prizeIcon.textContent = icon || '🪙';
    if (titleEl) titleEl.textContent = title || 'REWARD UNLOCKED!';
    if (subtitleEl) subtitleEl.textContent = subtitle || 'Daily Login Streak Bonus';
    if (valEl) valEl.textContent = amount || '+500 COINS';

    playRewardChime();

    // Spawn 24 floating festive confetti pieces
    if (confettiWrap) {
        confettiWrap.innerHTML = '';
        const emojis = ['✨', '🪙', '⭐', '🎉', '💎', '⚡'];
        for (let i = 0; i < 22; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.textContent = emojis[i % emojis.length];
            const startX = 50 + (Math.random() * 20 - 10);
            const startY = 45 + (Math.random() * 20 - 10);
            const angle = Math.random() * Math.PI * 2;
            const dist = 70 + Math.random() * 120;
            const dx = Math.cos(angle) * dist + 'px';
            const dy = Math.sin(angle) * dist + 'px';
            const rot = (Math.random() * 720 - 360) + 'deg';
            piece.style.left = startX + '%';
            piece.style.top = startY + '%';
            piece.style.setProperty('--dx', dx);
            piece.style.setProperty('--dy', dy);
            piece.style.setProperty('--rot', rot);
            piece.style.animationDelay = (Math.random() * 0.2) + 's';
            confettiWrap.appendChild(piece);
        }
    }

    modal.classList.remove('hidden');

    const handleCollect = () => {
        modal.classList.add('hidden');
        if (collectBtn) collectBtn.onclick = null;
        if (typeof onCollect === 'function') onCollect();
    };

    if (collectBtn) {
        collectBtn.onclick = handleCollect;
    }
}

// ====================================================
// Floating In-Game Toast Notification System
// ====================================================
function showGameToast(message, icon = 'ℹ️', duration = 2800) {
    const container = document.getElementById('gameToastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'game-toast';
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-text">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 260);
    }, duration);
}

// ====================================================
// Custom In-Game Game Notice Modal (Replaces browser alert)
// ====================================================
function showGameNotice(message, title = 'CRICKET LEAGUE', icon = '🏏') {
    const modal = document.getElementById('gameNoticeModal');
    if (!modal) return;

    const iconEl = document.getElementById('gameNoticeIcon');
    const titleEl = document.getElementById('gameNoticeTitle');
    const msgEl = document.getElementById('gameNoticeMessage');
    const okBtn = document.getElementById('gameNoticeOkBtn');
    const closeBtn = document.getElementById('closeGameNoticeModal');

    let finalIcon = icon;
    let finalMsg = message || '';

    // Auto-detect emoji at beginning if present
    const matchEmoji = finalMsg.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
    if (matchEmoji) {
        finalIcon = matchEmoji[0];
        finalMsg = finalMsg.replace(matchEmoji[0], '').trim();
    }

    if (iconEl) iconEl.textContent = finalIcon;
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = finalMsg;

    modal.classList.remove('hidden');

    const dismiss = () => {
        modal.classList.add('hidden');
    };

    if (okBtn) okBtn.onclick = dismiss;
    if (closeBtn) closeBtn.onclick = dismiss;
}

// Override window.alert globally across the game
window.alert = function (message) {
    showGameNotice(message, 'CRICKET LEAGUE', '🏏');
};

// ====================================================
// 7-Day Login Streak Logic & Handlers
// ====================================================
let dailyStreakData = null;

async function checkDailyLoginStreakOnBoot() {
    try {
        const userId = gameState.userId || 1;
        const res = await fetch(`/api/dailystreak/status?userId=${userId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                dailyStreakData = data;
                const badge = document.getElementById('homeStreakBadge');
                if (badge) badge.style.display = data.canClaimToday ? 'block' : 'none';

                // If reward is ready today, auto-open streak calendar modal
                if (data.canClaimToday) {
                    setTimeout(() => openDailyStreakModal(), 600);
                }
            }
        }
    } catch (e) { }
}

function getSecondsUntilMidnight() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

async function openDailyStreakModal() {
    const modal = document.getElementById('dailyStreakModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    startStreakCountdownTicker(getSecondsUntilMidnight());

    try {
        const userId = gameState.userId || 1;
        const res = await fetch(`/api/dailystreak/status?userId=${userId}`);
        if (res.ok) {
            const data = await res.json();
            dailyStreakData = data;
            renderDailyStreakCalendar(data.calendar, data.canClaimToday, data.secondsUntilMidnight || getSecondsUntilMidnight());
        }
    } catch (e) { }
}

let streakMidnightTimerInterval = null;

function startStreakCountdownTicker(secondsLeft) {
    if (streakMidnightTimerInterval) clearInterval(streakMidnightTimerInterval);
    let remaining = Math.max(0, secondsLeft || getSecondsUntilMidnight());

    const updateLabel = () => {
        if (remaining <= 0) {
            const el = document.getElementById('streakCountdownVal');
            if (el) el.textContent = "00:00:00 (READY! ⚡)";
            const btnText = document.getElementById('claimDailyStreakBtnText');
            if (btnText) btnText.textContent = "⚡ COLLECT TODAY'S BONUS";
            const btn = document.getElementById('claimDailyStreakBtn');
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.classList.add('ready-pulse');
            }
            checkDailyLoginStreakOnBoot();
            return;
        }

        const hrs = Math.floor(remaining / 3600);
        const mins = Math.floor((remaining % 3600) / 60);
        const secs = remaining % 60;
        const timeStr = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        const el = document.getElementById('streakCountdownVal');
        if (el) el.textContent = timeStr;

        remaining--;
    };

    updateLabel();
    streakMidnightTimerInterval = setInterval(updateLabel, 1000);
}

function renderDailyStreakCalendar(calendar, canClaimToday, secondsUntilMidnight) {
    const container = document.getElementById('streakGridCalendar');
    const claimBtn = document.getElementById('claimDailyStreakBtn');
    const claimBtnText = document.getElementById('claimDailyStreakBtnText');
    const flameBadge = document.getElementById('streakFlameBadge');
    if (!container) return;
    container.innerHTML = '';

    startStreakCountdownTicker(secondsUntilMidnight || getSecondsUntilMidnight());

    // Update streak flame tag
    const claimedCount = calendar.filter(d => d.isClaimed).length;
    const currentStreakVal = Math.max(1, claimedCount);
    if (flameBadge) {
        flameBadge.textContent = `🔥 STREAK: ${currentStreakVal} DAY${currentStreakVal > 1 ? 'S' : ''}`;
    }

    // Days 1 to 6 in a 3-column top grid
    const topGrid = document.createElement('div');
    topGrid.className = 'compact-days-subgrid';

    calendar.filter(d => !d.isMega).forEach((d, idx) => {
        const card = document.createElement('div');
        card.className = `compact-day-card ${d.isToday ? 'active-today' : ''} ${d.isClaimed ? 'claimed' : ''} ${d.isLocked ? 'locked' : ''}`;
        card.style.setProperty('--c-idx', idx);

        card.innerHTML = `
            <div class="c-card-header">
                <span class="c-day-num">DAY ${d.day}</span>
                ${d.isToday && !d.isClaimed ? `<span class="c-today-dot">⚡</span>` : (d.isLocked ? `<span style="font-size:10px; opacity:0.6;">🔒</span>` : '')}
            </div>
            <div class="c-icon-box">
                <span class="c-icon">${d.icon}</span>
                ${d.isClaimed ? `<span class="c-check-badge">✓</span>` : ''}
            </div>
            <div class="c-reward-pill">${d.pill || d.label}</div>
        `;

        // Card Click Protection with sleek game toasts
        card.addEventListener('click', () => {
            if (d.isClaimed) {
                showGameToast(`Day ${d.day} reward already claimed! Next unlocks at midnight ⏳`, '✓');
            } else if (d.isLocked) {
                showGameToast(`Day ${d.day} is locked! Unlocks after claiming Day ${d.day - 1} at 12:00 AM.`, '🔒');
            } else if (d.isToday) {
                if (canClaimToday) {
                    claimDailyStreakReward();
                } else {
                    showGameToast(`You've already claimed today's bonus! Next day unlocks at 12:00 AM.`, '⏳');
                }
            }
        });

        topGrid.appendChild(card);
    });
    container.appendChild(topGrid);

    // Day 7 Mega Ribbon at the bottom
    const day7 = calendar.find(d => d.isMega) || calendar[6];
    if (day7) {
        const megaCard = document.createElement('div');
        megaCard.className = `compact-mega-ribbon ${day7.isToday ? 'active-today' : ''} ${day7.isClaimed ? 'claimed' : ''} ${day7.isLocked ? 'locked' : ''}`;
        megaCard.innerHTML = `
            <div class="mega-ribbon-left">
                <span class="mega-trophy-icon">🏆</span>
                <div>
                    <div class="mega-ribbon-title">DAY 7 MEGA VAULT</div>
                    <div class="mega-ribbon-sub">${day7.isLocked ? '🔒 Unlocks on Day 7' : 'Weekly Milestone!'}</div>
                </div>
            </div>
            <div class="mega-ribbon-rewards">
                <span class="mega-pill-tag gold">🪙 5,000</span>
                <span class="mega-pill-tag cyan">💎 ${day7.gems || 25}</span>
                <span class="mega-pill-tag purple">⚡ Ball</span>
                ${day7.isClaimed ? `<span class="mega-check-badge">✓ CLAIMED</span>` : ''}
            </div>
        `;

        megaCard.addEventListener('click', () => {
            if (day7.isClaimed) {
                showGameToast(`Day 7 Mega Vault already claimed!`, '✓');
            } else if (day7.isLocked) {
                showGameToast(`Day 7 Mega Vault is locked! Reach Day 7 streak to unlock.`, '🏆');
            } else if (day7.isToday && canClaimToday) {
                claimDailyStreakReward();
            }
        });

        container.appendChild(megaCard);
    }

    const todayObj = calendar.find(d => d.isToday) || calendar[0];
    const todayBonusText = todayObj.pill || todayObj.label;

    if (claimBtn) {
        claimBtn.disabled = !canClaimToday;
        if (claimBtnText) {
            claimBtnText.textContent = canClaimToday ? `⚡ COLLECT DAY ${todayObj.day} (${todayBonusText})` : `✓ CLAIMED TODAY • RESETS 12:00 AM`;
        }
        claimBtn.style.opacity = canClaimToday ? '1' : '0.75';
        claimBtn.classList.toggle('ready-pulse', canClaimToday);
    }
}

async function claimDailyStreakReward() {
    try {
        const userId = gameState.userId || 1;
        const res = await fetch('/api/dailystreak/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        const data = await res.json();
        if (data.success) {
            if (data.coins !== undefined) gameState.coins = data.coins;
            if (data.gems !== undefined) gameState.gems = data.gems;
            updateHud();

            const rawMsg = data.message || '+500 Coins Collected';
            const amountMatch = rawMsg.match(/(\+\d[\d,]*\s*(?:Coins|Gems)?)/i);
            const amountStr = amountMatch ? amountMatch[1].trim() : '+500 COINS';

            // Show celebratory reward popup with fanfare
            showRewardCelebration({
                title: 'BONUS COLLECTED! 🎉',
                subtitle: 'Daily Login Streak Reward',
                icon: amountStr.toLowerCase().includes('gem') ? '💎' : '🪙',
                amount: amountStr,
                onCollect: () => {
                    openDailyStreakModal();
                }
            });

            const badge = document.getElementById('homeStreakBadge');
            if (badge) badge.style.display = 'none';
        } else {
            showGameToast(data.message || 'Could not claim bonus', '⚠️');
        }
    } catch (e) {
        showGameToast('Network error, please retry', '⚠️');
    }
}

document.getElementById('homeDailyStreakWidget')?.addEventListener('click', openDailyStreakModal);
document.getElementById('closeDailyStreakModal')?.addEventListener('click', () => {
    document.getElementById('dailyStreakModal')?.classList.add('hidden');
    if (streakMidnightTimerInterval) clearInterval(streakMidnightTimerInterval);
});
document.getElementById('claimDailyStreakBtn')?.addEventListener('click', claimDailyStreakReward);
document.getElementById('dailyStreakModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'dailyStreakModal') {
        e.target.classList.add('hidden');
        if (streakMidnightTimerInterval) clearInterval(streakMidnightTimerInterval);
    }
});

document.getElementById('copyRoomPinBtn')?.addEventListener('click', () => {
    const pin = document.getElementById('createdRoomCodeVal')?.textContent;
    if (pin) {
        if (navigator.clipboard) navigator.clipboard.writeText(pin);
        alert(`📋 Room PIN #${pin} copied to clipboard! Share with your friend.`);
    }
});

// ----------------------------------------------------
// 3. WEEKEND CLUB WARS & DOG TAGS SYSTEM
// ----------------------------------------------------
function switchClubSubView(viewId, tabId) {
    const allViews = ['clubViewChat', 'clubViewRoster', 'clubViewWars', 'clubViewRequests', 'clubViewChest', 'clubViewBrowse'];
    const allTabs = ['clubTabChat', 'clubTabRoster', 'clubTabWars', 'clubTabRequests', 'clubTabChest', 'clubTabBrowse'];

    allViews.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.toggle('hidden', v !== viewId);
    });

    allTabs.forEach(t => {
        const el = document.getElementById(t);
        if (el) el.classList.toggle('active', t === tabId);
    });

    if (viewId === 'clubViewWars') {
        loadClubWarsData();
    }
}

document.getElementById('clubTabChat')?.addEventListener('click', () => switchClubSubView('clubViewChat', 'clubTabChat'));
document.getElementById('clubTabRoster')?.addEventListener('click', () => switchClubSubView('clubViewRoster', 'clubTabRoster'));
document.getElementById('clubTabWars')?.addEventListener('click', () => switchClubSubView('clubViewWars', 'clubTabWars'));
document.getElementById('clubTabRequests')?.addEventListener('click', () => switchClubSubView('clubViewRequests', 'clubTabRequests'));
document.getElementById('clubTabChest')?.addEventListener('click', () => switchClubSubView('clubViewChest', 'clubTabChest'));
document.getElementById('clubTabBrowse')?.addEventListener('click', () => switchClubSubView('clubViewBrowse', 'clubTabBrowse'));

async function loadClubWarsData() {
    try {
        const res = await fetch(`/api/clubwars/status?userId=${gameState.userId || 1}`);
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                renderClubWarsScreen(data);
            }
        }
    } catch (e) { }
}

function renderClubWarsScreen(data) {
    const tagsVal = document.getElementById('myClubDogTagsVal');
    const timerVal = document.getElementById('clubWarTimer');
    const list = document.getElementById('clubWarLeaderboardList');

    if (timerVal) timerVal.textContent = `${data.timeRemaining} left`;
    if (tagsVal && data.myClubWarInfo) {
        tagsVal.textContent = `${data.myClubWarInfo.club_dog_tags || 0} 🎖️`;
    }

    if (list && data.leaderboard) {
        list.innerHTML = '';
        data.leaderboard.forEach((c, idx) => {
            const row = document.createElement('div');
            row.className = 'war-club-item';
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:900; color:${idx < 3 ? '#facc15' : '#94a3b8'}; font-size:13px;">#${idx + 1}</span>
                    <span style="font-size:18px;">${c.badge_icon || '🛡️'}</span>
                    <div>
                        <div style="font-weight:800; color:#fff; font-size:13px;">${c.club_name}</div>
                        <div style="font-size:10px; color:#94a3b8;">👥 ${c.member_count}/50 Members</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <span style="font-size:13px; font-weight:900; color:#facc15;">${(c.dog_tags || 0).toLocaleString()} 🎖️</span>
                    <div style="font-size:9px; color:#fda4af; font-weight:700;">GLORY PTS</div>
                </div>
            `;
            list.appendChild(row);
        });
    }
}

// ----------------------------------------------------
// 4. IN-MATCH CELEBRATIONS & EMOTE WHEEL SYSTEM
// ----------------------------------------------------
document.getElementById('matchEmoteBtn')?.addEventListener('click', () => {
    document.getElementById('matchEmoteWheelOverlay')?.classList.remove('hidden');
});

document.getElementById('closeEmoteWheelBtn')?.addEventListener('click', () => {
    document.getElementById('matchEmoteWheelOverlay')?.classList.add('hidden');
});

document.querySelectorAll('.emote-wheel-node').forEach(node => {
    node.addEventListener('click', () => {
        const emoteId = node.dataset.id;
        const emoteIcon = node.dataset.icon;
        const emoteLabel = node.dataset.label;

        document.getElementById('matchEmoteWheelOverlay')?.classList.add('hidden');
        sendMatchEmote(emoteId, emoteIcon, emoteLabel);
    });
});

function sendMatchEmote(emoteId, emoteIcon, emoteLabel) {
    playEmoteAnimationOnField(emoteIcon, emoteLabel, "You");

    if (typeof socket !== 'undefined' && socket && currentMatchRoomName) {
        socket.emit('send_match_emote', {
            roomName: currentMatchRoomName,
            emoteId,
            emoteIcon,
            emoteLabel,
            senderName: gameState.username || 'Player'
        });
    }
}

function playEmoteAnimationOnField(icon, label, author) {
    const bubble = document.getElementById('matchEmoteBubble');
    if (!bubble) return;

    bubble.innerHTML = `<span style="font-size:24px;">${icon}</span> <span><strong>${author}:</strong> ${label}</span>`;
    bubble.classList.remove('hidden');

    setTimeout(() => {
        bubble.classList.add('hidden');
    }, 2800);
}

// Socket listener for opponent emote
if (typeof socket !== 'undefined' && socket) {
    socket.on('match_emote_received', (data) => {
        if (data.senderSocketId !== socket.id) {
            playEmoteAnimationOnField(data.emoteIcon, data.emoteLabel, data.senderName);
        }
    });
}

// ----------------------------------------------------
// 5. CUSTOM 1V1 ROOM CODES (PRIVATE DUELS)
// ----------------------------------------------------
let customRoomPollTimer = null;

function openCustomRoomModal() {
    const modal = document.getElementById('customRoomModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('roomCreatedBox')?.classList.add('hidden');
    }
}

document.getElementById('homeCustomRoomWidget')?.addEventListener('click', openCustomRoomModal);
document.getElementById('closeCustomRoomModal')?.addEventListener('click', () => {
    document.getElementById('customRoomModal')?.classList.add('hidden');
    if (customRoomPollTimer) clearInterval(customRoomPollTimer);
});

document.getElementById('btnCreateCustomRoom')?.addEventListener('click', async () => {
    const stadium = document.getElementById('customRoomStadiumSelect')?.value || 'Adelaide Oval';
    try {
        const res = await fetch('/api/rooms/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hostUserId: gameState.userId || 1,
                hostUsername: gameState.username || 'Player',
                stadium
            })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('roomCreatedBox')?.classList.remove('hidden');
            const codeStr = String(data.roomCode || '0000');
            const digits = codeStr.split('');
            const d1 = document.getElementById('pinDigit1'); if (d1) d1.textContent = digits[0] || '0';
            const d2 = document.getElementById('pinDigit2'); if (d2) d2.textContent = digits[1] || '0';
            const d3 = document.getElementById('pinDigit3'); if (d3) d3.textContent = digits[2] || '0';
            const d4 = document.getElementById('pinDigit4'); if (d4) d4.textContent = digits[3] || '0';
            const codeVal = document.getElementById('createdRoomCodeVal'); if (codeVal) codeVal.textContent = codeStr;

            // Poll for opponent joining
            if (customRoomPollTimer) clearInterval(customRoomPollTimer);
            customRoomPollTimer = setInterval(async () => {
                const checkRes = await (await fetch(`/api/rooms/status?code=${data.roomCode}`)).json();
                if (checkRes.success && checkRes.status === 'PLAYING') {
                    clearInterval(customRoomPollTimer);
                    document.getElementById('customRoomModal')?.classList.add('hidden');
                    startMatchmaking(data.stadium, 0, 'custom');
                }
            }, 2000);
        }
    } catch (e) { }
});

document.getElementById('btnJoinCustomRoom')?.addEventListener('click', async () => {
    const code = document.getElementById('joinRoomCodeInput')?.value;
    if (!code || code.length < 4) {
        alert("Please enter a valid 4-digit room code!");
        return;
    }

    try {
        const res = await fetch('/api/rooms/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                guestUserId: gameState.userId || 1,
                guestUsername: gameState.username || 'Player',
                roomCode: code
            })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('customRoomModal')?.classList.add('hidden');
            startMatchmaking(data.stadium || 'Adelaide Oval', 0, 'custom');
        } else {
            alert(data.message);
        }
    } catch (e) { }
});

// Custom Glass Stadium Dropdown Logic
const dropdownTrigger = document.getElementById('customStadiumDropdownTrigger');
const dropdownMenu = document.getElementById('customStadiumDropdownMenu');
const stadiumSelect = document.getElementById('customRoomStadiumSelect');
const selectedLabel = document.getElementById('customStadiumSelectedLabel');

dropdownTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu?.classList.toggle('hidden');
    dropdownTrigger?.classList.toggle('open');
});

document.querySelectorAll('#customStadiumDropdownMenu .dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = item.dataset.value;
        const text = item.querySelector('span')?.textContent;

        if (stadiumSelect) stadiumSelect.value = val;
        if (selectedLabel) selectedLabel.textContent = text;

        document.querySelectorAll('#customStadiumDropdownMenu .dropdown-item').forEach(i => {
            i.classList.remove('selected');
            const check = i.querySelector('.item-check');
            if (check) check.textContent = '';
        });

        item.classList.add('selected');
        const activeCheck = item.querySelector('.item-check');
        if (activeCheck) activeCheck.textContent = '✓';

        dropdownMenu?.classList.add('hidden');
        dropdownTrigger?.classList.remove('open');
    });
});

// Close custom dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('#customStadiumDropdownWrap')) {
        dropdownMenu?.classList.add('hidden');
        dropdownTrigger?.classList.remove('open');
    }
});

// Copy Room PIN
document.getElementById('copyRoomPinBtn')?.addEventListener('click', () => {
    const d1 = document.getElementById('pinDigit1')?.textContent || '';
    const d2 = document.getElementById('pinDigit2')?.textContent || '';
    const d3 = document.getElementById('pinDigit3')?.textContent || '';
    const d4 = document.getElementById('pinDigit4')?.textContent || '';
    const code = `${d1}${d2}${d3}${d4}`.trim() || document.getElementById('createdRoomCodeVal')?.textContent;
    if (code) {
        if (navigator.clipboard) navigator.clipboard.writeText(code);
        const btn = document.getElementById('copyRoomPinBtn');
        if (btn) {
            btn.textContent = 'COPIED ✓';
            setTimeout(() => { btn.textContent = '📋 Copy Code'; }, 2000);
        }
    }
});

// ----------------------------------------------------
// 6. 3-DAY ENTERPRISE LUCKY SPIN & WIN SYSTEM
// ----------------------------------------------------
let spinWheelData = null;
let isSpinningWheel = false;
let currentWheelRotation = 0;
let spinCountdownInterval = null;

const DEFAULT_SPIN_PRIZES = [
    { id: 0, label: '1,000', type: 'coins', amount: 1000, icon: '🪙', color: '#0284c7' },
    { id: 1, label: '15 Gems', type: 'gems', amount: 15, icon: '💎', color: '#10b981' },
    { id: 2, label: 'Elite Pack', type: 'pack', name: 'Elite Pack', icon: '🎁', color: '#8b5cf6' },
    { id: 3, label: '2,500', type: 'coins', amount: 2500, icon: '🪙', color: '#f59e0b' },
    { id: 4, label: '50 Mega', type: 'gems', amount: 50, icon: '💎', color: '#06b6d4' },
    { id: 5, label: 'Neon Ball', type: 'skin', name: 'Neon Thunderball ⚡', icon: '⚡', color: '#3b82f6' },
    { id: 6, label: '5,000', type: 'coins', amount: 5000, icon: '🪙', color: '#eab308' },
    { id: 7, label: 'JACKPOT', type: 'gems', amount: 100, icon: '🏆', color: '#f43f5e' }
];

async function checkSpinStatusOnBoot() {
    try {
        const userId = gameState.userId || 1;
        const res = await fetch(`/api/spin/status?userId=${userId}`);
        if (res.ok) {
            const data = await res.json();
            spinWheelData = data;
            updateSpinWidgetBadge(data.canSpinFree, data.remainingMs);
        }
    } catch (e) { }
}

function updateSpinWidgetBadge(canSpinFree, remainingMs) {
    const badge = document.getElementById('spinWidgetBadge');
    if (!badge) return;

    if (canSpinFree) {
        badge.textContent = 'FREE';
        badge.className = 'widget-badge-count green-badge';
        badge.style.animation = 'claimPulse 1.5s infinite';
    } else {
        const totalHours = Math.floor(remainingMs / (1000 * 60 * 60));
        const days = Math.floor(totalHours / 24);
        const hours = totalHours % 24;
        badge.textContent = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
        badge.className = 'widget-badge-count orange-badge';
        badge.style.animation = 'none';
    }
}

async function openSpinWinModal() {
    const modal = document.getElementById('spinWinModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    drawSpinWheel(DEFAULT_SPIN_PRIZES);

    try {
        const userId = gameState.userId || 1;
        const res = await fetch(`/api/spin/status?userId=${userId}`);
        if (res.ok) {
            const data = await res.json();
            spinWheelData = data;
            renderSpinWheelModalState(data);
        }
    } catch (e) {
        renderSpinWheelModalState({ canSpinFree: true, remainingMs: 0 });
    }
}

function renderSpinWheelModalState(data) {
    const spinBtn = document.getElementById('btnSpinWheel');
    const spinBtnSub = document.getElementById('spinBtnSub');
    const countdownLabel = document.getElementById('spinCountdownVal');
    const gemReSpinBtn = document.getElementById('btnGemReSpin');
    const headerTimerText = document.getElementById('spinHeaderTimerText');

    if (data.canSpinFree) {
        if (spinBtn) {
            spinBtn.classList.remove('disabled');
            spinBtn.disabled = false;
        }
        if (spinBtnSub) spinBtnSub.textContent = 'FREE';
        if (countdownLabel) countdownLabel.textContent = 'FREE SPIN READY! 🎁';
        if (gemReSpinBtn) gemReSpinBtn.classList.add('hidden');
        if (headerTimerText) headerTimerText.textContent = 'Free Spin Unlocked!';
        if (spinCountdownInterval) clearInterval(spinCountdownInterval);
    } else {
        if (spinBtn) {
            spinBtn.classList.add('disabled');
            spinBtn.disabled = true;
        }
        if (spinBtnSub) spinBtnSub.textContent = 'COOLDOWN';
        if (gemReSpinBtn) gemReSpinBtn.classList.remove('hidden');
        startSpinCooldownTicker(data.remainingMs);
    }

    updateSpinWidgetBadge(data.canSpinFree, data.remainingMs);
}

function startSpinCooldownTicker(remainingMs) {
    if (spinCountdownInterval) clearInterval(spinCountdownInterval);
    let ms = Math.max(0, remainingMs);

    const update = () => {
        if (ms <= 0) {
            clearInterval(spinCountdownInterval);
            renderSpinWheelModalState({ canSpinFree: true, remainingMs: 0 });
            return;
        }

        const totalSecs = Math.floor(ms / 1000);
        const days = Math.floor(totalSecs / 86400);
        const hrs = Math.floor((totalSecs % 86400) / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;

        const timeStr = `${days}d ${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;

        const countdownLabel = document.getElementById('spinCountdownVal');
        if (countdownLabel) countdownLabel.textContent = `Resets in: ${timeStr}`;

        const headerTimerText = document.getElementById('spinHeaderTimerText');
        if (headerTimerText) headerTimerText.textContent = `Cooldown: ${days}d ${hrs}h left`;

        ms -= 1000;
    };

    update();
    spinCountdownInterval = setInterval(update, 1000);
}

function drawSpinWheel(prizes) {
    const canvas = document.getElementById('spinWheelCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const center = width / 2;
    const radius = center - 6;
    const numSlices = prizes.length;
    const sliceAngle = (2 * Math.PI) / numSlices;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Slices
    prizes.forEach((prize, i) => {
        const startAngle = i * sliceAngle;
        const endAngle = startAngle + sliceAngle;
        const midAngle = startAngle + sliceAngle / 2;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, startAngle, endAngle);
        ctx.closePath();

        // High-Gloss Radial Gradients
        const grad = ctx.createRadialGradient(center, center, 25, center, center, radius);
        if (i % 2 === 0) {
            grad.addColorStop(0, '#0a1128');
            grad.addColorStop(0.4, prize.color);
            grad.addColorStop(1, '#020617');
        } else {
            grad.addColorStop(0, '#111827');
            grad.addColorStop(0.5, prize.color);
            grad.addColorStop(1, '#030712');
        }

        ctx.fillStyle = grad;
        ctx.fill();

        // Golden sector divider line
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
        ctx.stroke();

        // 2. Draw Icon & Label along radial spoke
        ctx.translate(center, center);
        ctx.rotate(midAngle);

        // Icon near outer rim
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;
        ctx.fillText(prize.icon, radius * 0.76, 0);

        // Label text along spoke
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 10px Montserrat, sans-serif';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(prize.label, radius * 0.44, 0);

        ctx.restore();
    });

    // 3. Outer Polished Bezel Ring
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#f59e0b';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.6)';
    ctx.shadowBlur = 10;
    ctx.stroke();
}

async function triggerSpinWheelRoll(useGems = false) {
    if (isSpinningWheel) return;

    try {
        isSpinningWheel = true;
        const spinBtn = document.getElementById('btnSpinWheel');
        if (spinBtn) spinBtn.disabled = true;

        const userId = gameState.userId || 1;
        const res = await fetch('/api/spin/roll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, useGems })
        });

        const data = await res.json();
        if (!data.success) {
            alert(data.message);
            isSpinningWheel = false;
            if (spinBtn) spinBtn.disabled = false;
            return;
        }

        // Animate Wheel Rotation to land precisely on the winning wedge
        const winningIndex = data.winningIndex;
        const numSlices = 8;
        const sliceDeg = 360 / numSlices; // 45 deg per slice

        // Center of winning wedge in degrees from 0 (3 o'clock):
        const wedgeCenterDeg = (winningIndex * sliceDeg) + (sliceDeg / 2);

        // To bring this wedge under the top pointer (at 270 deg / 12 o'clock):
        const normalizedCurrent = currentWheelRotation % 360;
        const targetOffset = (270 - wedgeCenterDeg + 360) % 360;
        const delta = (targetOffset - normalizedCurrent + 360) % 360;
        const fullRotations = 360 * 6; // 6 full spins

        currentWheelRotation += fullRotations + delta;

        const canvas = document.getElementById('spinWheelCanvas');
        if (canvas) {
            canvas.style.transform = `rotate(${currentWheelRotation}deg)`;
        }

        // Wait for 5s deceleration animation to finish
        setTimeout(() => {
            isSpinningWheel = false;
            if (spinBtn) spinBtn.disabled = false;

            // Show Celebration Modal
            showSpinPrizeCelebration(data.prize);

            // Update user balance & timers
            if (data.newCoins !== undefined) gameState.coins = data.newCoins;
            if (data.newGems !== undefined) gameState.gems = data.newGems;
            updateHud();

            renderSpinWheelModalState({
                canSpinFree: data.canSpinFree,
                remainingMs: data.remainingMs
            });
        }, 5200);

    } catch (e) {
        console.error(e);
        isSpinningWheel = false;
        const spinBtn = document.getElementById('btnSpinWheel');
        if (spinBtn) spinBtn.disabled = false;
    }
}

function showSpinPrizeCelebration(prize) {
    const modal = document.getElementById('spinPrizeModal');
    const iconEl = document.getElementById('spinPrizeIcon');
    const labelEl = document.getElementById('spinPrizeLabel');

    if (iconEl) iconEl.textContent = prize.icon || '🎁';
    if (labelEl) labelEl.textContent = prize.label;

    if (modal) modal.classList.remove('hidden');
}

// Event Listeners for Spin & Win
document.getElementById('spinWinWidget')?.addEventListener('click', openSpinWinModal);
document.getElementById('closeSpinWinModal')?.addEventListener('click', () => {
    document.getElementById('spinWinModal')?.classList.add('hidden');
});
document.getElementById('btnSpinWheel')?.addEventListener('click', () => {
    if (spinWheelData && !spinWheelData.canSpinFree) {
        if (confirm("⏳ Free spin is on a 3-day cooldown!\n\nWould you like to take an extra spin for 25 💎 Gems?")) {
            triggerSpinWheelRoll(true);
        }
        return;
    }
    triggerSpinWheelRoll(false);
});
document.getElementById('btnGemReSpin')?.addEventListener('click', () => triggerSpinWheelRoll(true));
document.getElementById('collectSpinPrizeBtn')?.addEventListener('click', () => {
    document.getElementById('spinPrizeModal')?.classList.add('hidden');
});

// Boot Initializer for Spin Status
checkSpinStatusOnBoot();


// Launch 3D Batsman Engine after DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(init3DBatsmanEngine, 200);
    });
} else {
    setTimeout(init3DBatsmanEngine, 200);
}

