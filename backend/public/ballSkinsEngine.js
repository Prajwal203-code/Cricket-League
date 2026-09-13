// ==========================================================
// 10 Kid-Friendly 3D Ball Skins Collection Engine
// Real Purchased Quantity Tracking (Stored in MySQL DB if logged in, Phone LocalStorage if Guest).
// TEAM -> Balls displays ONLY bought balls with their exact count (∞ ✔, x1, x2, x3, etc.).
// SHOP -> Balls displays all unbought balls with BUY 1 BALL buttons.
// ==========================================================

const KID_BALL_SKINS = [
    {
        id: 'classic',
        name: '🟤 Classic Brown Leather',
        rarity: 'common',
        type: 'Classic',
        icon: '🟤',
        glowColor: 'rgba(109, 60, 25, 0.4)',
        perk: 'Standard Control • Plain Leather',
        price: 0,
        unlocked: true
    },
    {
        id: 'fireball',
        name: '🔥 Fireball Inferno',
        rarity: 'legendary',
        type: 'Fire',
        icon: '🔥',
        glowColor: 'rgba(255, 109, 0, 0.95)',
        perk: '+15% Swing • 🔥 Fire Trail',
        price: 1000,
        unlocked: false
    },
    {
        id: 'water',
        name: '🌊 Ocean Tsunami',
        rarity: 'epic',
        type: 'Water',
        icon: '🌊',
        glowColor: 'rgba(0, 229, 255, 0.95)',
        perk: '+12% Control • 🌊 Water Waves',
        price: 1200,
        unlocked: false
    },
    {
        id: 'lightning',
        name: '⚡ Lightning Plasma',
        rarity: 'epic',
        type: 'Electric',
        icon: '⚡',
        glowColor: 'rgba(41, 121, 255, 0.95)',
        perk: '+12% Speed • ⚡ Electric Sparks',
        price: 1500,
        unlocked: false
    },
    {
        id: 'galaxy',
        name: '🌌 Galaxy Cosmic',
        rarity: 'legendary',
        type: 'Cosmic',
        icon: '🌌',
        glowColor: 'rgba(234, 128, 252, 0.95)',
        perk: '+15% Spin • ✨ Stardust Trail',
        price: 2500,
        unlocked: false
    },
    {
        id: 'gold_sun',
        name: '👑 Golden Sun King',
        rarity: 'epic',
        type: 'Gold',
        icon: '👑',
        glowColor: 'rgba(255, 238, 88, 0.95)',
        perk: '+20% Match Coins • 🪙 Gold Sparks',
        price: 3000,
        unlocked: false
    },
    {
        id: 'frostbite',
        name: '❄️ Frostbite Ice Dragon',
        rarity: 'rare',
        type: 'Ice',
        icon: '❄️',
        glowColor: 'rgba(77, 208, 225, 0.95)',
        perk: '+10% Control • ❄️ Frost Mist',
        price: 1200,
        unlocked: false
    },
    {
        id: 'rainbow',
        name: '🌈 Rainbow Disco Pop',
        rarity: 'rare',
        type: 'Party',
        icon: '🌈',
        glowColor: 'rgba(255, 255, 255, 0.95)',
        perk: '+8% All Stats • 🌈 Rainbow Trail',
        price: 1000,
        unlocked: false
    },
    {
        id: 'magma',
        name: '🌋 Lava Magma Core',
        rarity: 'epic',
        type: 'Magma',
        icon: '🌋',
        glowColor: 'rgba(255, 61, 0, 0.95)',
        perk: '+12% Power • 🌋 Magma Smoke',
        price: 2000,
        unlocked: false
    },
    {
        id: 'bomb',
        name: '💣 Comic BOOM Bomb',
        rarity: 'rare',
        type: 'Explosive',
        icon: '💣',
        glowColor: 'rgba(255, 109, 0, 0.95)',
        perk: '+10% Impact Power • 💥 Fuse Spark',
        price: 1500,
        unlocked: false
    },
    {
        id: 'cyber',
        name: '🟢 Cyber Neon Matrix',
        rarity: 'common',
        type: 'Cyber',
        icon: '🟢',
        glowColor: 'rgba(105, 240, 174, 0.95)',
        perk: '+6% Speed • 🟢 Cyber Laser',
        price: 800,
        unlocked: false
    }
];

