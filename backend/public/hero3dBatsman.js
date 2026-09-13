/**
 * 🏏 Cricket League — Procedural Stylized 3D Cricketer Engine
 * ---------------------------------------------------------------------------
 * A fully code-built, fully customizable stylized batsman (Free-Fire-ish look).
 * Every axis is swappable live: face type, skin tone, hairstyle, beard, jersey/
 * kit colours (base/yoke/trim + name/number), gear (headband/gloves/pads/
 * wristband) and bat skin. No external model — the whole figure is Three.js
 * geometry, so nothing is "baked" and everything can be recoloured / reshaped.
 *
 * Build strategy: a segmented "action-figure" made of cylinders + spheres
 * (r128 has NO CapsuleGeometry), assembled directly in a confident
 * bat-on-shoulder hero stance. The swing + breathing animate the whole root,
 * so no skeletal solver is needed. Any customization mutates one `cfg` object
 * and triggers a cheap full rebuild() — always consistent, never partial.
 *
 * Public API:
 *   Hero3DBatsman.init(canvasId, containerId)  dispose()
 *   applyConfig(cfg)  getConfig()
 *   setCountry(code)  setFaceType(t)  setSkinTone(hex)
 *   setHair(style,color)  setBeard(style,color)
 *   setKitColors({base,yoke,trim})  setJersey({name,number})
 *   setGear(part,{on,color})  setBatSkin(type)  triggerSwing()
 */
