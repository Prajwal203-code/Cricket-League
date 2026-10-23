/**
 * 🏏 Match3DEngine — Real-Time 3D In-Match Cricket Engine
 * =======================================================
 * Powers the live 3D gameplay match screen matching the reference screenshots:
 * - 3D Realistic Cricket Pitch with dirt strip & white crease lines
 * - 3D Stadium with stands, animated crowd, floodlights & "CLOUD net" boundary hoardings
 * - 3D LED Stumps with glowing bails at batting and bowling ends
 * - Rigged batsman with shared cricket stance, two-handed grip, pads and gloves
 * - 3D Bowler at the opposite crease delivering the ball
 * - 3D Ball physics with bounce, seam rotation, and boundary trajectory
 * - 3 Camera Perspectives: 'batting' (Image 4), 'bowling' (Image 3), 'celebration' (Image 2)
 * - Interactive bat swings on LOFT, COVER, STRAIGHT, LEG, DEFEND
 */

(function (window) {
    'use strict';

    let container = null;
    let canvas = null;
    let scene = null;
    let camera = null;
    let renderer = null;
    let clock = null;
    let animId = null;

    // Entities
    let stadiumGroup = null;
    let pitchMesh = null;
    let stumpsBatting = null;
    let stumpsBowling = null;
    let batsmanRig = null;
    let bowlerRig = null;
    let cricketBall = null;
    let ballShadow = null;

    // Animation & State
    let cameraMode = 'batting'; // 'batting', 'bowling', 'celebration'
    let isSwinging = false;
    let isBallInFlight = false;
    let ballProgress = 0;
    let ballTrajectory = null;
    let swingProgress = 0;
    let swingType = 'Straight';
    let celebrationActive = false;
    let celebrationTime = 0;
    let bowlerRunupProgress = 0;
    let isBowling = false;
    let incomingDelivery = null;

    function init(canvasId, containerId) {
        container = document.getElementById(containerId);
        canvas = document.getElementById(canvasId);
        if (!container || !canvas || !window.THREE) {
            console.error('❌ Match3DEngine: missing container, canvas or THREE.js');
            return;
        }

        // Reconnects and subsequent matches reuse the scene and its loaded assets.
        if (renderer) {
            isSwinging = false;
            isBallInFlight = false;
            celebrationActive = false;
            incomingDelivery = null;
            syncPlayerConfig();
            onResize();
            return;
        }

        // Clean any existing loop
        if (animId) { cancelAnimationFrame(animId); animId = null; }

        const w = container.clientWidth || 375;
        const h = container.clientHeight || 550;

        // Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0284c7); // Sky blue
        scene.fog = new THREE.FogExp2(0x0284c7, 0.012);

        // Clock
        clock = new THREE.Clock();

        // Camera
        camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 300);
        setCameraMode('batting');

        // Renderer
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;

        // Build 3D World
        setupLighting();
        buildStadium();
        buildPitch();
        buildStumps();
        buildBatsman();
        buildBowler();
        buildBall();

        // Start render loop
        animate();

        // Resize handler
        window.addEventListener('resize', onResize);
        new ResizeObserver(onResize).observe(container);
        console.log('✅ Match3DEngine: Live 3D match viewport initialized successfully!');
    }

    function onResize() {
        if (!container || !renderer || !camera) return;
        const w = container.clientWidth || 375;
        const h = container.clientHeight || 550;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    // -------------------------------------------------------------
    // LIGHTING SETUP
    // -------------------------------------------------------------
    function setupLighting() {
        // Warm Sun Key Light
        const sun = new THREE.DirectionalLight(0xfffaed, 1.8);
        sun.position.set(15, 30, 20);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 80;
        sun.shadow.camera.left = -15;
        sun.shadow.camera.right = 15;
        sun.shadow.camera.top = 25;
        sun.shadow.camera.bottom = -15;
        sun.shadow.bias = -0.001;
        scene.add(sun);

        // Hemisphere Light (Sky Blue + Turf Green)
        const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x166534, 1.1);
        scene.add(hemi);

        // Stadium Floodlight Accents
        const flood1 = new THREE.PointLight(0xffffff, 0.8, 60);
        flood1.position.set(-25, 20, 25);
        scene.add(flood1);

        const flood2 = new THREE.PointLight(0xffffff, 0.8, 60);
        flood2.position.set(25, 20, 25);
        scene.add(flood2);
    }

    // -------------------------------------------------------------
    // 3D STADIUM, FIELD & BOUNDARY HOARDINGS
    // -------------------------------------------------------------
    function buildStadium() {
        stadiumGroup = new THREE.Group();
        scene.add(stadiumGroup);

        // 1. Lush Outfield Grass (Radius 60m)
        const grassGeo = new THREE.CircleGeometry(65, 48);
        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x15803d,
            roughness: 0.85,
            metalness: 0.05
        });
        const grass = new THREE.Mesh(grassGeo, grassMat);
        grass.rotation.x = -Math.PI / 2;
        grass.receiveShadow = true;
        stadiumGroup.add(grass);

        // Grass Ring Pattern (Mowed turf rings)
        for (let r = 12; r < 60; r += 8) {
            const ringGeo = new THREE.RingGeometry(r, r + 4, 48);
            const ringMat = new THREE.MeshStandardMaterial({
                color: 0x16a34a,
                roughness: 0.88
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.01;
            ring.receiveShadow = true;
            stadiumGroup.add(ring);
        }

        // 2. Stadium Advertising Hoardings ("CLOUD net • CORE NETWORK • ENERGY SPORT")
        const hoardingCanvas = document.createElement('canvas');
        hoardingCanvas.width = 1024;
        hoardingCanvas.height = 128;
        const ctx = hoardingCanvas.getContext('2d');
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(0, 0, 1024, 128);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CLOUD net  •  CORE NETWORK  •  ENERGY SPORT  •  CRICKET LEAGUE', 512, 64);

        const hoardingTex = new THREE.CanvasTexture(hoardingCanvas);
        hoardingTex.wrapS = THREE.RepeatWrapping;
        hoardingTex.repeat.set(6, 1);

        const hoardGeo = new THREE.CylinderGeometry(50, 50, 2.2, 48, 1, true);
        const hoardMat = new THREE.MeshStandardMaterial({
            map: hoardingTex,
            side: THREE.BackSide,
            roughness: 0.4
        });
        const hoard = new THREE.Mesh(hoardGeo, hoardMat);
        hoard.position.set(0, 1.1, 0);
        stadiumGroup.add(hoard);

        // 3. Stadium Tiered Grandstands with Crowd
        const crowdGeo = new THREE.CylinderGeometry(62, 52, 16, 48, 4, true);
        const crowdCanvas = document.createElement('canvas');
        crowdCanvas.width = 512;
        crowdCanvas.height = 256;
        const cCtx = crowdCanvas.getContext('2d');
        cCtx.fillStyle = '#1e293b';
        cCtx.fillRect(0, 0, 512, 256);
        // Stippled crowd dots
        const colors = ['#38bdf8', '#fb923c', '#22c55e', '#facc15', '#f43f5e', '#e2e8f0'];
        for (let i = 0; i < 4000; i++) {
            cCtx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            cCtx.fillRect(Math.random() * 512, Math.random() * 256, 4, 4);
        }
        const crowdTex = new THREE.CanvasTexture(crowdCanvas);
        crowdTex.wrapS = THREE.RepeatWrapping;
        crowdTex.repeat.set(8, 2);

        const crowdMat = new THREE.MeshStandardMaterial({
            map: crowdTex,
            side: THREE.BackSide,
            roughness: 0.9
        });
        const stands = new THREE.Mesh(crowdGeo, crowdMat);
        stands.position.set(0, 8.5, 0);
        stadiumGroup.add(stands);
    }

    // -------------------------------------------------------------
    // 3D CRICKET PITCH (Dirt Strip + Crease Lines + Batting Circle)
    // -------------------------------------------------------------
    function buildPitch() {
        const pitchGroup = new THREE.Group();
        scene.add(pitchGroup);

        // Pitch Dimensions (Length: 20m along Z, Width: 3.2m along X)
        const pitchGeo = new THREE.PlaneGeometry(3.4, 22);
        const pitchMat = new THREE.MeshStandardMaterial({
            color: 0xca8a04, // Rich clay/turf
            roughness: 0.88,
            metalness: 0.02
        });
        pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
        pitchMesh.rotation.x = -Math.PI / 2;
        pitchMesh.position.set(0, 0.02, 0);
        pitchMesh.receiveShadow = true;
        pitchGroup.add(pitchMesh);

        // Crease Lines Material
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // Batting Crease (Z = -8.5)
        const batCrease = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.12), lineMat);
        batCrease.rotation.x = -Math.PI / 2;
        batCrease.position.set(0, 0.03, -8.5);
        pitchGroup.add(batCrease);

        // Batting Stance Circle (Dotted circle on pitch)
        const circleGeo = new THREE.RingGeometry(0.85, 0.95, 32);
        const circleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
        const batCircle = new THREE.Mesh(circleGeo, circleMat);
        batCircle.rotation.x = -Math.PI / 2;
        batCircle.position.set(0, 0.035, -8.0);
        pitchGroup.add(batCircle);

        // Bowling Crease (Z = +8.5)
        const bowlCrease = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.12), lineMat);
        bowlCrease.rotation.x = -Math.PI / 2;
        bowlCrease.position.set(0, 0.03, 8.5);
        pitchGroup.add(bowlCrease);
    }

    // -------------------------------------------------------------
    // 3D LED STUMPS & GLOWING BAILS
    // -------------------------------------------------------------
    function createStumpsSet(isBattingEnd) {
        const group = new THREE.Group();
        const stumpMat = new THREE.MeshStandardMaterial({
            color: isBattingEnd ? 0x1d4ed8 : 0x0284c7,
            roughness: 0.25,
            metalness: 0.8
        });

        // 3 Stumps
        for (let i = -1; i <= 1; i++) {
            const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 12), stumpMat);
            stump.position.set(i * 0.11, 0.36, 0);
            stump.castShadow = true;
            group.add(stump);
        }

        // 2 Glowing LED Bails
        const bailMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            emissiveIntensity: 0.8,
            roughness: 0.2
        });
        const bail1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 8), bailMat);
        bail1.rotation.z = Math.PI / 2;
        bail1.position.set(-0.055, 0.73, 0);
        group.add(bail1);

        const bail2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 8), bailMat);
        bail2.rotation.z = Math.PI / 2;
        bail2.position.set(0.055, 0.73, 0);
        group.add(bail2);

        return group;
    }

    function buildStumps() {
        stumpsBatting = createStumpsSet(true);
        stumpsBatting.position.set(0, 0, -9.0);
        scene.add(stumpsBatting);

        stumpsBowling = createStumpsSet(false);
        stumpsBowling.position.set(0, 0, 9.0);
        scene.add(stumpsBowling);
    }

    // -------------------------------------------------------------
    // PROCEDURAL PBR TEXTURE GENERATORS (ENTERPRISE GRADE)
    // -------------------------------------------------------------
    function createJerseyTexture() {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 512;
        const ctx = c.getContext('2d');

        // India Royal Navy Base with subtle micro-hex athletic weave
        const grad = ctx.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, '#0a235c');
        grad.addColorStop(0.5, '#071b48');
        grad.addColorStop(1, '#051438');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);

        // Micro-mesh texture dots
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for (let y = 0; y < 512; y += 8) {
            for (let x = (y % 16 === 0 ? 0 : 4); x < 512; x += 8) {
                ctx.fillRect(x, y, 2, 2);
            }
        }

        // Vibrant Saffron Shoulder Stripes & Collar Accents
        ctx.fillStyle = '#ff6a00';
        ctx.fillRect(0, 0, 512, 45);
        ctx.fillRect(40, 45, 60, 180);
        ctx.fillRect(412, 45, 60, 180);

        // Gold Trim Piping
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 4;
        ctx.strokeRect(40, 45, 60, 180);
        ctx.strokeRect(412, 45, 60, 180);

        // "INDIA" Team Typography & Emblem
        ctx.fillStyle = '#f8fafc';
        ctx.font = '900 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('INDIA', 256, 175);

        // Gold 3 Championship Stars
        ctx.fillStyle = '#facc15';
        ctx.font = '24px sans-serif';
        ctx.fillText('★ ★ ★', 256, 125);

        // Player Squad Number "18" on Back
        ctx.font = '900 110px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('18', 256, 360);

        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 4;
        return tex;
    }

    // Player and equipment use the shared cricket rig.
    let batGroup = null;
    let shannonMesh = null;
    let shannonBones = null;
    let matchPoseController = null;
    let matchEquipment = {};
    let matchJerseyTexture = null;
    let jerseyGeneration = 0;

    function createDynamicIndianJersey(userNumber, userName, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const scale = img.width / 4096;
            const cx = 2363 * scale;
            const cy = 2960 * scale;
            const fontPx = Math.round(520 * scale);
            const namePx = Math.round(160 * scale);

            // 1. Wipe previous number with Team India Royal Blue
            ctx.fillStyle = '#0d3982';
            ctx.fillRect(2100 * scale, 2600 * scale, 550 * scale, 850 * scale);

            // 2. Draw Dynamic Player Name (Upper back across shoulders)
            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${namePx}px "Barlow", "Segoe UI", Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(userName || 'INDIA').toUpperCase(), cx, 2660 * scale);

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

            const tex = new THREE.CanvasTexture(c);
            tex.anisotropy = 8;
            tex.encoding = THREE.sRGBEncoding;
            tex.needsUpdate = true;
            callback(tex);
        };
        img.onerror = () => {
            callback(null);
        };
        img.src = 'models/shannon_tex/shannon_india_clean.png';
    }

    function loadShannonBatsman() {
        if (!THREE.FBXLoader || !window.CricketPlayerRig) return;
        new THREE.FBXLoader().load('models/shannon_idle.fbx', (fbx) => {
            shannonMesh = fbx;
            fbx.scale.setScalar(.0104);
            while (batsmanRig.children.length) batsmanRig.remove(batsmanRig.children[0]);
            batsmanRig.add(fbx);
            const gear = window.Hero3DBatsman.createEquipment();
            matchEquipment = gear;
            Object.values(gear).forEach(item => batsmanRig.add(item));
            batGroup = gear.bat;
            matchPoseController = window.CricketPlayerRig.create(fbx, batsmanRig, gear);
            shannonBones = matchPoseController.bones;
            syncPlayerConfig();
            matchPoseController.update(0, 0);
        }, undefined, error => console.warn('Player model could not load:', error));
    }

    function syncPlayerConfig() {
        if (!shannonMesh) return;
        const cfg = window.Hero3DBatsman.getConfig();
        window.Hero3DBatsman.configureEquipment(matchEquipment, cfg);
        const generation = ++jerseyGeneration;
        createDynamicIndianJersey(cfg.kit.number, cfg.kit.name, texture => {
            if (generation !== jerseyGeneration) { texture?.dispose(); return; }
            shannonMesh.traverse(child => {
                if (!child.isSkinnedMesh) return;
                child.castShadow = true;
                child.receiveShadow = true;
                for (const material of (Array.isArray(child.material) ? child.material : [child.material])) {
                    if (texture && /body|shirt|cloth/i.test(material.name)) {
                        material.map = texture;
                        material.roughness = .75;
                        if (material.isMeshPhongMaterial) { material.shininess = 8; material.specular.setHex(0x151515); }
                        material.needsUpdate = true;
                    }
                }
            });
            if (texture) {
                matchJerseyTexture?.dispose();
                matchJerseyTexture = texture;
            }
        });
    }

    function buildBatsman() {
        batsmanRig = new THREE.Group();
        batsmanRig.position.set(0.15, 0, -8.1); // Popping crease stance
        scene.add(batsmanRig);

        // Immediate lightweight placeholder batGroup so references never fail
        batGroup = new THREE.Group();
        batGroup.name = "BatGroup";
        batsmanRig.add(batGroup);

        // Load 3D cricket gear and realistic rigged Shannon player
        loadShannonBatsman();
    }

    // -------------------------------------------------------------
    // 3D REALISTIC BOWLER CHARACTER
    // -------------------------------------------------------------
    let bowlerArm = null;

    function buildBowler() {
        bowlerRig = new THREE.Group();
        bowlerRig.position.set(0, 0, 14.0); // At start of run-up
        scene.add(bowlerRig);

        const jerseyTex = createJerseyTexture();
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xc48a60, roughness: 0.55 });
        const jerseyMat = new THREE.MeshStandardMaterial({ map: jerseyTex, roughness: 0.58 });
        const saffronMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.5 });
        const trouserMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
        const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });

        // Head & Athletic Crop Hair
        const headGeo = new THREE.SphereGeometry(0.105, 16, 14);
        const head = new THREE.Mesh(headGeo, skinMat);
        head.position.set(0, 1.68, 0);
        bowlerRig.add(head);

        const hairGeo = new THREE.SphereGeometry(0.112, 14, 12);
        const hair = new THREE.Mesh(hairGeo, hairMat);
        hair.position.set(0, 1.73, -0.01);
        hair.scale.set(0.96, 1.04, 0.92);
        bowlerRig.add(hair);

        // Torso & Saffron Collar
        const chestGeo = new THREE.BoxGeometry(0.38, 0.30, 0.22);
        const chest = new THREE.Mesh(chestGeo, jerseyMat);
        chest.position.set(0, 1.38, 0);
        chest.castShadow = true;
        bowlerRig.add(chest);

        const yokeGeo = new THREE.BoxGeometry(0.39, 0.08, 0.23);
        const yoke = new THREE.Mesh(yokeGeo, saffronMat);
        yoke.position.set(0, 1.50, 0);
        bowlerRig.add(yoke);

        // Waist & Trousers
        const waistGeo = new THREE.CylinderGeometry(0.17, 0.15, 0.32, 14);
        const waist = new THREE.Mesh(waistGeo, trouserMat);
        waist.position.set(0, 1.12, 0);
        bowlerRig.add(waist);

        // Running Legs
        for (let side of [-1, 1]) {
            const xLeg = side * 0.11;
            const legGeo = new THREE.CylinderGeometry(0.075, 0.055, 0.88, 12);
            const leg = new THREE.Mesh(legGeo, trouserMat);
            leg.position.set(xLeg, 0.48, 0);
            leg.castShadow = true;
            bowlerRig.add(leg);

            const shoeGeo = new THREE.BoxGeometry(0.095, 0.075, 0.23);
            const shoe = new THREE.Mesh(shoeGeo, shoeMat);
            shoe.position.set(xLeg, 0.05, 0.04);
            bowlerRig.add(shoe);
        }

        // Bowling Arm (High gather ready to deliver)
        bowlerArm = new THREE.Group();
        bowlerArm.position.set(0.22, 1.48, 0);
        bowlerRig.add(bowlerArm);

        const armGeo = new THREE.CylinderGeometry(0.045, 0.038, 0.54, 10);
        const armMesh = new THREE.Mesh(armGeo, skinMat);
        armMesh.position.set(0, 0.24, 0);
        bowlerArm.add(armMesh);
        bowlerArm.rotation.x = Math.PI * 0.75;

        // Facing towards batsman (-Z)
        bowlerRig.rotation.y = Math.PI;
    }

    // -------------------------------------------------------------
    // 3D CRICKET MATCH BALL
    // -------------------------------------------------------------
    function buildBall() {
        const ballGeo = new THREE.SphereGeometry(0.082, 20, 16);
        const ballMat = new THREE.MeshStandardMaterial({
            color: 0x991b1b, // Kookaburra Red Leather
            roughness: 0.22,
            metalness: 0.15
        });
        cricketBall = new THREE.Mesh(ballGeo, ballMat);
        cricketBall.castShadow = true;
        cricketBall.position.set(0, 0.8, 8.0);
        scene.add(cricketBall);

        // Raised White Seam Line
        const seamGeo = new THREE.TorusGeometry(0.083, 0.005, 8, 32);
        const seamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
        const seam = new THREE.Mesh(seamGeo, seamMat);
        cricketBall.add(seam);

        // Dynamic Pitch Shadow
        const shadowGeo = new THREE.CircleGeometry(0.14, 16);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 });
        ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
        ballShadow.rotation.x = -Math.PI / 2;
        ballShadow.position.set(0, 0.03, 8.0);
        scene.add(ballShadow);
    }

    // -------------------------------------------------------------
    // CAMERA PERSPECTIVES
    // -------------------------------------------------------------
    function setCameraMode(mode) {
        cameraMode = mode;
        if (!camera) return;

        if (mode === 'batting') {
            // Authentic behind-the-batsman broadcast view
            camera.position.set(0.0, 1.78, -12.4);
            camera.lookAt(0, 1.25, 4.5);
        } else if (mode === 'bowling') {
            camera.position.set(0.0, 2.2, 18.5);
            camera.lookAt(0, 1.1, -8.0);
        } else if (mode === 'celebration') {
            // Victory hero close-up
            camera.position.set(0.35, 1.45, -6.0);
            camera.lookAt(0.1, 1.55, -8.1);
        }
    }

    // -------------------------------------------------------------
    // SHOT TRIGGER MECHANICS (LOFT, DRIVE, DEFEND)
    // -------------------------------------------------------------
    function triggerShot(shotName, runs, feedback) {
        incomingDelivery = null;
        swingType = (shotName || 'Straight').toLowerCase();
        isSwinging = true;
        swingProgress = 0;

        isBallInFlight = true;
        ballProgress = 0;

        let targetX = 0;
        let targetY = 14;
        let targetZ = 36;

        if (swingType.includes('cover') || swingType.includes('drive')) {
            targetX = -28;
            targetY = 4;
            targetZ = 45;
        } else if (swingType.includes('leg')) {
            targetX = 26;
            targetY = 16;
        } else if (swingType.includes('loft')) {
            targetY = 24; // Skyward six
            targetZ = 62;
        } else if (swingType.includes('defen')) {
            targetZ = -5.0;
            targetY = 0.3;
            targetX = 0.8;
        }

        ballTrajectory = {
            startX: 0.15,
            startY: 0.4,
            startZ: -8.0,
            targetX,
            targetY,
            targetZ: (runs === 6) ? 58 : (runs === 4 ? 44 : targetZ),
            speed: (runs === 6) ? 1.9 : 1.45
        };

        console.log(`🏏 Match3D: Realistic shot triggered: ${swingType} (${runs} runs, ${feedback})`);
    }

    function celebrateVictory() {
        celebrationActive = true;
        celebrationTime = 0;
        setCameraMode('celebration');
        console.log('🏆 Match3D: Victory Celebration Mode Activated!');
    }

    function showDelivery(bowl, startedAt) {
        isBallInFlight = false;
        incomingDelivery = { startedAt, contactMs: bowl.perfectAtMs || bowl.flightMs / 2,
            x: bowl.line === 'off' ? -.35 : bowl.line === 'leg' ? .35 : 0,
            bounce: bowl.length === 'short' ? .4 : bowl.length === 'full' ? .8 : .65 };
    }

    // -------------------------------------------------------------
    // REALISTIC CRICKET BEHAVIOR PER-FRAME RENDER LOOP
    // -------------------------------------------------------------
    function animate() {
        animId = requestAnimationFrame(animate);
        if (document.hidden || container?.closest('.screen-panel')?.classList.contains('hidden')) {
            clock.getDelta();
            return;
        }
        const dt = Math.min(clock.getDelta(), 0.1);
        const elapsedTime = clock.getElapsedTime();

        // The same controlled stance is used on the home screen and on the pitch.
        if (isSwinging) {
            swingProgress = Math.min(1, swingProgress + dt / .75);
            if (swingProgress >= 1) { isSwinging = false; swingProgress = 0; }
        }
        matchPoseController?.update(elapsedTime, isSwinging ? swingProgress : 0);
        if (bowlerRig && bowlerArm) {
            const phase = Math.sin(elapsedTime * 3);
            bowlerRig.position.y = Math.abs(phase) * .03;
            bowlerArm.rotation.x = Math.PI * .75 + phase * .25;
        }

        // 3. 3D BALL TRAJECTORY & SEAM ROTATION:
        if (incomingDelivery && cricketBall) {
            const d = incomingDelivery;
            const p = Math.min(1, Math.max(0, (performance.now() - d.startedAt) / d.contactMs));
            const y = p < d.bounce ? THREE.MathUtils.lerp(1.8, .12, p / d.bounce)
                : THREE.MathUtils.lerp(.12, .8, (p - d.bounce) / (1 - d.bounce));
            const z = THREE.MathUtils.lerp(12, -8, p);
            cricketBall.position.set(d.x * p, y, z);
            cricketBall.rotation.x += dt * 18;
            if (ballShadow) { ballShadow.position.set(d.x * p, .03, z); ballShadow.scale.setScalar(.6); }
        }
        if (isBallInFlight && ballTrajectory && cricketBall) {
            ballProgress += dt * ballTrajectory.speed;
            const p = Math.min(ballProgress, 1.0);

            const x = THREE.MathUtils.lerp(ballTrajectory.startX, ballTrajectory.targetX, p);
            const z = THREE.MathUtils.lerp(ballTrajectory.startZ, ballTrajectory.targetZ, p);
            const arc = Math.sin(p * Math.PI) * ballTrajectory.targetY;
            const y = Math.max(0.1, arc + 0.3);

            cricketBall.position.set(x, y, z);
            cricketBall.rotation.x += dt * 18;
            cricketBall.rotation.y += dt * 12;

            if (ballShadow) {
                ballShadow.position.set(x, 0.03, z);
                ballShadow.scale.setScalar(Math.max(0.25, 1.0 - (y / 16)));
            }

            if (p >= 1.0) {
                isBallInFlight = false;
            }
        }

        // 4. Result acknowledgement with a connected grip:
        if (celebrationActive && batsmanRig) {
            celebrationTime += dt;
            // Keep the grip connected while the player acknowledges the result.
            matchPoseController?.update(elapsedTime, Math.min(.3, celebrationTime * .2));
        }

        // Render Frame
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }

    // Public API
    window.Match3DEngine = {
        init,
        setCameraMode,
        triggerShot,
        showDelivery,
        celebrateVictory,
        onResize
    };

    window.__match3d = {
        getBones: () => shannonBones,
        getBat: () => batGroup,
        getMesh: () => shannonMesh,
        getRig: () => batsmanRig,
        getEquipment: () => matchEquipment,
        getPose: () => matchPoseController
    };

})(window);