let equippedBallId = localStorage.getItem('equippedBallId') || 'classic';
let unlockedBallSkins = JSON.parse(localStorage.getItem('unlockedBallSkins')) || ['classic'];
let ballInventory = JSON.parse(localStorage.getItem('ballInventory')) || { classic: 999999 };
let pendingPurchaseSkinId = null;

async function fetchBallCollectionFromDb() {
    try {
        const res = await fetch('/api/balls');
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                if (data.inventory) {
                    ballInventory = { ...data.inventory };
                    ballInventory['classic'] = 999999;
                }
                
                // Unlocked skins are ONLY skins with quantity > 0
                unlockedBallSkins = Object.keys(ballInventory).filter(id => id === 'classic' || (ballInventory[id] && ballInventory[id] > 0));
                equippedBallId = data.equippedBall || equippedBallId;

                if (typeof gameState !== 'undefined') {
                    gameState.coins = data.coins !== undefined ? data.coins : gameState.coins;
                    gameState.equippedBall = equippedBallId;
                    if (typeof updateHud === 'function') updateHud();
                }

                localStorage.setItem('unlockedBallSkins', JSON.stringify(unlockedBallSkins));
                localStorage.setItem('ballInventory', JSON.stringify(ballInventory));
                localStorage.setItem('equippedBallId', equippedBallId);
            }
        }
    } catch (e) {
        console.warn('Offline mode: using Phone Storage for ball skins:', e.message);
    }
}

async function initBallSkinsEngine() {
    setupModalEventListeners();
    await fetchBallCollectionFromDb();
    renderBallSkinsGrid();
    renderShopBallSkinsGrid();
}

function updateCollectionBanner() {
    const boughtTag = document.getElementById('boughtBallsCountTagInline');
    const fillBar = document.getElementById('ownedBallsProgressFillInline');

    const totalCount = KID_BALL_SKINS.length;
    const boughtCount = unlockedBallSkins.length;

    if (boughtTag) boughtTag.innerText = `${boughtCount} Available ⚽`;

    if (fillBar) {
        const pct = Math.round((boughtCount / totalCount) * 100);
        fillBar.style.width = `${pct}%`;
    }
}