(function (window) {
    'use strict';

    // ---- Country kit presets (starting palettes; fully user-overridable) ----
    const KITS = {
        IN: { base: '#123f8c', yoke: '#ff6a1a', trim: '#eef2f8', crest: 'tricolor' },
        AU: { base: '#f6d417', yoke: '#0b5a2f', trim: '#0b5a2f', crest: 'roundel' },
        EN: { base: '#2340a0', yoke: '#cf1b2b', trim: '#eef2f8', crest: 'roundel' },
        PK: { base: '#0b7a3b', yoke: '#f5c518', trim: '#eef2f8', crest: 'roundel' },
        SA: { base: '#0b6b3a', yoke: '#f5c518', trim: '#0b6b3a', crest: 'roundel' },
        NZ: { base: '#14161b', yoke: '#14161b', trim: '#c3c7cd', crest: 'roundel' },
        SL: { base: '#123f8c', yoke: '#f5c518', trim: '#eef2f8', crest: 'roundel' },
        BD: { base: '#0b6b3a', yoke: '#cf1b2b', trim: '#eef2f8', crest: 'roundel' },
        WI: { base: '#6b1414', yoke: '#f5c518', trim: '#eef2f8', crest: 'roundel' },
        AF: { base: '#0b6b3a', yoke: '#d32f2f', trim: '#eef2f8', crest: 'roundel' }
    };
    const DEFAULT_KIT = { base: '#1d4ed8', yoke: '#f59e0b', trim: '#eef2f8', crest: 'roundel' };
    // Backend country codes → engine kit keys (backend uses GB/ZA/LK; non-major → default)
    const CODE_ALIAS = {
        GB: 'EN', ZA: 'SA', LK: 'SL',
        US: '_D', CA: '_D', AE: '_D', DE: '_D', FR: '_D', BR: '_D', SG: '_D', GLOBAL: '_D'
    };
    const TEAM_NAMES = {
        IN: 'INDIA', AU: 'AUSTRALIA', EN: 'ENGLAND', GB: 'ENGLAND', PK: 'PAKISTAN',
        SA: 'SOUTH AFRICA', ZA: 'SOUTH AFRICA', NZ: 'NEW ZEALAND', SL: 'SRI LANKA',
        LK: 'SRI LANKA', BD: 'BANGLADESH', WI: 'WEST INDIES', AF: 'AFGHANISTAN'
    };
    function kitFor(code) { const k = CODE_ALIAS[code] || code; return (k === '_D') ? DEFAULT_KIT : (KITS[k] || DEFAULT_KIT); }
    function teamName(code) { return TEAM_NAMES[code] || String(code || 'CRICKET').toUpperCase(); }

    // ---- Customization option catalogues (also used by the UI) -------------
    const SKIN_TONES = ['#f3d3b5', '#eebd97', '#d9a066', '#c98a5e', '#a86b41', '#7a4a29', '#5a3620'];
    const HAIR_COLORS = ['#1a1208', '#2b1a0e', '#4a2e18', '#6b4423', '#8a6a3a', '#b8b8b8', '#e8e8e8', '#c0392b'];
    const HAIR_STYLES = ['bald', 'buzz', 'short', 'spiky', 'curly', 'fade', 'swept'];
    const BEARD_STYLES = ['none', 'stubble', 'boxed', 'goatee', 'full'];
    const FACE_TYPES = ['oval', 'square', 'round', 'long'];

    function defaultConfig() {
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

    let scene, camera, renderer, clock, pmrem;
    let container, canvas, root, rig, ro;
    let cfg = defaultConfig();

    // interaction / animation state
    let isDragging = false, startX = 0, startY = 0;
    let targetRotY = -0.16, curRotY = -0.16, velRotY = 0;
    let targetRotX = 0, curRotX = 0, velRotX = 0;
    let breath = 0, baseY = 0, isSwinging = false, animId = null;

    // ---- colour helpers (r128 needs sRGB→linear on every literal) ----------
    const toColor = (v) => new THREE.Color(v).convertSRGBToLinear();
    function shadeHex(hex, f) {
        const c = new THREE.Color(hex);
        const clamp = (x) => Math.max(0, Math.min(1, x));
        return '#' + new THREE.Color(clamp(c.r * f), clamp(c.g * f), clamp(c.b * f)).getHexString();
    }
    function mat(color, o) {
        o = o || {};
        return new THREE.MeshStandardMaterial({
            color: toColor(color),
            roughness: o.rough != null ? o.rough : 0.72,
            metalness: o.metal || 0,
            transparent: !!o.transparent,
            opacity: o.opacity != null ? o.opacity : 1,
            flatShading: !!o.flat
        });
    }
    function add(parent, geo, color, o) {
        const m = new THREE.Mesh(geo, mat(color, o));
        m.castShadow = true; m.receiveShadow = true;
        parent.add(m); return m;
    }
    function disposeTree(obj) {
        obj.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }
        });
    }

    // =====================================================================
    function init(canvasId, containerId) {
        container = document.getElementById(containerId);
        if (!container || !window.THREE) { console.error('❌ Hero3D: missing container or THREE'); return; }

        container.innerHTML = `
            <div class="hero-3d-stage-viewport" id="hero3dViewport" style="position:relative;width:100%;height:100%;overflow:hidden;">
                <canvas id="hero3dCanvas" style="width:100%;height:100%;display:block;outline:none;touch-action:none;"></canvas>
                <div class="hero-3d-ground-shadow"></div>
                <div class="hero-character-aura"></div>
                <div class="practice-toast hidden" id="practiceToast">POWERFUL SHOT! 🏏</div>
            </div>`;

        canvas = container.querySelector('#hero3dCanvas') || container.querySelector('canvas');
        clock = new THREE.Clock();
        const dim = measure();
        const w = dim.w, h = dim.h;

        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        if ('physicallyCorrectLights' in renderer) renderer.physicallyCorrectLights = true;

        scene = new THREE.Scene();

        try {
            pmrem = new THREE.PMREMGenerator(renderer);
            if (THREE.RoomEnvironment) {
                scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(renderer), 0.04).texture;
            }
        } catch (e) { console.warn('Hero3D: IBL unavailable', e); }

        camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
        camera.position.set(0, 1.02, 3.75);
        camera.lookAt(0, 0.95, 0);

        root = new THREE.Group();
        root.position.x = 0.18;            // clear the left-side UI menu
        scene.add(root);

        setupLighting();

        rig = new THREE.Group();
        root.add(rig);
        rebuild();
        baseY = 0;

        setupDragControls();
        window.addEventListener('resize', onResize);
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => onResize());
            ro.observe(container);
        }
        if (animId) cancelAnimationFrame(animId);
        animate();
        console.log('✅ Hero3D procedural cricketer ready');
    }

    function dispose() {
        try {
            if (animId) cancelAnimationFrame(animId);
            animId = null;
            if (ro) { ro.disconnect(); ro = null; }
            window.removeEventListener('resize', onResize);
            if (rig) disposeTree(rig);
            if (renderer) {
                renderer.dispose();
                const gl = renderer.getContext && renderer.getContext();
                const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
                if (lose) lose.loseContext();
            }
        } catch (e) { /* best-effort */ }
        try { if (container) container.innerHTML = ''; } catch (e2) {}
        scene = camera = renderer = rig = root = container = null;
    }

    function measure() {
        const r = container.getBoundingClientRect();
        return { w: Math.round(r.width) || 360, h: Math.round(r.height) || 540 };
    }

    function setupLighting() {
        scene.add(new THREE.AmbientLight(0xffffff, 0.24));
        scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x20304a, 0.38));

        const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
        key.position.set(2.6, 5.2, 4.2);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.near = 0.5; key.shadow.camera.far = 20;
        key.shadow.camera.left = -2.5; key.shadow.camera.right = 2.5;
        key.shadow.camera.top = 3.5; key.shadow.camera.bottom = -1;
        key.shadow.bias = -0.0004;
        scene.add(key);

        const fill = new THREE.DirectionalLight(0x93c5fd, 0.9);
        fill.position.set(-3.5, 2.0, 2.5);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0xffe8c2, 1.8);
        rim.position.set(-1.2, 3.8, -4.5);
        scene.add(rim);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(6, 6),
            new THREE.ShadowMaterial({ opacity: 0.32 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.x = root ? root.position.x : 0;
        ground.receiveShadow = true;
        scene.add(ground);
    }

    // =====================================================================
    // Full rebuild — cheap (a few dozen small meshes), always consistent.
    // =====================================================================
    function rebuild() {
        if (!rig) return;
        while (rig.children.length) { const c = rig.children.pop(); disposeTree(c); rig.remove(c); }

        const trousers = shadeHex(cfg.kit.base, 0.55);

        buildTorso(trousers);
        buildHeadGroup();
        buildArm(+1);   // right — holds the bat
        buildArm(-1);   // left
        buildLeg(+1, trousers);
        buildLeg(-1, trousers);
    }

    // ---- Torso (jersey body) + pelvis + chest crest/name -----------------
    function buildTorso(trousers) {
        const g = new THREE.Group();

        // pelvis
        const pelvis = add(g, new THREE.SphereGeometry(0.155, 22, 18), trousers, { rough: 0.7 });
        pelvis.position.set(0, 0.98, 0); pelvis.scale.set(1.0, 0.72, 0.78);

        // jersey body: tapered cylinder, flattened front-to-back
        const torsoH = 0.5;
        const body = add(g, new THREE.CylinderGeometry(0.205, 0.15, torsoH, 28, 1, true), cfg.kit.base, { rough: 0.62 });
        body.position.y = 0.98 + torsoH / 2 - 0.02; body.scale.z = 0.66;
        // close the torso top/bottom softly with spheres
        const chest = add(g, new THREE.SphereGeometry(0.205, 26, 20), cfg.kit.base, { rough: 0.62 });
        chest.position.y = 0.98 + torsoH - 0.06; chest.scale.set(1.0, 0.62, 0.66);

        // shoulder yoke band (yoke colour) across the upper chest/shoulders
        const yoke = add(g, new THREE.CylinderGeometry(0.212, 0.2, 0.12, 28, 1, true), cfg.kit.yoke, { rough: 0.58 });
        yoke.position.y = 1.4; yoke.scale.z = 0.66;

        // collar (trim)
        const collar = add(g, new THREE.TorusGeometry(0.072, 0.02, 12, 24), cfg.kit.trim, { rough: 0.5 });
        collar.position.y = 1.47; collar.rotation.x = Math.PI / 2; collar.scale.z = 0.9;

        // neck (skin)
        const neck = add(g, new THREE.CylinderGeometry(0.052, 0.06, 0.09, 18), cfg.face.skin, { rough: 0.55 });
        neck.position.y = 1.5;

        // chest decal (crest + team name + number)
        buildChestDecal(g);

        rig.add(g);
    }

    function buildChestDecal(parent) {
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
        const x = cv.getContext('2d');
        x.clearRect(0, 0, 512, 512);

        // team name band across the chest
        const name = teamName(cfg.country);
        x.font = '900 88px Barlow, Arial, sans-serif';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        let fs = 88; x.font = `900 ${fs}px Barlow, Arial, sans-serif`;
        while (x.measureText(name).width > 470 && fs > 34) { fs -= 4; x.font = `900 ${fs}px Barlow, Arial, sans-serif`; }
        x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,0.35)';
        x.strokeText(name, 256, 232); x.fillStyle = cfg.kit.trim; x.fillText(name, 256, 232);

        // number
        x.font = '900 150px Teko, Barlow, sans-serif';
        x.lineWidth = 12; x.strokeStyle = 'rgba(0,0,0,0.3)';
        x.strokeText(String(cfg.kit.number ?? ''), 256, 360);
        x.fillStyle = cfg.kit.yoke; x.fillText(String(cfg.kit.number ?? ''), 256, 360);

        const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
        const decal = new THREE.Mesh(
            new THREE.PlaneGeometry(0.30, 0.30),
            new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, metalness: 0, depthWrite: false })
        );
        decal.position.set(0, 1.24, 0.148); decal.rotation.x = -0.02; decal.renderOrder = 4;
        parent.add(decal);

        // small team crest badge on the left chest
        const badge = buildCrestBadge();
        badge.position.set(-0.11, 1.36, 0.145); badge.renderOrder = 5;
        parent.add(badge);
    }

    function buildCrestBadge() {
        const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
        const x = cv.getContext('2d');
        x.save(); x.beginPath(); x.arc(64, 64, 60, 0, 7); x.clip();
        if (cfg.kit.crest === 'tricolor') {
            x.fillStyle = '#ff8f1c'; x.fillRect(0, 0, 128, 45);
            x.fillStyle = '#ffffff'; x.fillRect(0, 43, 128, 42);
            x.fillStyle = '#14924a'; x.fillRect(0, 84, 128, 44);
            x.strokeStyle = '#0a1f66'; x.lineWidth = 4; x.beginPath(); x.arc(64, 64, 13, 0, 7); x.stroke();
            for (let i = 0; i < 12; i++) { const a = i / 12 * 7; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + 13 * Math.cos(a), 64 + 13 * Math.sin(a)); x.stroke(); }
        } else {
            x.fillStyle = cfg.kit.base; x.fillRect(0, 0, 128, 128);
            x.fillStyle = cfg.kit.yoke; x.beginPath();
            for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5, r = 34; x.lineTo(64 + r * Math.cos(a), 64 + r * Math.sin(a)); const a2 = a + Math.PI / 5; x.lineTo(64 + 15 * Math.cos(a2), 64 + 15 * Math.sin(a2)); }
            x.closePath(); x.fill();
        }
        x.restore();
        x.strokeStyle = cfg.kit.crest === 'tricolor' ? '#0b2a63' : cfg.kit.trim;
        x.lineWidth = 7; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.stroke();

        const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
        return new THREE.Mesh(
            new THREE.CircleGeometry(0.05, 28),
            new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.55, metalness: 0, depthWrite: false })
        );
    }

    // ---- Head + face + hair + beard + headband ---------------------------
    function buildHeadGroup() {
        const hg = new THREE.Group(); hg.position.set(0, 1.63, 0);

        // face-type proportions
        const F = {
            oval: { sx: 1.0, sy: 1.08, sz: 0.98, jaw: 0.85 },
            square: { sx: 1.06, sy: 1.0, sz: 0.98, jaw: 1.05 },
            round: { sx: 1.05, sy: 0.98, sz: 1.0, jaw: 0.8 },
            long: { sx: 0.95, sy: 1.18, sz: 0.96, jaw: 0.9 }
        }[cfg.face.type] || { sx: 1, sy: 1.08, sz: 0.98, jaw: 0.85 };

        const R = 0.112;
        const skull = add(hg, new THREE.SphereGeometry(R, 30, 24), cfg.face.skin, { rough: 0.5 });
        skull.scale.set(F.sx, F.sy, F.sz);

        // jaw / chin
        const jaw = add(hg, new THREE.SphereGeometry(R * 0.82, 26, 20), cfg.face.skin, { rough: 0.5 });
        jaw.position.set(0, -R * 0.62, R * 0.12); jaw.scale.set(0.92 * F.sx, 0.7 * F.jaw, 0.9);

        // ears
        [-1, 1].forEach((s) => {
            const ear = add(hg, new THREE.SphereGeometry(0.026, 16, 12), cfg.face.skin, { rough: 0.5 });
            ear.position.set(s * R * 0.98 * F.sx, -0.01, 0); ear.scale.set(0.7, 1.0, 0.7);
        });

        // eyes (white + iris) + brows + nose + mouth
        [-1, 1].forEach((s) => {
            const white = add(hg, new THREE.SphereGeometry(0.02, 16, 12), '#f7f7f7', { rough: 0.35 });
            white.position.set(s * 0.042, 0.012, R * 0.9); white.scale.set(1, 0.72, 0.5);
            const iris = add(hg, new THREE.SphereGeometry(0.0092, 14, 12), '#2a1a10', { rough: 0.3 });
            iris.position.set(s * 0.044, 0.008, R * 0.96);
            const brow = add(hg, new THREE.BoxGeometry(0.038, 0.008, 0.012), cfg.hair.color, { rough: 0.7 });
            brow.position.set(s * 0.044, 0.05, R * 0.92); brow.rotation.z = s * 0.08;
        });
        const nose = add(hg, new THREE.SphereGeometry(0.018, 16, 12), cfg.face.skin, { rough: 0.5 });
        nose.position.set(0, -0.012, R * 1.02); nose.scale.set(0.8, 1.1, 1.1);
        const mouth = add(hg, new THREE.BoxGeometry(0.04, 0.008, 0.01), shadeHex(cfg.face.skin, 0.6), { rough: 0.6 });
        mouth.position.set(0, -0.062, R * 0.9);

        buildBeard(hg, R, F);
        buildHair(hg, R, F);
        if (cfg.gear.headband.on) {
            const band = add(hg, new THREE.TorusGeometry(R * 1.02, 0.018, 14, 30), cfg.gear.headband.color, { rough: 0.55 });
            band.position.set(0, R * 0.42, 0); band.rotation.x = Math.PI / 2; band.scale.set(F.sx, F.sz, 1);
        }

        rig.add(hg);
    }

    // ---- Hair library ----------------------------------------------------
    function buildHair(hg, R, F) {
        const style = cfg.hair.style, col = cfg.hair.color;
        if (style === 'bald') return;
        const cap = (rad, ty, tl, sy) => {
            const m = add(hg, new THREE.SphereGeometry(rad, 28, 20, 0, Math.PI * 2, 0, tl != null ? tl : Math.PI * 0.55), col, { rough: 0.78 });
            m.position.y = ty || 0; if (sy) m.scale.set(F.sx * 1.02, sy, F.sz * 1.02); else m.scale.set(F.sx * 1.02, 1, F.sz * 1.02);
            return m;
        };
        if (style === 'buzz') { cap(R * 1.03, R * 0.02, Math.PI * 0.5); }
        else if (style === 'short') { cap(R * 1.06, R * 0.04, Math.PI * 0.62); }
        else if (style === 'fade') {
            cap(R * 1.04, R * 0.06, Math.PI * 0.42, 1.15);
            const top = add(hg, new THREE.SphereGeometry(R * 0.85, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.5), col, { rough: 0.78 });
            top.position.set(0, R * 0.5, 0); top.scale.set(F.sx, 1.05, F.sz);
        } else if (style === 'spiky') {
            cap(R * 1.03, R * 0.05, Math.PI * 0.5);
            for (let i = 0; i < 11; i++) {
                const a = (i / 11) * Math.PI * 2, rr = R * 0.62;
                const sp = add(hg, new THREE.ConeGeometry(0.02, 0.075, 10), col, { rough: 0.78 });
                sp.position.set(Math.cos(a) * rr * F.sx, R * 0.72 + Math.random() * 0.01, Math.sin(a) * rr * F.sz);
                sp.rotation.set(0.35 * Math.sin(a), 0, -0.35 * Math.cos(a));
            }
            const spТ = add(hg, new THREE.ConeGeometry(0.022, 0.085, 10), col, { rough: 0.78 }); spТ.position.set(0, R * 0.95, 0);
        } else if (style === 'curly') {
            const base = add(hg, new THREE.SphereGeometry(R * 1.14, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), col, { rough: 0.85 });
            base.position.y = R * 0.08; base.scale.set(F.sx * 1.05, 1.12, F.sz * 1.05);
            for (let i = 0; i < 26; i++) {
                const a = Math.random() * Math.PI * 2, t = Math.random() * Math.PI * 0.45;
                const rr = R * 1.16;
                const cu = add(hg, new THREE.SphereGeometry(0.028 + Math.random() * 0.012, 12, 10), col, { rough: 0.85 });
                cu.position.set(Math.sin(t) * Math.cos(a) * rr * F.sx, R * 0.1 + Math.cos(t) * rr, Math.sin(t) * Math.sin(a) * rr * F.sz);
            }
        } else if (style === 'swept') {
            cap(R * 1.05, R * 0.05, Math.PI * 0.6);
            const swoop = add(hg, new THREE.BoxGeometry(R * 2.0, R * 0.5, R * 1.3), col, { rough: 0.78 });
            swoop.position.set(0, R * 0.72, R * 0.28); swoop.rotation.x = -0.5; swoop.scale.set(F.sx, 1, F.sz);
        } else { cap(R * 1.06, R * 0.04, Math.PI * 0.62); }
    }

    // ---- Beard library ---------------------------------------------------
    function buildBeard(hg, R, F) {
        const style = cfg.beard.style, col = cfg.beard.color;
        if (style === 'none') return;
        const opacity = style === 'stubble' ? 0.55 : 1;
        const thick = style === 'full' ? 1.14 : (style === 'boxed' ? 1.08 : 1.03);

        if (style === 'goatee') {
            const chin = add(hg, new THREE.SphereGeometry(R * 0.4, 18, 14), col, { rough: 0.85 });
            chin.position.set(0, -R * 0.78, R * 0.5); chin.scale.set(0.7, 0.9, 0.6);
            const mo = add(hg, new THREE.TorusGeometry(R * 0.28, 0.012, 10, 20, Math.PI), col, { rough: 0.85 });
            mo.position.set(0, -R * 0.42, R * 0.82); mo.rotation.z = Math.PI;
            return;
        }
        // stubble / boxed / full — a jaw-hugging shell
        const shell = add(hg, new THREE.SphereGeometry(R * thick, 30, 22, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), col, { rough: 0.85, transparent: opacity < 1, opacity });
        shell.position.set(0, -R * 0.14, 0); shell.scale.set(F.sx * 1.0, 1.05, F.sz * 1.02);
        // carve the face opening with a skin-coloured cheek/mouth gap
        const gap = add(hg, new THREE.SphereGeometry(R * (thick - 0.14), 24, 18, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.42), cfg.face.skin, { rough: 0.5, transparent: opacity < 1, opacity: Math.min(1, opacity + 0.2) });
        gap.position.set(0, -R * 0.05, R * 0.16); gap.scale.set(0.86, 1.0, 0.9);
        if (style === 'full') {
            const mus = add(hg, new THREE.BoxGeometry(R * 0.9, R * 0.16, R * 0.3), col, { rough: 0.85 });
            mus.position.set(0, -R * 0.42, R * 0.86);
        }
    }

    // ---- Arm (side = +1 right holds bat, -1 left) ------------------------
    function buildArm(side) {
        const g = new THREE.Group();
        g.position.set(side * 0.2, 1.42, 0);

        // shoulder (sleeve)
        add(g, new THREE.SphereGeometry(0.078, 22, 18), cfg.kit.yoke, { rough: 0.58 }).scale.set(1, 1, 0.9);

        const upper = new THREE.Group(); g.add(upper);
        const uLen = 0.28;
        const uMesh = add(upper, new THREE.CylinderGeometry(0.062, 0.05, uLen, 22), cfg.kit.yoke, { rough: 0.58 });
        uMesh.position.y = -uLen / 2;
        // short-sleeve cuff (trim)
        const cuff = add(upper, new THREE.CylinderGeometry(0.053, 0.053, 0.028, 22), cfg.kit.trim, { rough: 0.55 });
        cuff.position.y = -uLen + 0.012;

        const elbow = new THREE.Group(); elbow.position.y = -uLen; upper.add(elbow);
        add(elbow, new THREE.SphereGeometry(0.05, 18, 14), cfg.face.skin, { rough: 0.55 });

        const fLen = 0.26;
        const fMesh = add(elbow, new THREE.CylinderGeometry(0.048, 0.04, fLen, 22), cfg.face.skin, { rough: 0.55 });
        fMesh.position.y = -fLen / 2;

        if (cfg.gear.wristband.on) {
            const wb = add(elbow, new THREE.TorusGeometry(0.047, 0.014, 12, 22), cfg.gear.wristband.color, { rough: 0.6 });
            wb.position.y = -fLen + 0.035; wb.rotation.x = Math.PI / 2;
        }

        const wrist = new THREE.Group(); wrist.position.y = -fLen; elbow.add(wrist);
        buildHand(wrist);

        // ---- pose: right arm folds up to hold a shouldered bat -----------
        if (side > 0) {
            upper.rotation.set(-0.35, 0.1, 0.30);
            elbow.rotation.set(-2.35, 0, 0.15);
            buildBat(wrist);
        } else {
            upper.rotation.set(-0.15, -0.1, -0.34);
            elbow.rotation.set(-0.55, 0, -0.1);
        }
        rig.add(g);
    }

    function buildHand(wrist) {
        if (cfg.gear.gloves.on) {
            const glove = add(wrist, new THREE.SphereGeometry(0.056, 18, 14), cfg.gear.gloves.color, { rough: 0.6 });
            glove.position.y = -0.03; glove.scale.set(1, 1.25, 0.85);
            // finger roll
            const roll = add(wrist, new THREE.BoxGeometry(0.095, 0.06, 0.075), cfg.gear.gloves.color, { rough: 0.6 });
            roll.position.y = -0.075;
            // accent stripes (base colour)
            const acc = add(wrist, new THREE.BoxGeometry(0.098, 0.016, 0.078), cfg.kit.base, { rough: 0.55 });
            acc.position.y = -0.05;
        } else {
            const hand = add(wrist, new THREE.SphereGeometry(0.048, 18, 14), cfg.face.skin, { rough: 0.55 });
            hand.position.y = -0.035; hand.scale.set(1, 1.3, 0.8);
        }
    }

    // ---- Leg -------------------------------------------------------------
    function buildLeg(side, trousers) {
        const g = new THREE.Group();
        g.position.set(side * 0.09, 0.92, 0);

        // hip joint
        add(g, new THREE.SphereGeometry(0.078, 18, 14), trousers, { rough: 0.7 });

        const tLen = 0.44;
        const thigh = add(g, new THREE.CylinderGeometry(0.084, 0.066, tLen, 22), trousers, { rough: 0.7 });
        thigh.position.y = -tLen / 2;

        const knee = new THREE.Group(); knee.position.y = -tLen; g.add(knee);
        add(knee, new THREE.SphereGeometry(0.06, 16, 12), trousers, { rough: 0.7 });

        const sLen = 0.42;
        const shin = add(knee, new THREE.CylinderGeometry(0.062, 0.05, sLen, 22), trousers, { rough: 0.7 });
        shin.position.y = -sLen / 2;

        // batting pad over the shin (front)
        if (cfg.gear.pads.on) {
            const pad = add(knee, new THREE.BoxGeometry(0.11, sLen + 0.06, 0.07), cfg.gear.pads.color, { rough: 0.7 });
            pad.position.set(0, -sLen / 2 + 0.01, 0.055);
            for (let i = 0; i < 3; i++) {
                const roll = add(knee, new THREE.CylinderGeometry(0.02, 0.02, 0.12, 12), cfg.gear.pads.color, { rough: 0.68 });
                roll.rotation.z = Math.PI / 2; roll.position.set(0, -0.02 - i * 0.13, 0.092);
            }
            const kneeRoll = add(knee, new THREE.SphereGeometry(0.055, 16, 12), cfg.gear.pads.color, { rough: 0.7 });
            kneeRoll.position.set(0, 0.02, 0.05); kneeRoll.scale.set(1, 0.8, 0.8);
        }

        const ankle = new THREE.Group(); ankle.position.y = -sLen; knee.add(ankle);
        // shoe
        const shoe = add(ankle, new THREE.BoxGeometry(0.09, 0.06, 0.2), cfg.kit.trim, { rough: 0.5 });
        shoe.position.set(0, -0.02, 0.05);
        const sole = add(ankle, new THREE.BoxGeometry(0.095, 0.025, 0.21), shadeHex(cfg.kit.base, 0.5), { rough: 0.6 });
        sole.position.set(0, -0.05, 0.05);
        const lace = add(ankle, new THREE.BoxGeometry(0.05, 0.03, 0.08), cfg.kit.yoke, { rough: 0.5 });
        lace.position.set(0, 0.005, 0.02);

        g.rotation.z = side > 0 ? -0.02 : 0.02;
        rig.add(g);
    }

    // ---- Procedural bat (parented to the right hand) ---------------------
    function buildBat(wrist) {
        const willow = cfg.bat.skin === 'dark' ? '#5a3a22' : '#e9dcc0';
        const bat = new THREE.Group();

        const handleLen = 0.34, bladeLen = 0.66;
        const handle = add(bat, new THREE.CylinderGeometry(0.018, 0.021, handleLen, 16), '#191919', { rough: 0.85 });
        handle.position.y = handleLen / 2;
        const shoulder = add(bat, new THREE.BoxGeometry(0.086, 0.14, 0.05), willow, { rough: 0.5 });
        shoulder.position.y = handleLen + 0.06;
        const blade = add(bat, new THREE.BoxGeometry(0.108, bladeLen, 0.052), willow, { rough: 0.5 });
        blade.position.y = handleLen + bladeLen / 2;
        const swell = add(bat, new THREE.BoxGeometry(0.088, bladeLen * 0.6, 0.03), willow, { rough: 0.5 });
        swell.position.set(0, handleLen + bladeLen * 0.42, -0.04);
        const sticker = add(bat, new THREE.BoxGeometry(0.09, 0.22, 0.055), cfg.bat.sticker, { rough: 0.4 });
        sticker.position.y = handleLen + bladeLen * 0.72;

        bat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        // seat the handle in the fist and lean the blade up over the shoulder
        bat.position.set(0.02, -0.06, 0.02);
        bat.rotation.set(-0.15, 0, -0.15);
        wrist.add(bat);
    }

    // =====================================================================
    function setupDragControls() {
        container.addEventListener('pointerdown', (e) => {
            isDragging = true; startX = e.clientX; startY = e.clientY; velRotY = velRotX = 0;
            container.setPointerCapture?.(e.pointerId);
        });
        container.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            startX = e.clientX; startY = e.clientY;
            targetRotY += dx * 0.012; targetRotX += dy * 0.006;
            targetRotX = Math.max(-0.18, Math.min(0.18, targetRotX));
            velRotY = dx * 0.010; velRotX = dy * 0.005;
        });
        const up = () => {
            if (isDragging && Math.abs(velRotY) < 0.004) triggerSwing();
            isDragging = false;
        };
        container.addEventListener('pointerup', up);
        container.addEventListener('pointercancel', up);
    }

    function triggerSwing() {
        if (isSwinging || !root) return;
        isSwinging = true;
        const start = curRotY; let p = 0;
        const iv = setInterval(() => {
            p += 0.08;
            const t = Math.sin(p * Math.PI);
            root.rotation.y = start + t * 0.5;
            root.rotation.z = -t * 0.06;
            root.position.y = baseY - t * 0.02;
            if (p >= 1) {
                clearInterval(iv);
                root.rotation.z = 0; curRotY = targetRotY = start; isSwinging = false;
            }
        }, 24);
        const toast = document.getElementById('practiceToast');
        if (toast) { toast.textContent = 'POWERFUL SHOT! 🏏🔥'; toast.classList.remove('hidden'); setTimeout(() => toast.classList.add('hidden'), 1400); }
    }

    function animate() {
        animId = requestAnimationFrame(animate);
        breath += 0.02;
        if (!isDragging && !isSwinging) {
            targetRotY += velRotY; targetRotX += velRotX;
            velRotY *= 0.92; velRotX *= 0.92;
            targetRotX *= 0.96;
        }
        curRotY += (targetRotY - curRotY) * 0.14;
        curRotX += (targetRotX - curRotX) * 0.14;
        if (root && !isSwinging) {
            root.rotation.y = curRotY + Math.sin(breath * 0.5) * 0.015;
            root.rotation.x = curRotX;
            root.position.y = baseY + Math.sin(breath) * 0.006;
        }
        if (renderer) renderer.render(scene, camera);
    }

    function onResize() {
        if (!container || !camera || !renderer) return;
        const { w, h } = measure();
        camera.aspect = w / h; camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    // ---- Public API ------------------------------------------------------
    function deepMerge(dst, src) {
        for (const k in src) {
            if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
                dst[k] = deepMerge(dst[k] && typeof dst[k] === 'object' ? dst[k] : {}, src[k]);
            } else { dst[k] = src[k]; }
        }
        return dst;
    }

    function applyConfig(next) {
        if (!next) return;
        cfg = deepMerge(defaultConfig(), next);
        if (rig) rebuild();
    }
    function setCountry(code) {
        const c = (code || 'IN').toUpperCase();
        const k = kitFor(c);
        cfg.country = c;
        cfg.kit.base = k.base; cfg.kit.yoke = k.yoke; cfg.kit.trim = k.trim; cfg.kit.crest = k.crest;
        if (rig) rebuild();
    }
    function setFaceType(t) { if (t) cfg.face.type = t; if (rig) rebuild(); }
    function setSkinTone(hex) { if (hex) cfg.face.skin = hex; if (rig) rebuild(); }
    function setHair(style, color) { if (style) cfg.hair.style = style; if (color) cfg.hair.color = color; if (rig) rebuild(); }
    function setBeard(style, color) { if (style) cfg.beard.style = style; if (color) cfg.beard.color = color; if (rig) rebuild(); }
    function setKitColors(o) { if (o) Object.assign(cfg.kit, o); if (rig) rebuild(); }
    function setJersey(o) { if (o) Object.assign(cfg.kit, o); if (rig) rebuild(); }
    function setGear(part, o) { if (part && cfg.gear[part]) { Object.assign(cfg.gear[part], o || {}); if (rig) rebuild(); } }
    function setBatSkin(type) { cfg.bat.skin = type || 'willow'; if (rig) rebuild(); }
    function getConfig() { return JSON.parse(JSON.stringify(cfg)); }

    // catalogues + presets exposed for the customizer UI
    const CATALOG = { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, BEARD_STYLES, FACE_TYPES, kitFor, teamName };

    window.Hero3DBatsman = {
        init, dispose, applyConfig, getConfig,
        setCountry, setFaceType, setSkinTone, setHair, setBeard,
        setKitColors, setJersey, setGear, setBatSkin,
        triggerSwing, getSettings: getConfig, CATALOG
    };

})(window);
