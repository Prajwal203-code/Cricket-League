/**
 * 🏏 Cricket League — Realistic 3D Human Cricketer Engine (Shannon)
 * ---------------------------------------------------------------------------
 * Features:
 * 1. Authentic 3D Rigged Human Athlete (Shannon) with realistic physique & anatomy.
 * 2. Official Team India Kit with dynamic user-customized Squad Number and Player Name.
 * 3. Authentic Grounded Cricket Batting Stance: hands at waist, bat pointing DOWN to turf.
 * 4. Rhythmic bat tapping on the pitch turf in the crease (tap... tap... pause... tap...).
 * 5. Professional contoured white PU leather batting pads (snug fit, knee rolls, velcro straps).
 * 6. English Willow cricket bat with chevron rubber grip and thick profile blade.
 * 7. Live real-time updates when user edits jersey name or number in Character Studio.
 */
(function (window) {
    'use strict';

    // ---- Country kit presets ----
    const KITS = {
        IN: { base: '#123f8c', yoke: '#ff6a1a', trim: '#facc15', crest: 'tricolor' },
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
    const DEFAULT_KIT = { base: '#123f8c', yoke: '#ff6a1a', trim: '#facc15', crest: 'tricolor' };
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
    function teamName(code) { return TEAM_NAMES[code] || String(code || 'INDIA').toUpperCase(); }

    const SKIN_TONES = ['#f3d3b5', '#eebd97', '#d9a066', '#c98a5e', '#a86b41', '#7a4a29', '#5a3620'];
    const HAIR_COLORS = ['#1a1208', '#2b1a0e', '#4a2e18', '#6b4423', '#8a6a3a', '#b8b8b8', '#e8e8e8', '#c0392b'];
    const HAIR_STYLES = ['bald', 'buzz', 'short', 'spiky', 'curly', 'fade', 'swept'];
    const BEARD_STYLES = ['none', 'stubble', 'boxed', 'goatee', 'full'];
    const FACE_TYPES = ['oval', 'square', 'round', 'long'];

    function defaultConfig() {
        let userNumber = 18;
        let userName = 'INDIA';
        try {
            const saved = localStorage.getItem('cricket_league_character_v1');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed?.kit?.number != null) userNumber = parsed.kit.number;
                if (parsed?.kit?.name) userName = parsed.kit.name;
            }
        } catch (e) {}

        return {
            v: 1, country: 'IN',
            face: { type: 'oval', skin: '#c98a5e' },
            hair: { style: 'short', color: '#1a1208' },
            beard: { style: 'stubble', color: '#1a1208' },
            kit: { base: '#123f8c', yoke: '#ff6a1a', trim: '#facc15', name: userName, number: userNumber, crest: 'tricolor' },
            gear: {
                helmet: { on: false, color: '#082046' }, // Off on home screen so real face is clearly visible!
                gloves: { on: true, color: '#f4f6f9' },
                pads: { on: true, color: '#f8fafc' },
                wristband: { on: true, color: '#ff6a1a' }
            },
            bat: { skin: 'willow', sticker: '#ff6a1a' }
        };
    }

    // Engine state
    let scene, camera, renderer, clock, pmrem;
    let container, canvas, root, rig, ro;
    let cfg = defaultConfig();

    // 3D Player Assets
    let shannonMesh = null;
    let shannonBones = null;
    let shannonMixer = null;
    let batGroup = null;
    let currentJerseyTexture = null;
    let jerseyCanvas = null;
    let jerseyBaseImage = null;
    let isLoadingShannon = false;

    // Interaction / Animation state
    let isDragging = false, startX = 0, startY = 0;
    let targetRotY = -0.32, curRotY = -0.32, velRotY = 0;
    let targetRotX = 0, curRotX = 0, velRotX = 0;
    let breath = 0, baseY = 0, isSwinging = false, swingProgress = 0, animId = null;

    // =====================================================================
    // Authentic International Cricket Equipment Builders
    // =====================================================================

    // 1. English Willow Bat with Rubber Grip & Thick Edges
    function createEnglishWillowBat() {
        const bat = new THREE.Group();
        bat.name = "EnglishWillowBat";

        // Cane Handle with Royal Navy Chevron Rubber Grip
        // Origin (0,0,0) is TOP of handle. Extends down along -Y to -0.26m
        const handleGeo = new THREE.CylinderGeometry(0.015, 0.016, 0.26, 16);
        const handleMat = new THREE.MeshStandardMaterial({
            color: 0x0f2d59, // Navy Blue Rubber Grip
            roughness: 0.58,
            metalness: 0.05
        });
        const handle = new THREE.Mesh(handleGeo, handleMat);
        handle.position.y = -0.13;
        handle.castShadow = true;
        bat.add(handle);

        // White rubber spiral rings on handle
        for (let r = 0; r < 4; r++) {
            const ringGeo = new THREE.TorusGeometry(0.016, 0.002, 8, 16);
            const ringMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.y = -0.05 - r * 0.05;
            ring.rotation.x = Math.PI / 2;
            bat.add(ring);
        }

        // Willow Blade (International Grade 1 English Willow)
        // Starts at y = -0.26 and extends down to y = -0.84m (total 0.84m standard)
        const bladeGeo = new THREE.BoxGeometry(0.108, 0.58, 0.048);
        const willowMat = new THREE.MeshStandardMaterial({
            color: 0xd9b37a, // Natural Golden English Willow tint
            roughness: 0.48,
            metalness: 0.02
        });
        const blade = new THREE.Mesh(bladeGeo, willowMat);
        blade.position.y = -0.26 - 0.29; // -0.55m
        blade.castShadow = true;
        blade.receiveShadow = true;
        bat.add(blade);

        // Bat Sponsor / Team India Decal Sticker on Face
        const stickerGeo = new THREE.PlaneGeometry(0.086, 0.18);
        const stickerMat = new THREE.MeshStandardMaterial({
            color: 0x0d3b7c, // Team India Royal Blue sticker
            roughness: 0.35,
            metalness: 0.1
        });
        const sticker = new THREE.Mesh(stickerGeo, stickerMat);
        sticker.position.set(0, -0.42, 0.025);
        bat.add(sticker);

        // Rubber Toe Guard at bottom of blade
        const toeGeo = new THREE.BoxGeometry(0.109, 0.015, 0.049);
        const toeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
        const toe = new THREE.Mesh(toeGeo, toeMat);
        toe.position.set(0, -0.835, 0);
        bat.add(toe);

        return bat;
    }

    // 2. Realistic Contoured White PU Batting Pads (Snug fit to shins, no radiator slats!)
    function createCricketPadMesh(isLeft) {
        const pad = new THREE.Group();
        pad.name = isLeft ? "Pad_Left" : "Pad_Right";

        const whiteMat = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            roughness: 0.35,
            metalness: 0.04
        });
        const strapMat = new THREE.MeshStandardMaterial({
            color: 0x0f2d59, // Navy Blue Velcro Straps
            roughness: 0.65,
            metalness: 0.02
        });
        const goldMat = new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            roughness: 0.40,
            metalness: 0.30
        });

        // 1. Main Curved Shin Shield (Smooth PU Leather Face)
        // Cylinder arc covering front 120 degrees of shin
        const shinGeo = new THREE.CylinderGeometry(0.082, 0.072, 0.44, 24, 1, false, -Math.PI * 0.33, Math.PI * 0.66);
        const shin = new THREE.Mesh(shinGeo, whiteMat);
        shin.castShadow = true;
        shin.receiveShadow = true;
        pad.add(shin);

        // 2. Padded Knee Roll (3 horizontal rounded rolls over knee cap)
        for (let k = -1; k <= 1; k++) {
            const rollGeo = new THREE.TorusGeometry(0.085, 0.012, 10, 20, Math.PI * 0.65);
            const roll = new THREE.Mesh(rollGeo, whiteMat);
            roll.position.set(0, 0.11 + k * 0.024, 0);
            roll.rotation.set(Math.PI / 2, 0, -Math.PI * 0.325);
            roll.castShadow = true;
            pad.add(roll);
        }

        // 3. Top Hat (Curved upper flap protecting lower thigh)
        const topGeo = new THREE.CylinderGeometry(0.088, 0.084, 0.09, 20, 1, false, -Math.PI * 0.30, Math.PI * 0.60);
        const topHat = new THREE.Mesh(topGeo, whiteMat);
        topHat.position.set(0, 0.20, 0);
        topHat.castShadow = true;
        pad.add(topHat);

        // Gold pinstripe accent across top hat
        const trimGeo = new THREE.TorusGeometry(0.089, 0.0035, 8, 20, Math.PI * 0.60);
        const trim = new THREE.Mesh(trimGeo, goldMat);
        trim.position.set(0, 0.24, 0);
        trim.rotation.set(Math.PI / 2, 0, -Math.PI * 0.30);
        pad.add(trim);

        // 4. Velcro Straps (3 navy straps wrapping around calf)
        const strapHeights = [-0.13, 0.02, 0.16];
        strapHeights.forEach(sh => {
            const strapGeo = new THREE.TorusGeometry(0.076, 0.006, 8, 24, Math.PI * 1.30);
            const strap = new THREE.Mesh(strapGeo, strapMat);
            strap.position.set(0, sh, 0);
            strap.rotation.set(Math.PI / 2, 0, Math.PI * 0.35);
            pad.add(strap);
        });

        return pad;
    }

    // Dynamic Team India Jersey Texture Generator with User Number & Name
    function renderDynamicJersey(userNumber, userName, callback) {
        if (!jerseyBaseImage) {
            jerseyBaseImage = new Image();
            jerseyBaseImage.crossOrigin = 'anonymous';
            jerseyBaseImage.onload = () => drawJerseyCanvas(userNumber, userName, callback);
            jerseyBaseImage.onerror = () => callback(null);
            jerseyBaseImage.src = 'models/shannon_tex/shannon_india_clean.png';
        } else {
            drawJerseyCanvas(userNumber, userName, callback);
        }
    }

    function drawJerseyCanvas(userNumber, userName, callback) {
        if (!jerseyCanvas) {
            jerseyCanvas = document.createElement('canvas');
            jerseyCanvas.width = jerseyBaseImage.width || 4096;
            jerseyCanvas.height = jerseyBaseImage.height || 4096;
        }
        const ctx = jerseyCanvas.getContext('2d');
        ctx.drawImage(jerseyBaseImage, 0, 0);

        const scale = jerseyCanvas.width / 4096;
        const cx = 2363 * scale;
        const cy = 2960 * scale;
        const fontPx = Math.round(520 * scale);
        const namePx = Math.round(160 * scale);

        // 1. Wipe previous number with Team India Royal Blue
        ctx.fillStyle = '#0d3982';
        ctx.fillRect(2100 * scale, 2600 * scale, 550 * scale, 850 * scale);

        // 2. Draw Dynamic Player Name (Upper back across shoulders)
        const nameStr = String(userName || 'INDIA').toUpperCase();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${namePx}px "Barlow", "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(nameStr, cx, 2660 * scale);

        // 3. Draw Dynamic Player Squad Number with Gold Piping (Large on back)
        const numStr = String(userNumber != null ? userNumber : 18);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 18 * scale;
        ctx.font = `900 ${fontPx}px "Teko", "Barlow", Arial, sans-serif`;
        ctx.strokeText(numStr, cx, cy + 20 * scale);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(numStr, cx, cy + 20 * scale);

        // 4. Draw Front Chest Squad Number (BCCI official style)
        const frontCx = 1000 * scale;
        const frontCy = 1180 * scale;
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 6 * scale;
        ctx.font = `900 ${Math.round(140 * scale)}px "Teko", "Barlow", Arial, sans-serif`;
        ctx.strokeText(numStr, frontCx, frontCy);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(numStr, frontCx, frontCy);

        if (!currentJerseyTexture) {
            currentJerseyTexture = new THREE.CanvasTexture(jerseyCanvas);
            currentJerseyTexture.anisotropy = 8;
        }
        currentJerseyTexture.needsUpdate = true;
        callback(currentJerseyTexture);
    }

    function applyJerseyTextureToModel() {
        if (!shannonMesh) return;
        renderDynamicJersey(cfg.kit.number, cfg.kit.name, (tex) => {
            if (!tex) return;
            shannonMesh.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => {
                        const name = (m.name || '').toLowerCase();
                        if (name.includes('shirt') || name.includes('body') || name.includes('cloth') || !m.name) {
                            m.map = tex;
                            m.roughness = 0.62;
                            m.metalness = 0.05;
                            m.needsUpdate = true;
                        }
                    });
                }
            });
        });
    }

    // =====================================================================
    // Lifecycle: init
    // =====================================================================
    function init(canvasId, containerId) {
        container = document.getElementById(containerId);
        if (!container || !window.THREE) { console.error('❌ Hero3D: missing container or THREE'); return; }

        container.innerHTML = `
            <div class="hero-3d-stage-viewport" id="hero3dViewport" style="position:relative;width:100%;height:100%;overflow:hidden;">
                <canvas id="hero3dCanvas" style="width:100%;height:100%;display:block;outline:none;touch-action:none;"></canvas>
                <div class="hero-3d-ground-shadow"></div>
                <div class="hero-character-aura"></div>
                <div class="practice-toast hidden" id="practiceToast">POWERFUL SHOT! 🏏🔥</div>
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

        scene = new THREE.Scene();

        try {
            pmrem = new THREE.PMREMGenerator(renderer);
            if (THREE.RoomEnvironment) {
                scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(renderer), 0.04).texture;
            }
        } catch (e) { console.warn('Hero3D: IBL unavailable', e); }

        camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
        camera.position.set(0, 1.00, 3.75);
        camera.lookAt(0, 0.90, 0);

        root = new THREE.Group();
        root.position.x = 0.18; // offset clear of left-hand UI buttons
        scene.add(root);

        setupLighting();

        rig = new THREE.Group();
        root.add(rig);

        // Load realistic Shannon Cricketer
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
        console.log('✅ Hero3D Realistic Cricketer (Shannon) active');
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
        } catch (e) { }
        try { if (container) container.innerHTML = ''; } catch (e2) { }
        scene = camera = renderer = rig = root = container = shannonMesh = shannonBones = shannonMixer = null;
    }

    function measure() {
        const r = container.getBoundingClientRect();
        return { w: Math.round(r.width) || 360, h: Math.round(r.height) || 540 };
    }

    function setupLighting() {
        scene.add(new THREE.AmbientLight(0xffffff, 0.45));
        scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x20304a, 0.50));

        const key = new THREE.DirectionalLight(0xfff4e6, 2.8);
        key.position.set(2.6, 5.2, 4.2);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.near = 0.5; key.shadow.camera.far = 20;
        key.shadow.camera.left = -2.5; key.shadow.camera.right = 2.5;
        key.shadow.camera.top = 3.5; key.shadow.camera.bottom = -1;
        key.shadow.bias = -0.0004;
        scene.add(key);

        const fill = new THREE.DirectionalLight(0x93c5fd, 1.2);
        fill.position.set(-3.5, 2.0, 2.5);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0xffe8c2, 2.0);
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

    function disposeTree(obj) {
        if (!obj) return;
        obj.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }
        });
    }

    // =====================================================================
    // Rebuild: Load 3D Shannon model and mount equipment
    // =====================================================================
    function rebuild() {
        if (!rig || isLoadingShannon) return;
        if (shannonMesh) {
            applyJerseyTextureToModel();
            return;
        }
        isLoadingShannon = true;

        while (rig.children.length) {
            const c = rig.children.pop();
            rig.remove(c);
        }

        if (!THREE.FBXLoader) {
            isLoadingShannon = false;
            console.warn('⚠️ THREE.FBXLoader not ready for Hero3DBatsman');
            return;
        }

        const loader = new THREE.FBXLoader();
        loader.load('models/shannon_idle.fbx', (fbx) => {
            isLoadingShannon = false;
            while (rig.children.length) {
                const c = rig.children.pop();
                rig.remove(c);
            }
            shannonMesh = fbx;
            shannonMesh.scale.setScalar(0.0104);
            shannonMesh.position.set(0, 0, 0);

            // Setup Animation Mixer
            if (fbx.animations && fbx.animations.length > 0) {
                shannonMixer = new THREE.AnimationMixer(fbx);
                const idleAction = shannonMixer.clipAction(fbx.animations[0]);
                idleAction.play();
            }

            // Map skeleton bones
            shannonBones = {};
            shannonMesh.traverse((child) => {
                if (child.isBone) {
                    const name = (child.name || '').toLowerCase();
                    if (name.includes('head') && !name.includes('top')) shannonBones.head = child;
                    else if (name.includes('neck')) shannonBones.neck = child;
                    else if (name.includes('spine2')) shannonBones.spine2 = child;
                    else if (name.includes('spine')) shannonBones.spine = child;
                    else if (name.includes('hips')) shannonBones.hips = child;
                    else if (name.includes('rightarm') && !name.includes('fore')) shannonBones.rightArm = child;
                    else if (name.includes('leftarm') && !name.includes('fore')) shannonBones.leftArm = child;
                    else if (name.includes('rightforearm')) shannonBones.rightForeArm = child;
                    else if (name.includes('leftforearm')) shannonBones.leftForeArm = child;
                    else if (name.includes('righthand') && !name.includes('finger')) shannonBones.rightHand = child;
                    else if (name.includes('lefthand') && !name.includes('finger')) shannonBones.leftHand = child;
                    else if (name.includes('rightleg') && !name.includes('up')) shannonBones.rightLeg = child;
                    else if (name.includes('leftleg') && !name.includes('up')) shannonBones.leftLeg = child;
                    else if (name.includes('rightupleg')) shannonBones.rightUpLeg = child;
                    else if (name.includes('leftupleg')) shannonBones.leftUpLeg = child;
                }
            });

            const boneScale = 1.0 / 0.0104; // 96.15

            // 1. High-Quality Contoured White PU Batting Pads (Snug on shins!)
            if (cfg.gear.pads?.on !== false) {
                if (shannonBones.leftLeg) {
                    const padL = createCricketPadMesh(true);
                    padL.scale.setScalar(boneScale * 0.88);
                    padL.position.set(0, -22, 5.0);
                    padL.rotation.set(0, 0, 0);
                    shannonBones.leftLeg.add(padL);
                }
                if (shannonBones.rightLeg) {
                    const padR = createCricketPadMesh(false);
                    padR.scale.setScalar(boneScale * 0.88);
                    padR.position.set(0, -22, 5.0);
                    padR.rotation.set(0, 0, 0);
                    shannonBones.rightLeg.add(padR);
                }
            }

            // 2. English Willow Cricket Bat in Hand Grip (Grounded pointing down!)
            batGroup = createEnglishWillowBat();
            batGroup.scale.setScalar(boneScale);
            if (shannonBones.rightHand) {
                shannonBones.rightHand.add(batGroup);
                batGroup.position.set(0, -4, 0);
                batGroup.rotation.set(0.12, 0.05, -0.10);
            }

            // Apply Dynamic Team India Royal Blue Jersey with user number & name
            applyJerseyTextureToModel();

            rig.add(shannonMesh);
        });
    }

    // =====================================================================
    // Interaction & Animation Loop
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
        swingProgress = 0;
        const toast = document.getElementById('practiceToast');
        if (toast) {
            toast.textContent = 'POWERFUL SHOT! 🏏🔥';
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 1400);
        }
    }

    function animate() {
        animId = requestAnimationFrame(animate);
        const dt = clock ? Math.min(clock.getDelta(), 0.1) : 0.016;
        const elapsedTime = clock ? clock.getElapsedTime() : breath;
        breath += 0.02;

        if (!isDragging && !isSwinging) {
            targetRotY += velRotY; targetRotX += velRotX;
            velRotY *= 0.92; velRotX *= 0.92;
            targetRotX *= 0.96;
        }
        curRotY += (targetRotY - curRotY) * 0.14;
        curRotX += (targetRotX - curRotX) * 0.14;

        if (root) {
            root.rotation.y = curRotY;
            root.rotation.x = curRotX;
        }

        // Mocap animation update (provides breathing & spine motion)
        if (shannonMixer && !isSwinging) {
            shannonMixer.update(dt);
        }

        if (isSwinging) {
            swingProgress += dt * 3.4;
            if (shannonBones) {
                // Dynamic cricket drive / lofted shot
                if (swingProgress < 0.35) {
                    const p = swingProgress / 0.35;
                    if (shannonBones.rightArm) shannonBones.rightArm.rotation.set(0.35 - p * 0.6, -0.15, -1.25 + p * 1.8);
                    if (shannonBones.leftArm) shannonBones.leftArm.rotation.set(0.38 - p * 0.5, 0.20, 1.25 - p * 1.5);
                    if (batGroup) batGroup.rotation.x = 0.12 - p * 1.4;
                } else if (swingProgress < 0.75) {
                    const p = (swingProgress - 0.35) / 0.40;
                    if (shannonBones.rightArm) shannonBones.rightArm.rotation.set(-0.25 + p * 1.5, -0.15, 0.55 - p * 1.2);
                    if (shannonBones.leftArm) shannonBones.leftArm.rotation.set(-0.12 + p * 1.2, 0.20, -0.25 + p * 1.0);
                    if (batGroup) batGroup.rotation.x = -1.28 + p * 2.8;
                } else if (swingProgress < 1.0) {
                    const p = (swingProgress - 0.75) / 0.25;
                    if (shannonBones.rightArm) shannonBones.rightArm.rotation.set(1.25 - p * 0.90, -0.15, -0.65 - p * 0.60);
                    if (shannonBones.leftArm) shannonBones.leftArm.rotation.set(1.08 - p * 0.70, 0.20, 0.75 + p * 0.50);
                    if (batGroup) batGroup.rotation.x = 1.52 - p * 1.40;
                } else {
                    isSwinging = false;
                }
            } else {
                if (swingProgress > 1.0) isSwinging = false;
            }
        } else {
            // AUTHENTIC CRICKET BATSMAN IDLE:
            // Hands held down at waist/crease, bat grounded tapping the turf!
            const tapPeriod = 1.4;
            const tapTime = elapsedTime % tapPeriod;
            let tapAngle = 0;
            if (tapTime < 0.22) {
                tapAngle = Math.sin(tapTime / 0.22 * Math.PI) * 0.12;
            } else if (tapTime > 0.38 && tapTime < 0.60) {
                tapAngle = Math.sin((tapTime - 0.38) / 0.22 * Math.PI) * 0.12;
            }

            if (shannonBones) {
                // 1. Narrow legs from wide baseball split into balanced athletic cricket stance
                if (shannonBones.rightUpLeg) shannonBones.rightUpLeg.rotation.z = 0.14;
                if (shannonBones.leftUpLeg) shannonBones.leftUpLeg.rotation.z = -0.14;

                // 2. Hands lowered DOWN to waist level holding the bat handle
                // Right Arm (bottom hand on grip near groin/hip)
                if (shannonBones.rightArm) {
                    shannonBones.rightArm.rotation.set(0.35, -0.15, -1.25);
                }
                if (shannonBones.rightForeArm) {
                    shannonBones.rightForeArm.rotation.set(0.18, 0.10, 0.70 + tapAngle * 0.35);
                }
                if (shannonBones.rightHand) {
                    shannonBones.rightHand.rotation.set(0.12, 0.08, 0.08);
                }

                // Left Arm (top hand on grip)
                if (shannonBones.leftArm) {
                    shannonBones.leftArm.rotation.set(0.38, 0.20, 1.25);
                }
                if (shannonBones.leftForeArm) {
                    shannonBones.leftForeArm.rotation.set(0.15, -0.10, -0.65);
                }

                // 3. Head turned looking over front shoulder towards camera / bowler
                if (shannonBones.head) {
                    shannonBones.head.rotation.set(-0.05, 0.32, 0);
                }

                // 4. Bat blade grounded on pitch turf, tapping rhythmically
                if (batGroup) {
                    batGroup.position.set(0, -4, 0);
                    batGroup.rotation.set(0.12 - tapAngle * 0.55, 0.05, -0.10);
                }

                if (root) {
                    root.position.y = baseY + Math.sin(breath) * 0.006;
                }
            }
        }

        if (renderer && scene && camera) renderer.render(scene, camera);
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
        const prevNumber = cfg.kit.number;
        const prevName = cfg.kit.name;
        cfg = deepMerge(defaultConfig(), next);

        // Instant dynamic texture update if number or name changed
        if (cfg.kit.number !== prevNumber || cfg.kit.name !== prevName) {
            applyJerseyTextureToModel();
        } else if (!shannonMesh && rig) {
            rebuild();
        }
    }

    function setCountry(code) {
        const c = (code || 'IN').toUpperCase();
        const k = kitFor(c);
        cfg.country = c;
        cfg.kit.base = k.base; cfg.kit.yoke = k.yoke; cfg.kit.trim = k.trim; cfg.kit.crest = k.crest;
        applyJerseyTextureToModel();
    }

    function setFaceType(t) { if (t) cfg.face.type = t; }
    function setSkinTone(hex) { if (hex) cfg.face.skin = hex; }
    function setHair(style, color) { if (style) cfg.hair.style = style; if (color) cfg.hair.color = color; }
    function setBeard(style, color) { if (style) cfg.beard.style = style; if (color) cfg.beard.color = color; }
    function setKitColors(o) { if (o) Object.assign(cfg.kit, o); applyJerseyTextureToModel(); }
    function setJersey(o) { if (o) Object.assign(cfg.kit, o); applyJerseyTextureToModel(); }
    function setGear(part, o) { if (part && cfg.gear[part]) { Object.assign(cfg.gear[part], o || {}); } }
    function setBatSkin(type) { cfg.bat.skin = type || 'willow'; }
    function getConfig() { return JSON.parse(JSON.stringify(cfg)); }

    const CATALOG = { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, BEARD_STYLES, FACE_TYPES, kitFor, teamName };

    window.Hero3DBatsman = {
        init, dispose, applyConfig, getConfig,
        setCountry, setFaceType, setSkinTone, setHair, setBeard,
        setKitColors, setJersey, setGear, setBatSkin,
        triggerSwing, getSettings: getConfig, CATALOG
    };

    window.__hero3d = {
        getBones: () => shannonBones,
        getBat: () => batGroup,
        getMesh: () => shannonMesh,
        getCfg: () => cfg,
        applyConfig
    };

})(window);