// --------------------------------------------------
// 1. TEAM -> Balls View (Displays ONLY Bought Balls with Exact Count: ∞ ✔, x1, x2, x3, etc.)
// --------------------------------------------------
function renderBallSkinsGrid() {
    const grid = document.getElementById('ballSkinsGridViewInline');
    if (!grid) return;
    grid.innerHTML = '';
    grid.className = 'ball-skins-grid-view';

    updateCollectionBanner();

    // Show ONLY BOUGHT BALLS with quantity > 0 or classic
    const ownedSkins = KID_BALL_SKINS.filter(skin => skin.id === 'classic' || (ballInventory[skin.id] && ballInventory[skin.id] > 0));

    ownedSkins.forEach(skin => {
        const isInfinite = skin.id === 'classic';
        const qty = isInfinite ? '∞' : (ballInventory[skin.id] || 0);

        const card = document.createElement('div');
        card.className = `ball-skin-card ${skin.rarity}`;

        card.innerHTML = `
            <div class="skin-card-top">
                <span class="rarity-pill ${skin.rarity}">${skin.rarity}</span>
                <span class="ball-qty-badge ${isInfinite ? 'infinity-badge' : 'count-badge'}">
                    ${isInfinite ? '<span class="badge-inf">∞</span> <span class="badge-check">✔</span>' : `<span class="badge-x">x</span><span class="badge-num">${qty}</span>`}
                </span>
            </div>

            <!-- Dynamic 3D Particle Shader Canvas -->
            <div class="ball-3d-preview-wrap" style="box-shadow: 0 0 22px ${skin.glowColor}">
                <canvas class="ball-particle-canvas" id="canvas_${skin.id}"></canvas>
            </div>

            <div class="skin-title">${skin.name}</div>
            <div class="skin-perk-tag">${skin.perk}</div>

            <!-- Exact Ball Count Status Indicator -->
            <div class="card-qty-count-row">
                <span class="qty-count-text">${isInfinite ? 'Supply: <strong>∞ Unlimited</strong>' : `Available: <strong>x${qty} ${qty === 1 ? 'Ball' : 'Balls'}</strong>`}</span>
            </div>
        `;

        grid.appendChild(card);

        // Attach 3D Particle Engine
        const canvas = card.querySelector(`#canvas_${skin.id}`);
        if (canvas && typeof ballParticleEngine !== 'undefined') {
            ballParticleEngine.attachCanvas(canvas, skin.id);
        }
    });

    // Append 'WANT MORE 3D BALLS?' Premium Banner Button at bottom
    const shopCtaCard = document.createElement('div');
    shopCtaCard.className = 'shop-cta-banner-card';
    shopCtaCard.innerHTML = `
        <div class="cta-banner-glow"></div>
        <div class="cta-left">
            <div class="cta-icon-box">
                <span class="cta-main-icon">🛒</span>
                <span class="cta-sparkle">✨</span>
            </div>
            <div class="cta-text">
                <div class="cta-sub-badge">PRO BALL COLLECTION</div>
                <h4>GET MORE 3D BALLS</h4>
                <p>Unlock Fireball, Ocean, Lightning & Cosmic skins in Shop!</p>
            </div>
        </div>
        <button class="cta-shop-btn" onclick="goToShopBallsSection()">
            <span class="btn-text">GO TO SHOP</span>
            <span class="btn-arrow">➔</span>
        </button>
    `;
    grid.appendChild(shopCtaCard);
}

// --------------------------------------------------
// 2. SHOP -> 3D Ball Skins Store Section (Displays All Balls for Purchase)
// --------------------------------------------------
function renderShopBallSkinsGrid() {
    const shopGrid = document.getElementById('shopBallSkinsGrid');
    if (!shopGrid) return;
    shopGrid.innerHTML = '';

    // Show all special purchasable balls in the shop
    const purchasableSkins = KID_BALL_SKINS.filter(skin => skin.price > 0);

    purchasableSkins.forEach(skin => {
        const qty = ballInventory[skin.id] || 0;

        const card = document.createElement('div');
        card.className = `ball-skin-card ${skin.rarity} locked-shop-card`;

        card.innerHTML = `
            <div class="skin-card-top">
                <span class="rarity-pill ${skin.rarity}">${skin.rarity}</span>
                <span class="shop-price-pill">
                    <span class="price-val">${skin.price.toLocaleString()}</span>
                    <span class="coin-icon-sm">🪙</span>
                </span>
            </div>

            <!-- Dynamic 3D Particle Shader Canvas -->
            <div class="ball-3d-preview-wrap" style="box-shadow: 0 0 22px ${skin.glowColor}">
                <canvas class="ball-particle-canvas" id="canvas_shop_${skin.id}"></canvas>
            </div>

            <div class="skin-title">${skin.name}</div>
            <div class="skin-perk-tag">${skin.perk}</div>

            <div class="card-qty-count-row">
                <span class="qty-count-text ${qty > 0 ? 'has-stock' : ''}">Owned in Inventory: <strong>x${qty}</strong></span>
            </div>

            <div class="skin-action-row">
                <button class="skin-btn buy shop-buy-btn" onclick="promptBuyBallSkin('${skin.id}')">
                    <span class="buy-label">BUY 1 BALL</span>
                    <span class="buy-dot">•</span>
                    <span class="buy-cost">${skin.price.toLocaleString()} 🪙</span>
                </button>
            </div>
        `;

        shopGrid.appendChild(card);

        // Attach 3D Particle Engine
        const canvas = card.querySelector(`#canvas_shop_${skin.id}`);
        if (canvas && typeof ballParticleEngine !== 'undefined') {
            ballParticleEngine.attachCanvas(canvas, skin.id);
        }
    });
}

