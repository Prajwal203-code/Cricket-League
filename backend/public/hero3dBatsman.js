/**
 * Home and character-studio renderer.
 * Home uses the reconstructed shoulder-bat reference. The editable studio and
 * match equipment retain CricketPlayerRig and live jersey customization.
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
    let poseController = null;
    let loadGeneration = 0;
    let equipment = {};
    let batGroup = null;
    let currentJerseyTexture = null;
    let jerseyCanvas = null;
    let jerseyBaseImage = null;
    let isLoadingShannon = false;
    let referenceMode = false;
    let dragDistance = 0;
    let controlsAbort = null;

    // Interaction / Animation state
    let isDragging = false, startX = 0, startY = 0;
    let targetRotY = 0.62, curRotY = 0.62, velRotY = 0;
    let targetRotX = 0, curRotX = 0, velRotX = 0;
    let breath = 0, isSwinging = false, swingProgress = 0, animId = null;

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
        // Blade extends from y = -0.26 to -0.90 metres.
        const bladeGeo = new THREE.BoxGeometry(0.108, 0.64, 0.048);
        const willowMat = new THREE.MeshStandardMaterial({
            color: 0xd9b37a, // Natural Golden English Willow tint
            roughness: 0.48,
            metalness: 0.02
        });
        const blade = new THREE.Mesh(bladeGeo, willowMat);
        blade.position.y = -0.26 - 0.32;
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
        toe.position.set(0, -0.895, 0);
        bat.add(toe);

        return bat;
    }

    // 2. Realistic Contoured White PU Batting Pads (Snug fit to shins, no radiator slats!)
    function paddedBlock(width, height, depth, material) {
        const shape = new THREE.Shape();
        const x = -width / 2, y = -height / 2, r = Math.min(width, height) * .18;
        shape.moveTo(x + r, y);
        shape.lineTo(x + width - r, y);
        shape.quadraticCurveTo(x + width, y, x + width, y + r);
        shape.lineTo(x + width, y + height - r);
        shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        shape.lineTo(x + r, y + height);
        shape.quadraticCurveTo(x, y + height, x, y + height - r);
        shape.lineTo(x, y + r);
        shape.quadraticCurveTo(x, y, x + r, y);
        const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: .004,
            bevelSize: .004, bevelSegments: 2, steps: 1, curveSegments: 5 });
        geometry.translate(0, 0, -depth / 2);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        return mesh;
    }

    function createCricketPadMesh(isLeft) {
        const pad = new THREE.Group();
        pad.name = isLeft ? 'BattingPadLeft' : 'BattingPadRight';
        const white = new THREE.MeshStandardMaterial({ color: '#d9d8d1', roughness: .82 });
        const navy = new THREE.MeshStandardMaterial({ color: '#102647', roughness: .9 });
        pad.add(paddedBlock(.17, .48, .065, white));
        for (let i = -3; i <= 3; i++) {
            const rib = paddedBlock(.017, .32, .025, white);
            rib.position.set(i * .023, -.045, .04);
            pad.add(rib);
        }
        for (const y of [.125, .16]) {
            const roll = paddedBlock(.16, .025, .03, white);
            roll.position.set(0, y, .045);
            pad.add(roll);
        }
        for (const y of [-.14, .03, .17]) {
            const strap = paddedBlock(.18, .027, .02, navy);
            strap.position.set(0, y, -.04);
            pad.add(strap);
        }
        return pad;
    }

    function createBattingGlove() {
        const glove = new THREE.Group();
        const white = new THREE.MeshStandardMaterial({ color: '#e0ded5', roughness: .8 });
        glove.add(paddedBlock(.077, .075, .065, white));
        for (let i = 0; i < 4; i++) {
            const finger = paddedBlock(.015, .07, .035, white);
            finger.position.set((i - 1.5) * .019, 0, .038);
            glove.add(finger);
        }
        return glove;
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
            currentJerseyTexture.encoding = THREE.sRGBEncoding;
            currentJerseyTexture.anisotropy = 8;
        }
        currentJerseyTexture.needsUpdate = true;
        callback(currentJerseyTexture);
    }

    function applyJerseyTextureToModel() {
        if (!shannonMesh || referenceMode) return;
        const currentModel = shannonMesh;
        renderDynamicJersey(cfg.kit.number, cfg.kit.name, (tex) => {
            if (!tex || referenceMode || shannonMesh !== currentModel) return;
            shannonMesh.traverse((child) => {
                if (child.isSkinnedMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => {
                        const name = (m.name || '').toLowerCase();
                        if (name.includes('shirt') || name.includes('body') || name.includes('cloth') || !m.name) {
                            m.map = tex;
                            m.roughness = 0.62;
                            m.metalness = 0.05;
                            if (m.isMeshPhongMaterial) { m.shininess = 8; m.specular.setHex(0x151515); }
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
        if (renderer) dispose();
        container = document.getElementById(containerId);
        if (!container || !window.THREE) { console.error('❌ Hero3D: missing container or THREE'); return; }
        referenceMode = containerId === 'heroCharacterStage';
        targetRotY = curRotY = referenceMode ? 0 : .62;
        targetRotX = curRotX = velRotY = velRotX = 0;
        isDragging = isSwinging = false;
        swingProgress = 0;
        container.title = referenceMode ? 'Drag to rotate. Tap to return to the front.' : 'Drag to rotate. Tap to swing.';

        container.innerHTML = `
            <div class="hero-3d-stage-viewport" id="hero3dViewport" style="position:relative;width:100%;height:100%;overflow:hidden;">
                <canvas id="hero3dCanvas" tabindex="0" role="img" aria-label="Cricket player. Use the arrow keys to rotate and Home to reset the view." style="width:100%;height:100%;display:block;touch-action:none;"></canvas>
                <div id="hero3dStatus" role="status" style="position:absolute;top:15%;left:0;right:0;text-align:center;pointer-events:none;">Loading player…</div>
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
        renderer.toneMappingExposure = 0.92;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        scene = new THREE.Scene();

        try {
            pmrem = new THREE.PMREMGenerator(renderer);
            if (THREE.RoomEnvironment) {
                scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(renderer), 0.04).texture;
            }
        } catch (e) { console.warn('Hero3D: IBL unavailable', e); }

        if (referenceMode) {
            camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 100);
            camera.position.set(0, .85, 6);
            camera.lookAt(0, .85, 0);
            fitReferenceCamera(w, h);
        } else {
            camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
            camera.position.set(0, 1.00, 4.05);
            camera.lookAt(0, .84, 0);
        }

        root = new THREE.Group();
        root.position.x = referenceMode ? .045 : -.035;
        scene.add(root);

        setupLighting();

        rig = new THREE.Group();
        root.add(rig);

        // Load the appropriate home reference or editable studio model.
        rebuild();

        setupDragControls();
        window.addEventListener('resize', onResize);
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => onResize());
            ro.observe(container);
        }
        if (animId) cancelAnimationFrame(animId);
        animate();
        console.log('Hero3D player preview active');
    }

    function dispose() {
        try {
            loadGeneration++;
            isLoadingShannon = false;
            poseController = null;
            equipment = {};
            batGroup = null;
            controlsAbort?.abort();
            controlsAbort = null;
            if (animId) cancelAnimationFrame(animId);
            animId = null;
            if (ro) { ro.disconnect(); ro = null; }
            window.removeEventListener('resize', onResize);
            if (scene) {
                scene.environment?.dispose();
                disposeTree(scene);
            }
            pmrem?.dispose();
            pmrem = null;
            currentJerseyTexture = null;
            if (renderer) {
                renderer.dispose();
                const gl = renderer.getContext && renderer.getContext();
                const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
                if (lose) lose.loseContext();
            }
        } catch (e) { }
        try { if (container) container.innerHTML = ''; } catch (e2) { }
        scene = camera = renderer = rig = root = container = shannonMesh = shannonBones = null;
    }

    function measure() {
        const r = container.getBoundingClientRect();
        return { w: Math.round(r.width) || 360, h: Math.round(r.height) || 540 };
    }

    function setupLighting() {
        scene.add(new THREE.AmbientLight(0xffffff, 0.30));
        scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x20304a, 0.50));

        const key = new THREE.DirectionalLight(0xfff4e6, 1.8);
        key.position.set(2.6, 5.2, 4.2);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.near = 0.5; key.shadow.camera.far = 20;
        key.shadow.camera.left = -2.5; key.shadow.camera.right = 2.5;
        key.shadow.camera.top = 3.5; key.shadow.camera.bottom = -1;
        key.shadow.bias = -0.0004;
        scene.add(key);

        const fill = new THREE.DirectionalLight(0x93c5fd, .65);
        fill.position.set(-3.5, 2.0, 2.5);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0xffe8c2, 1.1);
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
        const textures = new Set();
        obj.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
                Object.values(m).forEach(value => { if (value?.isTexture) textures.add(value); });
                m.dispose();
            }); }
        });
        textures.forEach(texture => texture.dispose());
    }

    function fitReferenceCamera(w, h) {
        const aspect = w / h;
        const height = Math.max(2.65, 1.25 / aspect);
        camera.left = -height * aspect / 2;
        camera.right = height * aspect / 2;
        camera.top = height / 2;
        camera.bottom = -height / 2;
        camera.updateProjectionMatrix();
    }

    function loadReferencePlayer() {
        const generation = ++loadGeneration;
        const fail = (error) => {
            if (generation !== loadGeneration || !container) return;
            isLoadingShannon = false;
            console.error('Hero3D: could not load the reference GLB', error);
            const status = container.querySelector('#hero3dStatus');
            if (status) {
                status.textContent = 'Could not load the 3D player. ';
                status.style.pointerEvents = 'auto';
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.textContent = 'Retry';
                retry.style.cssText = 'min-height:44px;padding:8px 16px;cursor:pointer;';
                retry.onclick = (event) => {
                    event.stopPropagation();
                    status.textContent = 'Loading 3D player…';
                    status.style.pointerEvents = 'none';
                    rebuild();
                };
                status.appendChild(retry);
            }
        };
        if (!THREE.GLTFLoader) { fail(new Error('GLTFLoader is unavailable')); return; }
        new THREE.GLTFLoader().load('models/hero_reference_reconstruction.glb?v=2', (gltf) => {
            if (generation !== loadGeneration || !rig) { disposeTree(gltf.scene); return; }
            isLoadingShannon = false;
            shannonMesh = gltf.scene;
            shannonMesh.name = 'ReferenceShoulderBatPlayer';
            shannonMesh.traverse(child => {
                if (!child.isMesh) return;
                child.castShadow = true;
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(material => {
                    // The reference contains baked lighting; preserve its colors.
                    material.toneMapped = false;
                    if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
                });
            });
            rig.add(shannonMesh);
            container.querySelector('#hero3dStatus')?.remove();
        }, undefined, fail);
    }

    // =====================================================================
    // Rebuild: Load 3D Shannon model and mount equipment
    // =====================================================================
    function rebuild() {
        if (!rig || isLoadingShannon) return;
        if (shannonMesh) {
            if (!referenceMode) applyJerseyTextureToModel();
            return;
        }
        isLoadingShannon = true;
        if (referenceMode) { loadReferencePlayer(); return; }

        while (rig.children.length) {
            const c = rig.children.pop();
            rig.remove(c);
        }

        if (!THREE.FBXLoader) {
            isLoadingShannon = false;
            console.warn('⚠️ THREE.FBXLoader not ready for Hero3DBatsman');
            return;
        }

        const generation = ++loadGeneration;
        const loader = new THREE.FBXLoader();
        loader.load('models/shannon_idle.fbx', (fbx) => {
            if (generation !== loadGeneration || !rig) { disposeTree(fbx); return; }
            isLoadingShannon = false;
            shannonMesh = fbx;
            container.querySelector('#hero3dStatus')?.remove();
            shannonMesh.scale.setScalar(0.0104);
            rig.add(shannonMesh);

            // Use the imported neutral transforms; the bundled clip is a baseball idle.
            // The FBX has same-name helper joints for separate clothing meshes. The
            // pose controller targets the parent joints shared by body and clothing.
            equipment = createEquipment();
            Object.values(equipment).forEach(item => rig.add(item));
            batGroup = equipment.bat;
            poseController = window.CricketPlayerRig.create(shannonMesh, rig, equipment);
            shannonBones = poseController.bones;
            updateEquipment();
            applyJerseyTextureToModel();
            poseController.update(0, 0);
        }, undefined, () => {
            if (generation !== loadGeneration) return;
            isLoadingShannon = false;
            console.warn('Player model could not load. Reopen the player editor to retry.');
        });
    }

    function updateEquipment() {
        configureEquipment(equipment, cfg);
    }

    function configureEquipment(items, settings) {
        for (const side of ['left', 'right']) {
            if (items[`${side}Pad`]) items[`${side}Pad`].visible = settings.gear.pads?.on !== false;
            if (items[`${side}Glove`]) items[`${side}Glove`].visible = settings.gear.gloves?.on !== false;
        }
    }

    function createEquipment() {
        return { bat: createEnglishWillowBat(), leftPad: createCricketPadMesh(true), rightPad: createCricketPadMesh(false),
            leftGlove: createBattingGlove(), rightGlove: createBattingGlove() };
    }

    // =====================================================================
    // Interaction & Animation Loop
    // =====================================================================
    function setupDragControls() {
        controlsAbort = new AbortController();
        const options = { signal: controlsAbort.signal };
        container.addEventListener('pointerdown', (e) => {
            if (e.target.closest?.('button')) return;
            if (e.button !== 0) return;
            dragDistance = 0;
            isDragging = true; startX = e.clientX; startY = e.clientY; velRotY = velRotX = 0;
            container.setPointerCapture?.(e.pointerId);
        }, options);
        container.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            dragDistance += Math.abs(dx) + Math.abs(dy);
            startX = e.clientX; startY = e.clientY;
            targetRotY += dx * 0.012; targetRotX += dy * 0.006;
            targetRotX = Math.max(-0.18, Math.min(0.18, targetRotX));
            velRotY = dx * 0.010; velRotX = dy * 0.005;
        }, options);
        const up = (e) => {
            if (isDragging && e.type === 'pointerup' && dragDistance < 6) triggerSwing();
            isDragging = false;
        };
        container.addEventListener('pointerup', up, options);
        container.addEventListener('pointercancel', up, options);
        canvas.addEventListener('keydown', e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                velRotY = 0;
                targetRotY += e.key === 'ArrowLeft' ? -.15 : .15;
            } else if (e.key === 'Home') {
                e.preventDefault();
                resetView();
            }
        }, options);
    }

    function resetView() {
        targetRotY = referenceMode ? 0 : .62;
        targetRotX = velRotY = velRotX = 0;
    }

    function triggerSwing() {
        if (referenceMode) { resetView(); return; }
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
        if (document.hidden || !container?.isConnected || container.closest('.hidden')) {
            clock?.getDelta();
            return;
        }
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

        if (isSwinging) {
            swingProgress = Math.min(1, swingProgress + dt / 1.15);
            if (swingProgress >= 1) { isSwinging = false; swingProgress = 0; }
        }
        poseController?.update(elapsedTime, isSwinging ? swingProgress : 0);

        if (renderer && scene && camera) renderer.render(scene, camera);
    }

    function onResize() {
        if (!container || !camera || !renderer) return;
        const { w, h } = measure();
        if (referenceMode) fitReferenceCamera(w, h);
        else { camera.aspect = w / h; camera.updateProjectionMatrix(); }
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
        updateEquipment();

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
    function setGear(part, o) { if (part && cfg.gear[part]) { Object.assign(cfg.gear[part], o || {}); updateEquipment(); } }
    function setBatSkin(type) { cfg.bat.skin = type || 'willow'; }
    function getConfig() { return JSON.parse(JSON.stringify(cfg)); }

    const CATALOG = { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, BEARD_STYLES, FACE_TYPES, kitFor, teamName };

    window.Hero3DBatsman = {
        init, dispose, applyConfig, getConfig,
        setCountry, setFaceType, setSkinTone, setHair, setBeard,
        setKitColors, setJersey, setGear, setBatSkin,
        triggerSwing, getSettings: getConfig, CATALOG, createEquipment, configureEquipment
    };

    window.__hero3d = {
        getBones: () => shannonBones,
        getBat: () => batGroup,
        getMesh: () => shannonMesh,
        getCfg: () => cfg,
        getPose: () => poseController,
        getEquipment: () => equipment,
        applyConfig
    };

})(window);
