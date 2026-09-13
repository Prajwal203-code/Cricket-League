// ==========================================================
// 🏏 Cricket League — Character Studio (Onboarding + Customizer)
// ----------------------------------------------------------
// Drives the procedural 3D cricketer engine (window.Hero3DBatsman) to give the
// player a first-launch "Country → Create Player → Home" flow and a re-editable
// customizer (opened later from the ⚙️ settings button).
//
// Persistence mirrors the wallet idiom: localStorage first (offline / guest),
// plus a fire-and-forget POST /api/user/appearance to MySQL (users.character_config).
//
// Engine lifecycle: the engine is a singleton with ONE live WebGL context, so we
// move it between the home hero stage (#heroCharacterStage) and the studio preview
// stage (#characterStudioStage) with dispose() → init() → applyConfig().
//
// Mutation model: every axis change goes through patchConfig(), which deep-merges
// the change onto the *full* current config and calls Hero3DBatsman.applyConfig().
// This is the safe path because applyConfig() itself merges onto defaultConfig(),
// and there is no granular setter for bat.sticker.
// ==========================================================

(function (window) {
    'use strict';

    // ---- storage keys --------------------------------------------------
    const SAVE_KEY = 'cricket_league_character_v1';
    const ONBOARDED_KEY = 'cricket_league_onboarded_v1';

    // ---- fallback catalogues (used only if the engine isn't present) ---
    const FALLBACK_CAT = {
        SKIN_TONES: ['#f3d3b5', '#eebd97', '#d9a066', '#c98a5e', '#a86b41', '#7a4a29', '#5a3620'],
        HAIR_COLORS: ['#1a1208', '#2b1a0e', '#4a2e18', '#6b4423', '#8a6a3a', '#b8b8b8', '#e8e8e8', '#c0392b'],
        HAIR_STYLES: ['bald', 'buzz', 'short', 'spiky', 'curly', 'fade', 'swept'],
        BEARD_STYLES: ['none', 'stubble', 'boxed', 'goatee', 'full'],
        FACE_TYPES: ['oval', 'square', 'round', 'long'],
        kitFor: function () { return { base: '#1d4ed8', yoke: '#f59e0b', trim: '#eef2f8', crest: 'roundel' }; }
    };

    function defaultLocalConfig() {
        return {
            v: 1, country: 'IN',
            face: { type: 'oval', skin: '#c98a5e' },
            hair: { style: 'short', color: '#1a1208' },
            beard: { style: 'stubble', color: '#1a1208' },
            kit: { base: '#123f8c', yoke: '#ff6a1a', trim: '#eef2f8', name: 'PLAYER', number: 18, crest: 'tricolor' },
            gear: {
                headband: { on: true, color: '#123f8c' }, gloves: { on: true, color: '#eef2f8' },
                pads: { on: true, color: '#eef2f8' }, wristband: { on: true, color: '#ff6a1a' }
            },
            bat: { skin: 'willow', sticker: '#ff6a1a' }
        };
    }

    // ---- state ---------------------------------------------------------
    let studioConfig = null;         // working full config (engine cfg shape)
    let studioMode = 'edit';         // 'onboard' | 'edit'
    let engineMount = 'home';        // 'home' | 'studio' — where the singleton engine lives
    let built = false;               // lazy DOM build guard
    let countryData = null;          // cached { major:[], other:[] }
    let selectedCountry = 'IN';      // country chosen inside the studio

    // onboarding race coordination
    let splashDone = false, profileLoaded = false, onboardingDecided = false, profileTimer = null;

    // ---- small DOM helpers ---------------------------------------------
    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    function byId(id) { return document.getElementById(id); }
    function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function deepMerge(dst, src) {
        for (const k in src) {
            if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
                dst[k] = deepMerge(dst[k] && typeof dst[k] === 'object' ? dst[k] : {}, src[k]);
            } else { dst[k] = src[k]; }
        }
        return dst;
    }
    function normHex(v) {
        v = String(v || '').trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
        if (/^#[0-9a-fA-F]{3}$/.test(v)) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
        return '#123f8c';
    }
    function CAT() { return (window.Hero3DBatsman && window.Hero3DBatsman.CATALOG) || FALLBACK_CAT; }
    function kitFor(code) { return CAT().kitFor ? CAT().kitFor(code) : FALLBACK_CAT.kitFor(); }

    // ---- storage -------------------------------------------------------
    function loadSaved() {
        try { const raw = localStorage.getItem(SAVE_KEY); if (raw) return JSON.parse(raw); } catch (e) { }
        return null;
    }
    function persist(config) {
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(config)); } catch (e) { }
        try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch (e) { }
        // fire-and-forget mirror to MySQL (mirrors the wallet-save pattern)
        try {
            fetch('/api/user/appearance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: config })
            }).catch(function () { });
        } catch (e) { }
    }
    function isOnboarded() { return !!(localStorage.getItem(ONBOARDED_KEY) || loadSaved()); }

    // The single source of truth for "what the hero should look like".
    function getActiveConfig() {
        if (studioConfig) return clone(studioConfig);
        const saved = loadSaved();
        if (saved) return saved;
        if (window.Hero3DBatsman) { try { return window.Hero3DBatsman.getConfig(); } catch (e) { } }
        return defaultLocalConfig();
    }

    // Called by app.js when the profile arrives from MySQL. Server config wins
    // for a logged-in user and becomes the local source of truth.
    function applyServerConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        studioConfig = deepMerge(defaultLocalConfig(), cfg);
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(studioConfig)); } catch (e) { }
        try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch (e) { }
        if (window.Hero3DBatsman) { try { window.Hero3DBatsman.applyConfig(studioConfig); } catch (e) { } }
    }

    // ---- engine mounting (move the singleton between stages) -----------
    function mountEngine(where) {
        if (!window.Hero3DBatsman) return;
        const cfg = getActiveConfig();
        try { window.Hero3DBatsman.dispose(); } catch (e) { }
        try {
            if (where === 'studio') window.Hero3DBatsman.init('characterStudioCanvas', 'characterStudioStage');
            else window.Hero3DBatsman.init('hero3dCanvas', 'heroCharacterStage');
            window.Hero3DBatsman.applyConfig(cfg);
            engineMount = where;
        } catch (e) { console.warn('CharacterStudio: engine mount failed', e); }
    }

    // ---- core mutation -------------------------------------------------
    function patchConfig(patch) {
        const base = studioConfig ? clone(studioConfig) : getActiveConfig();
        const merged = deepMerge(base, patch);
        if (window.Hero3DBatsman) {
            try {
                window.Hero3DBatsman.applyConfig(merged);
                studioConfig = window.Hero3DBatsman.getConfig();
                return;
            } catch (e) { /* fall through to local */ }
        }
        studioConfig = merged;
    }

    // ====================================================================
    // UI building (lazy, once)
    // ====================================================================
    const TABS = [
        { id: 'country', label: '🌍 Country' },
        { id: 'face', label: '🙂 Face' },
        { id: 'skin', label: '🎨 Skin' },
        { id: 'hair', label: '💇 Hair' },
        { id: 'beard', label: '🧔 Beard' },
        { id: 'kit', label: '👕 Kit' },
        { id: 'gear', label: '🧤 Gear' },
        { id: 'bat', label: '🏏 Bat' }
    ];

    function ensureBuilt() {
        if (built) return;
        const modal = byId('characterStudioModal');
        if (!modal) { console.warn('CharacterStudio: #characterStudioModal markup missing'); return; }

        byId('csCloseBtn') && byId('csCloseBtn').addEventListener('click', function () { closeStudio(studioMode !== 'onboard'); });
        byId('csSwingBtn') && byId('csSwingBtn').addEventListener('click', function () {
            if (window.Hero3DBatsman) { try { window.Hero3DBatsman.triggerSwing(); } catch (e) { } }
        });
        byId('csCtaBtn') && byId('csCtaBtn').addEventListener('click', function () { finishStudio(); });
        byId('csOnboardNextBtn') && byId('csOnboardNextBtn').addEventListener('click', function () {
            const overlay = byId('csOnboardCountry');
            if (overlay) overlay.classList.add('hidden');
        });

        buildNameRow();
        buildTabs();
        built = true;
    }

    function buildNameRow() {
        const row = byId('csNameRow');
        if (!row) return;
        row.innerHTML = '';

        const nameWrap = el('div', 'cs-field');
        nameWrap.appendChild(el('label', 'cs-field-label', 'Player Name'));
        const nameInp = el('input', 'cs-text-input');
        nameInp.type = 'text'; nameInp.maxLength = 14; nameInp.id = 'csNameInput';
        nameInp.placeholder = 'PLAYER';
        nameInp.addEventListener('input', function () {
            const val = nameInp.value.toUpperCase().slice(0, 14) || 'PLAYER';
            patchConfig({ kit: { name: val } });
        });
        nameWrap.appendChild(nameInp);

        const numWrap = el('div', 'cs-field cs-field-num');
        numWrap.appendChild(el('label', 'cs-field-label', 'Jersey #'));
        const numInp = el('input', 'cs-num-input');
        numInp.type = 'number'; numInp.min = '0'; numInp.max = '99'; numInp.id = 'csNumberInput';
        numInp.addEventListener('input', function () {
            let n = parseInt(numInp.value, 10);
            if (isNaN(n)) n = 0;
            n = Math.max(0, Math.min(99, n));
            patchConfig({ kit: { number: n } });
        });
        numWrap.appendChild(numInp);

        row.appendChild(nameWrap);
        row.appendChild(numWrap);
    }

    function buildTabs() {
        const tabsEl = byId('csTabs');
        const panelsEl = byId('csPanels');
        if (!tabsEl || !panelsEl) return;
        tabsEl.innerHTML = '';
        panelsEl.innerHTML = '';

        TABS.forEach(function (t, i) {
            const btn = el('button', 'cs-tab-btn' + (i === 0 ? ' active' : ''), t.label);
            btn.dataset.tab = t.id;
            btn.addEventListener('click', function () { showTab(t.id); });
            tabsEl.appendChild(btn);

            const panel = el('div', 'cs-panel' + (i === 0 ? ' active' : ''));
            panel.id = 'csPanel_' + t.id;
            panelsEl.appendChild(panel);
        });
    }

    function showTab(id) {
        document.querySelectorAll('.cs-tab-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.tab === id);
        });
        document.querySelectorAll('.cs-panel').forEach(function (p) {
            p.classList.toggle('active', p.id === 'csPanel_' + id);
        });
        renderPanel(id);
    }

    // ---- reusable control builders -------------------------------------
    function pillRow(items, getActive, onPick) {
        const wrap = el('div', 'cs-pill-row');
        items.forEach(function (it) {
            const b = el('button', 'cs-pill' + (getActive() === it.value ? ' active' : ''), it.label);
            b.dataset.value = it.value;
            b.addEventListener('click', function () {
                onPick(it.value);
                wrap.querySelectorAll('.cs-pill').forEach(function (p) { p.classList.toggle('active', p === b); });
            });
            wrap.appendChild(b);
        });
        return wrap;
    }
    function swatchRow(colors, getActive, onPick) {
        const wrap = el('div', 'cs-swatch-row');
        colors.forEach(function (hex) {
            const active = String(getActive() || '').toLowerCase() === hex.toLowerCase();
            const b = el('button', 'cs-swatch' + (active ? ' active' : ''));
            b.style.background = hex; b.dataset.value = hex;
            b.title = hex;
            b.addEventListener('click', function () {
                onPick(hex);
                wrap.querySelectorAll('.cs-swatch').forEach(function (s) { s.classList.toggle('active', s === b); });
            });
            wrap.appendChild(b);
        });
        return wrap;
    }
    function colorField(label, getVal, onInput) {
        const f = el('div', 'cs-color-field');
        f.appendChild(el('span', 'cs-color-label', label));
        const inp = el('input', 'cs-color-input');
        inp.type = 'color'; inp.value = normHex(getVal());
        inp.addEventListener('input', function () { onInput(inp.value); });
        f.appendChild(inp);
        return f;
    }
    function sectionTitle(txt) { return el('div', 'cs-section-title', txt); }
    function hint(txt) { return el('div', 'cs-hint', txt); }

    // ---- per-tab panels ------------------------------------------------
    function renderPanel(id) {
        const panel = byId('csPanel_' + id);
        if (!panel) return;
        panel.innerHTML = '';
        const c = studioConfig || getActiveConfig();

        if (id === 'country') {
            panel.appendChild(sectionTitle('Represent Your Nation'));
            panel.appendChild(hint('Picking a nation themes your kit to that team’s colours.'));
            const grid = el('div', 'cs-country-grid');
            panel.appendChild(grid);
            renderCountryGrid(grid, c.country || selectedCountry, function (code) {
                pickCountry(code);
            });
        }
        else if (id === 'face') {
            panel.appendChild(sectionTitle('Face Shape'));
            panel.appendChild(pillRow(
                CAT().FACE_TYPES.map(function (v) { return { value: v, label: cap(v) }; }),
                function () { return (studioConfig || c).face.type; },
                function (v) { patchConfig({ face: { type: v } }); }
            ));
        }
        else if (id === 'skin') {
            panel.appendChild(sectionTitle('Skin Tone'));
            panel.appendChild(swatchRow(
                CAT().SKIN_TONES,
                function () { return (studioConfig || c).face.skin; },
                function (hex) { patchConfig({ face: { skin: hex } }); }
            ));
        }
        else if (id === 'hair') {
            panel.appendChild(sectionTitle('Hairstyle'));
            panel.appendChild(pillRow(
                CAT().HAIR_STYLES.map(function (v) { return { value: v, label: cap(v) }; }),
                function () { return (studioConfig || c).hair.style; },
                function (v) { patchConfig({ hair: { style: v } }); }
            ));
            panel.appendChild(sectionTitle('Hair Colour'));
            panel.appendChild(swatchRow(
                CAT().HAIR_COLORS,
                function () { return (studioConfig || c).hair.color; },
                function (hex) { patchConfig({ hair: { color: hex } }); }
            ));
        }
        else if (id === 'beard') {
            panel.appendChild(sectionTitle('Beard Style'));
            panel.appendChild(pillRow(
                CAT().BEARD_STYLES.map(function (v) { return { value: v, label: cap(v) }; }),
                function () { return (studioConfig || c).beard.style; },
                function (v) { patchConfig({ beard: { style: v } }); }
            ));
            panel.appendChild(sectionTitle('Beard Colour'));
            panel.appendChild(swatchRow(
                CAT().HAIR_COLORS,
                function () { return (studioConfig || c).beard.color; },
                function (hex) { patchConfig({ beard: { color: hex } }); }
            ));
        }
        else if (id === 'kit') {
            panel.appendChild(sectionTitle('Jersey Colours'));
            const colors = el('div', 'cs-color-row');
            colors.appendChild(colorField('Base', function () { return (studioConfig || c).kit.base; }, function (h) { patchConfig({ kit: { base: h } }); }));
            colors.appendChild(colorField('Yoke', function () { return (studioConfig || c).kit.yoke; }, function (h) { patchConfig({ kit: { yoke: h } }); }));
            colors.appendChild(colorField('Trim', function () { return (studioConfig || c).kit.trim; }, function (h) { patchConfig({ kit: { trim: h } }); }));
            panel.appendChild(colors);

            panel.appendChild(sectionTitle('Crest'));
            panel.appendChild(pillRow(
                [{ value: 'tricolor', label: 'Tricolour' }, { value: 'roundel', label: 'Roundel' }],
                function () { return (studioConfig || c).kit.crest; },
                function (v) { patchConfig({ kit: { crest: v } }); }
            ));
            panel.appendChild(hint('The number shows on the shirt. The team name band follows your chosen nation.'));
        }
        else if (id === 'gear') {
            panel.appendChild(sectionTitle('Gear'));
            ['headband', 'gloves', 'pads', 'wristband'].forEach(function (part) {
                panel.appendChild(gearControl(part));
            });
        }
        else if (id === 'bat') {
            panel.appendChild(sectionTitle('Bat Willow'));
            panel.appendChild(pillRow(
                [{ value: 'willow', label: 'Natural Willow' }, { value: 'dark', label: 'Dark Willow' }],
                function () { return (studioConfig || c).bat.skin; },
                function (v) { patchConfig({ bat: { skin: v } }); }
            ));
            panel.appendChild(sectionTitle('Sticker Colour'));
            const row = el('div', 'cs-color-row');
            row.appendChild(colorField('Sticker', function () { return (studioConfig || c).bat.sticker; }, function (h) { patchConfig({ bat: { sticker: h } }); }));
            panel.appendChild(row);
        }
    }

    function gearControl(part) {
        const c = studioConfig || getActiveConfig();
        const g = (c.gear && c.gear[part]) || { on: true, color: '#eef2f8' };
        const label = { headband: 'Headband', gloves: 'Gloves', pads: 'Pads', wristband: 'Wristband' }[part] || part;

        const wrap = el('div', 'cs-gear-row');
        const left = el('div', 'cs-gear-label', label);
        wrap.appendChild(left);

        const right = el('div', 'cs-gear-controls');

        // color input
        const inp = el('input', 'cs-color-input');
        inp.type = 'color'; inp.value = normHex(g.color);
        inp.disabled = !g.on;
        inp.addEventListener('input', function () { patchConfig({ gear: makeGearPatch(part, { color: inp.value }) }); });

        // on/off toggle
        const toggle = el('button', 'cs-toggle' + (g.on ? ' on' : ''), g.on ? 'ON' : 'OFF');
        toggle.addEventListener('click', function () {
            const now = !toggle.classList.contains('on');
            toggle.classList.toggle('on', now);
            toggle.textContent = now ? 'ON' : 'OFF';
            inp.disabled = !now;
            patchConfig({ gear: makeGearPatch(part, { on: now }) });
        });

        right.appendChild(inp);
        right.appendChild(toggle);
        wrap.appendChild(right);
        return wrap;
    }
    function makeGearPatch(part, val) { const o = {}; o[part] = val; return o; }

    // ---- country grid (shared by onboarding phase A + Country tab) -----
    async function ensureCountryData() {
        if (countryData) return countryData;
        try {
            const res = await fetch('/api/squad/countries');
            if (res.ok) {
                const data = await res.json();
                countryData = {
                    major: data.majorCountries || data.major || [],
                    other: data.otherCountries || data.other || []
                };
            }
        } catch (e) { console.warn('CharacterStudio: countries fetch failed', e); }
        if (!countryData) {
            countryData = { major: [{ code: 'IN', name: 'India' }, { code: 'AU', name: 'Australia' }, { code: 'EN', name: 'England' }, { code: 'PK', name: 'Pakistan' }], other: [] };
        }
        return countryData;
    }

    function flagHTML(code, cls) {
        if (typeof window.getFlagImgHTML === 'function') {
            try { return window.getFlagImgHTML(code, cls || 'cs-flag'); } catch (e) { }
        }
        return '<img src="/images/flags/' + String(code || '').toLowerCase() + '.svg" class="' + (cls || 'cs-flag') + '" alt="' + code + '" onerror="this.style.display=\'none\'">';
    }

    async function renderCountryGrid(gridEl, activeCode, onPick) {
        if (!gridEl) return;
        gridEl.innerHTML = '<div class="cs-loading">Loading nations…</div>';
        const data = await ensureCountryData();
        gridEl.innerHTML = '';
        const all = [].concat(data.major || [], data.other || []);
        all.forEach(function (co) {
            const btn = el('button', 'cs-country-btn' + (co.code === activeCode ? ' selected' : ''));
            btn.dataset.code = co.code;
            btn.innerHTML = flagHTML(co.code, 'cs-flag') + '<span class="cs-country-name">' + escapeHtml(co.name || co.code) + '</span>';
            btn.addEventListener('click', function () {
                gridEl.querySelectorAll('.cs-country-btn').forEach(function (b) { b.classList.toggle('selected', b === btn); });
                onPick(co.code);
            });
            gridEl.appendChild(btn);
        });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function pickCountry(code) {
        selectedCountry = code;
        const k = kitFor(code);
        patchConfig({ country: code, kit: { base: k.base, yoke: k.yoke, trim: k.trim, crest: k.crest } });
        // refresh the Kit + Country panels so swatches/inputs reflect the new palette
        const kitPanel = byId('csPanel_kit');
        if (kitPanel && kitPanel.classList.contains('active')) renderPanel('kit');
    }

    // ====================================================================
    // open / close / finish
    // ====================================================================
    function openStudio(mode) {
        ensureBuilt();
        const modal = byId('characterStudioModal');
        if (!modal) return;

        studioMode = (mode === 'onboard') ? 'onboard' : 'edit';
        studioConfig = getActiveConfig();
        selectedCountry = studioConfig.country || 'IN';

        // titles / CTA per mode
        const title = byId('csTitle');
        const cta = byId('csCtaBtn');
        const closeBtn = byId('csCloseBtn');
        if (studioMode === 'onboard') {
            if (title) title.textContent = 'Create Your Player';
            if (cta) cta.textContent = 'Start Playing 🏏';
            if (closeBtn) closeBtn.style.display = 'none';
        } else {
            if (title) title.textContent = 'Customise Your Player';
            if (cta) cta.textContent = 'Save Changes ✔';
            if (closeBtn) closeBtn.style.display = '';
        }

        // onboarding phase-A country overlay
        const overlay = byId('csOnboardCountry');
        if (overlay) {
            if (studioMode === 'onboard') {
                overlay.classList.remove('hidden');
                renderCountryGrid(byId('csOnboardCountryGrid'), selectedCountry, function (code) { pickCountry(code); });
            } else {
                overlay.classList.add('hidden');
            }
        }

        // seed the name/number inputs from config
        const nameInp = byId('csNameInput'); if (nameInp) nameInp.value = (studioConfig.kit.name === 'PLAYER' ? '' : studioConfig.kit.name || '');
        const numInp = byId('csNumberInput'); if (numInp) numInp.value = studioConfig.kit.number != null ? studioConfig.kit.number : 18;

        // show first tab
        showTab('country');

        // reveal modal BEFORE mounting the engine so the stage has real dimensions
        modal.classList.remove('hidden');
        document.body.classList.add('cs-open');

        // move the engine into the studio preview
        requestAnimationFrame(function () { mountEngine('studio'); });
    }

    function closeStudio(doPersist) {
        const modal = byId('characterStudioModal');
        if (doPersist && studioConfig) {
            persist(studioConfig);
            syncUsername(studioConfig);
        }
        if (modal) modal.classList.add('hidden');
        document.body.classList.remove('cs-open');

        // return the engine to the home hero stage
        if (typeof window.navigateTo === 'function') { try { window.navigateTo('screen-home'); } catch (e) { } }
        requestAnimationFrame(function () { mountEngine('home'); });
    }

    // "Start Playing" / "Save Changes"
    async function finishStudio() {
        // persist appearance first (localStorage + SQL)
        if (studioConfig) { persist(studioConfig); syncUsername(studioConfig); }

        // if the nation changed, mirror it to the backend squad exactly like the country modal
        try {
            const cur = (typeof window.gameState !== 'undefined' && window.gameState.countryCode) || 'IN';
            if (selectedCountry && selectedCountry !== cur) {
                const res = await fetch('/api/squad/select-country', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ countryCode: selectedCountry })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.success && data.countryInfo && typeof window.gameState !== 'undefined') {
                        window.gameState.countryCode = data.countryInfo.code;
                        window.gameState.countryFlag = data.countryInfo.flag;
                        window.gameState.countryName = data.countryInfo.name;
                        window.gameState.isMajorCountry = data.countryInfo.isMajor;
                        if (data.teamPower != null) window.gameState.teamPower = data.teamPower;
                        if (typeof window.loadSquadCardsFromDb === 'function') { try { await window.loadSquadCardsFromDb(); } catch (e) { } }
                    }
                }
            }
        } catch (e) { console.warn('CharacterStudio: country sync failed', e); }

        if (typeof window.updateHud === 'function') { try { window.updateHud(); } catch (e) { } }
        if (typeof window.showToast === 'function') {
            try { window.showToast(studioMode === 'onboard' ? '🎉 Welcome! Your player is ready.' : '✔ Player appearance saved!'); } catch (e) { }
        }

        onboardingDecided = true;               // completing the flow counts as decided
        closeStudio(false);                     // already persisted above
    }

    function syncUsername(cfg) {
        try {
            const nm = cfg && cfg.kit && cfg.kit.name;
            if (nm && nm !== 'PLAYER' && typeof window.gameState !== 'undefined') {
                window.gameState.username = nm;
            }
        } catch (e) { }
    }

    // ====================================================================
    // first-launch onboarding coordination (called from app.js)
    // ====================================================================
    function decideOnboarding() {
        if (onboardingDecided) return;
        if (!splashDone) return;
        // wait for the profile unless it's taking too long (offline / slow)
        if (!profileLoaded && profileTimer) return;
        onboardingDecided = true;
        if (isOnboarded()) return;              // returning player — stay on home
        openStudio('onboard');
    }

    function onSplashComplete() {
        splashDone = true;
        // fallback: if the profile never resolves, still onboard a brand-new player
        if (!profileLoaded && !profileTimer) {
            profileTimer = setTimeout(function () { profileTimer = null; decideOnboarding(); }, 3500);
        }
        decideOnboarding();
    }

    function onProfileLoaded(serverConfig) {
        profileLoaded = true;
        if (profileTimer) { clearTimeout(profileTimer); profileTimer = null; }
        if (serverConfig) {
            applyServerConfig(serverConfig);
            // if we somehow opened onboarding before the profile arrived, dismiss it
            const modal = byId('characterStudioModal');
            if (studioMode === 'onboard' && modal && !modal.classList.contains('hidden')) {
                onboardingDecided = true;
                closeStudio(false);
            }
        }
        decideOnboarding();
    }

    // ---- public API ----------------------------------------------------
    window.CharacterStudio = {
        openStudio: openStudio,
        closeStudio: closeStudio,
        getActiveConfig: getActiveConfig,
        applyServerConfig: applyServerConfig,
        onSplashComplete: onSplashComplete,
        onProfileLoaded: onProfileLoaded,
        isOnboarded: isOnboarded
    };

})(window);