function goToShopBallsSection() {
    if (typeof navigateTo === 'function') navigateTo('screen-shop');
    setTimeout(() => {
        const sec = document.getElementById('shopBallSkinsSection');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
}

// --------------------------------------------------
// Modal Handlers (Confirm Purchase & No Coins Warning)
// --------------------------------------------------
function setupModalEventListeners() {
    document.getElementById('closeBallConfirmModalBtn')?.addEventListener('click', closeConfirmModal);
    document.getElementById('cancelBallPurchaseBtn')?.addEventListener('click', closeConfirmModal);
    document.getElementById('acceptBallPurchaseBtn')?.addEventListener('click', executeConfirmedPurchase);

    document.getElementById('closeNoCoinsModalBtn')?.addEventListener('click', closeNoCoinsModal);
    document.getElementById('dismissNoCoinsBtn')?.addEventListener('click', closeNoCoinsModal);
    document.getElementById('goToShopFromNoCoinsBtn')?.addEventListener('click', () => {
        closeNoCoinsModal();
        goToShopBallsSection();
    });
}

function promptBuyBallSkin(skinId) {
    const skin = KID_BALL_SKINS.find(s => s.id === skinId);
    if (!skin) return;

    const currentCoins = typeof gameState !== 'undefined' ? gameState.coins : 0;

    if (currentCoins < skin.price) {
        showNoCoinsModal(skin, currentCoins);
        return;
    }

    pendingPurchaseSkinId = skinId;
    showConfirmModal(skin, currentCoins);
}

function showConfirmModal(skin, currentCoins) {
    const modal = document.getElementById('ballPurchaseConfirmModal');
    if (!modal) return;

    const nameTag = document.getElementById('confirmBallNameTag');
    const priceTag = document.getElementById('confirmBallPriceTag');
    const priceDetail = document.getElementById('confirmPriceDetail');
    const userCoinsDetail = document.getElementById('confirmUserCoinsDetail');
    const remainingCoinsDetail = document.getElementById('confirmRemainingCoinsDetail');
    const visualBox = document.getElementById('confirmBallVisual');

    if (nameTag) nameTag.innerText = `Buy 1 ${skin.name}`;
    if (priceTag) priceTag.innerText = `${skin.price.toLocaleString()} 🪙`;
    if (priceDetail) priceDetail.innerText = `${skin.price.toLocaleString()} 🪙`;
    if (userCoinsDetail) userCoinsDetail.innerText = `${currentCoins.toLocaleString()} 🪙`;

    const remaining = Math.max(0, currentCoins - skin.price);
    if (remainingCoinsDetail) remainingCoinsDetail.innerText = `${remaining.toLocaleString()} 🪙`;

    if (visualBox) {
        visualBox.style.boxShadow = `0 0 26px ${skin.glowColor}`;
        visualBox.innerHTML = `<canvas class="ball-particle-canvas" id="canvas_confirm_${skin.id}"></canvas>`;
        const c = visualBox.querySelector('canvas');
        if (c && typeof ballParticleEngine !== 'undefined') {
            ballParticleEngine.attachCanvas(c, skin.id);
        }
    }

    modal.classList.remove('hidden');
}

function closeConfirmModal() {
    const modal = document.getElementById('ballPurchaseConfirmModal');
    if (modal) modal.classList.add('hidden');
    pendingPurchaseSkinId = null;
}

function showNoCoinsModal(skin, currentCoins) {
    const modal = document.getElementById('noCoinsModal');
    if (!modal) return;

    const targetName = document.getElementById('noCoinsTargetName');
    const reqVal = document.getElementById('noCoinsRequiredVal');
    const currVal = document.getElementById('noCoinsCurrentVal');
    const shortfallVal = document.getElementById('noCoinsShortfallVal');

    if (targetName) targetName.innerText = skin.name;
    if (reqVal) reqVal.innerText = `${skin.price.toLocaleString()} 🪙`;
    if (currVal) currVal.innerText = `${currentCoins.toLocaleString()} 🪙`;

    const shortfall = Math.max(0, skin.price - currentCoins);
    if (shortfallVal) shortfallVal.innerText = `${shortfall.toLocaleString()} 🪙`;

    modal.classList.remove('hidden');
}

function closeNoCoinsModal() {
    const modal = document.getElementById('noCoinsModal');
    if (modal) modal.classList.add('hidden');
}

async function executeConfirmedPurchase() {
    if (!pendingPurchaseSkinId) return;
    const skinId = pendingPurchaseSkinId;
    closeConfirmModal();

    const skin = KID_BALL_SKINS.find(s => s.id === skinId);
    if (!skin) return;

    try {
        const res = await fetch('/api/balls/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skinId })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                if (data.inventory) {
                    ballInventory = data.inventory;
                } else {
                    ballInventory[skinId] = (ballInventory[skinId] || 0) + 1;
                }

                unlockedBallSkins = Object.keys(ballInventory).filter(id => id === 'classic' || (ballInventory[id] && ballInventory[id] > 0));

                if (typeof gameState !== 'undefined') {
                    gameState.coins = data.coins;
                    if (typeof updateHud === 'function') updateHud();
                }

                localStorage.setItem('unlockedBallSkins', JSON.stringify(unlockedBallSkins));
                localStorage.setItem('ballInventory', JSON.stringify(ballInventory));

                renderBallSkinsGrid();
                renderShopBallSkinsGrid();

                if (typeof showToast === 'function') {
                    showToast(`🎉 1 ${skin.name} Added to Inventory! (Total: x${ballInventory[skinId]}) ⚽`);
                }
                return;
            }
        }
    } catch (e) {
        console.warn('Phone Storage fallback purchase:', e.message);
    }

    // Offline / Phone LocalStorage Fallback
    if (typeof gameState !== 'undefined') {
        gameState.coins -= skin.price;
        if (typeof updateHud === 'function') updateHud();
    }
    ballInventory[skinId] = (ballInventory[skinId] || 0) + 1;
    unlockedBallSkins = Object.keys(ballInventory).filter(id => id === 'classic' || (ballInventory[id] && ballInventory[id] > 0));
    
    localStorage.setItem('unlockedBallSkins', JSON.stringify(unlockedBallSkins));
    localStorage.setItem('ballInventory', JSON.stringify(ballInventory));
    
    renderBallSkinsGrid();
    renderShopBallSkinsGrid();
    
    if (typeof showToast === 'function') {
        showToast(`🎉 1 ${skin.name} Saved to Phone Storage! (Total: x${ballInventory[skinId]}) ⚽`);
    }
}

// Backup phone localStorage ball inventory to MySQL Database on Login
async function syncPhoneBallSkinsToSql() {
    try {
        const localInv = JSON.parse(localStorage.getItem('ballInventory')) || {};
        const res = await fetch('/api/balls/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inventory: localInv,
                equippedBall: equippedBallId
            })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                if (data.inventory) {
                    ballInventory = { ...data.inventory };
                    localStorage.setItem('ballInventory', JSON.stringify(ballInventory));
                }
                console.log('✅ Phone ball inventory backed up to MySQL DB successfully!');
            }
        }
    } catch (e) {
        console.warn('Sync phone balls to SQL failed:', e.message);
    }
}

if (typeof window !== 'undefined') {
    window.promptBuyBallSkin = promptBuyBallSkin;
    window.renderBallSkinsGrid = renderBallSkinsGrid;
    window.renderShopBallSkinsGrid = renderShopBallSkinsGrid;
    window.initBallSkinsEngine = initBallSkinsEngine;
    window.fetchBallCollectionFromDb = fetchBallCollectionFromDb;
    window.syncPhoneBallSkinsToSql = syncPhoneBallSkinsToSql;
    window.goToShopBallsSection = goToShopBallsSection;
}
