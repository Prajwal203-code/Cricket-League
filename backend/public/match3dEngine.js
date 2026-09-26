/**
 * 🏏 Match3DEngine — Real-Time 3D In-Match Cricket Engine
 * =======================================================
 * Powers the live 3D gameplay match screen matching the reference screenshots:
 * - 3D Realistic Cricket Pitch with dirt strip & white crease lines
 * - 3D Stadium with stands, animated crowd, floodlights & "CLOUD net" boundary hoardings
 * - 3D LED Stumps with glowing bails at batting and bowling ends
 * - 3D Batsman in authentic batting stance (Indian kit, helmet + grill, pads, bat)
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

    // Color conversion helper
    const toCol = (hex) => new THREE.Color(hex);

    function init(canvasId, containerId) {
        container = document.getElementById(containerId);
        canvas = document.getElementById(canvasId);
        if (!container || !canvas || !window.THREE) {
            console.error('❌ Match3DEngine: missing container, canvas or THREE.js');
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

    function createPadTexture() {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 512;
        const ctx = c.getContext('2d');

        // Premium White PU Leather base
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, 256, 512);

        // 3 Vertical Cane Rib Shadows & Highlights
        for (let i = 0; i < 3; i++) {
            const x = 50 + i * 78;
            // Shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
            ctx.fillRect(x - 8, 20, 20, 470);
            // Highlight
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x - 2, 20, 10, 470);
            // Stitch Line
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x + 12, 20);
            ctx.lineTo(x + 12, 490);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Knee Roll Bolster Horizontal Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(20, 220, 216, 75);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(20, 235, 216, 20);

        // Brand Emblem Pill (Royal Blue)
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(88, 70, 80, 28, 14);
        } else {
            ctx.rect(88, 70, 80, 28);
        }
        ctx.fill();

        const tex = new THREE.CanvasTexture(c);
        return tex;
    }

    function createWillowBatTexture() {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 512;
        const ctx = c.getContext('2d');

        // English Willow Natural Wood Grain
        const grad = ctx.createLinearGradient(0, 0, 256, 0);
        grad.addColorStop(0, '#e5be8a');
        grad.addColorStop(0.3, '#edd2a6');
        grad.addColorStop(0.7, '#deb47c');
        grad.addColorStop(1, '#cfa065');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 512);

        // Fine longitudinal wood grain lines
        ctx.strokeStyle = 'rgba(120, 68, 20, 0.18)';
        ctx.lineWidth = 1.5;
        for (let i = 12; i < 256; i += 14) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.bezierCurveTo(i + 2, 170, i - 3, 340, i + 1, 512);
            ctx.stroke();
        }

        // Red & Gold Power Brand Sticker on Upper Blade
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(30, 40, 196, 120);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 6;
        ctx.strokeRect(30, 40, 196, 120);

        ctx.fillStyle = '#fef08a';
        ctx.font = '900 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MRF', 128, 95);
        ctx.font = '700 16px sans-serif';
        ctx.fillText('GENIUS POWER', 128, 130);

        // Black Rubber Toe Guard
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 490, 256, 22);

        const tex = new THREE.CanvasTexture(c);
        return tex;
    }

    function createGripTexture() {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 128;
        const ctx = c.getContext('2d');

        // White rubber chevron diamond pattern
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, 64, 128);

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        for (let y = -32; y < 160; y += 16) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(32, y + 16);
            ctx.lineTo(64, y);
            ctx.stroke();
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, 4);
        return tex;
    }

    // -------------------------------------------------------------
    // 3D REALISTIC RIGGED CRICKETER (SHANNON + TEAM INDIA + CRICKET GEAR)
    // -------------------------------------------------------------
    let batGroup = null;
    let batsmanHead = null;
    let batsmanArmsGroup = null;
    let shannonMesh = null;
    let shannonBones = null;
    let shannonMixer = null;
    let baseStance = null;

    // Helper: Authentic English Willow Bat with Rubber Grip
    function createEnglishWillowBat() {
        const bat = new THREE.Group();
        bat.name = "EnglishWillowBat";

        // Cane Handle with Royal Navy Chevron Rubber Grip
        const handleGeo = new THREE.CylinderGeometry(0.015, 0.016, 0.26, 16);
        const handleMat = new THREE.MeshStandardMaterial({
            color: 0x0f2d59,
            roughness: 0.58,
            metalness: 0.05
        });
        const handle = new THREE.Mesh(handleGeo, handleMat);
        handle.position.y = -0.13;
        handle.castShadow = true;
        bat.add(handle);

        for (let r = 0; r < 4; r++) {
            const ringGeo = new THREE.TorusGeometry(0.016, 0.002, 8, 16);
            const ringMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.y = -0.05 - r * 0.05;
            ring.rotation.x = Math.PI / 2;
            bat.add(ring);
        }

        // Willow Blade (International Grade 1 English Willow)
        const bladeGeo = new THREE.BoxGeometry(0.108, 0.58, 0.048);
        const willowMat = new THREE.MeshStandardMaterial({
            color: 0xd9b37a,
            roughness: 0.48,
            metalness: 0.02
        });
        const blade = new THREE.Mesh(bladeGeo, willowMat);
        blade.position.y = -0.26 - 0.29; // -0.55m
        blade.castShadow = true;
        blade.receiveShadow = true;
        bat.add(blade);

        // Bat Decal
        const stickerGeo = new THREE.PlaneGeometry(0.086, 0.18);
        const stickerMat = new THREE.MeshStandardMaterial({
            color: 0x0d3b7c,
            roughness: 0.35,
            metalness: 0.1
        });
        const sticker = new THREE.Mesh(stickerGeo, stickerMat);
        sticker.position.set(0, -0.42, 0.025);
        bat.add(sticker);

        // Toe Guard
        const toeGeo = new THREE.BoxGeometry(0.109, 0.015, 0.049);
        const toeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
        const toe = new THREE.Mesh(toeGeo, toeMat);
        toe.position.set(0, -0.835, 0);
        bat.add(toe);

        return bat;
    }

    // Helper: Contoured White PU Batting Pads
    function createCricketPadMesh(isLeft) {
        const pad = new THREE.Group();
        pad.name = isLeft ? "Pad_Left" : "Pad_Right";

        const whiteMat = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            roughness: 0.35,
            metalness: 0.04
        });
        const strapMat = new THREE.MeshStandardMaterial({
            color: 0x0f2d59,
            roughness: 0.65,
            metalness: 0.02
        });
        const goldMat = new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            roughness: 0.40,
            metalness: 0.30
        });

        // Main Curved Shin Shield
        const shinGeo = new THREE.CylinderGeometry(0.082, 0.072, 0.44, 24, 1, false, -Math.PI * 0.33, Math.PI * 0.66);
        const shin = new THREE.Mesh(shinGeo, whiteMat);
        shin.castShadow = true;
        shin.receiveShadow = true;
        pad.add(shin);

        // Knee Roll
        for (let k = -1; k <= 1; k++) {
            const rollGeo = new THREE.TorusGeometry(0.085, 0.012, 10, 20, Math.PI * 0.65);
            const roll = new THREE.Mesh(rollGeo, whiteMat);
            roll.position.set(0, 0.11 + k * 0.024, 0);
            roll.rotation.set(Math.PI / 2, 0, -Math.PI * 0.325);
            roll.castShadow = true;
            pad.add(roll);
        }

        // Top Hat
        const topGeo = new THREE.CylinderGeometry(0.088, 0.084, 0.09, 20, 1, false, -Math.PI * 0.30, Math.PI * 0.60);
        const topHat = new THREE.Mesh(topGeo, whiteMat);
        topHat.position.set(0, 0.20, 0);
        topHat.castShadow = true;
        pad.add(topHat);

        const trimGeo = new THREE.TorusGeometry(0.089, 0.0035, 8, 20, Math.PI * 0.60);
        const trim = new THREE.Mesh(trimGeo, goldMat);
        trim.position.set(0, 0.24, 0);
        trim.rotation.set(Math.PI / 2, 0, -Math.PI * 0.30);
        pad.add(trim);

        // Velcro Straps
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

    // Helper: Center a 3D gear mesh to eliminate floating offset bugs
    function centerGearMesh(mesh) {
        const wrapper = new THREE.Group();
        const clone = mesh.clone();
        const box = new THREE.Box3().setFromObject(clone);
        const center = box.getCenter(new THREE.Vector3());
        clone.position.sub(center);
        wrapper.add(clone);
        return wrapper;
    }

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
            tex.needsUpdate = true;
            callback(tex);
        };
        img.onerror = () => {
            callback(null);
        };
        img.src = 'models/shannon_tex/shannon_india_clean.png';
    }

    function loadCricketGear(onReady) {
        if (!THREE.GLTFLoader) {
            onReady({});
            return;
        }
        const loader = new THREE.GLTFLoader();
        loader.load('models/cricket_gear_kit.glb', (gltf) => {
            const gear = {};
            gltf.scene.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
                const name = (node.name || '').toLowerCase();
                if (name.includes('helmet') && !gear.helmet) gear.helmet = node;
                else if (name.includes('bat') && !name.includes('ball') && !gear.bat) gear.bat = node;
                else if ((name.includes('pad_left') || name.includes('left_pad')) && !gear.padLeft) gear.padLeft = node;
                else if ((name.includes('pad_right') || name.includes('right_pad')) && !gear.padRight) gear.padRight = node;
            });
            onReady(gear);
        }, undefined, (err) => {
            console.warn('⚠️ Cricket gear load notice:', err);
            onReady({});
        });
    }

    function loadShannonBatsman(gear) {
        if (!THREE.FBXLoader) {
            console.warn('⚠️ FBXLoader not available on window.THREE');
            return;
        }

        // Get user's customized squad number and player name from localStorage
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

        const loader = new THREE.FBXLoader();
        loader.load('models/shannon_idle.fbx', (fbx) => {
            console.log(`🏏 Loaded Shannon model with dynamic kit #${userNumber} (${userName})!`);

            // Clear temporary fallback meshes from batsmanRig
            const toRemove = [];
            batsmanRig.children.forEach(c => {
                if (c !== fbx) toRemove.push(c);
            });
            toRemove.forEach(c => batsmanRig.remove(c));

            shannonMesh = fbx;
            // Scale to athletic international batsman height (~1.78m in meters)
            shannonMesh.scale.setScalar(0.0104);
            shannonMesh.position.set(0, 0, 0);

            // Setup Motion Capture Animation Mixer
            if (fbx.animations && fbx.animations.length > 0) {
                shannonMixer = new THREE.AnimationMixer(fbx);
                const idleAction = shannonMixer.clipAction(fbx.animations[0]);
                idleAction.play();
                console.log('✅ Playing mocap batting stance animation on Shannon');
            }

            // Apply Dynamic Team India Royal Blue Jersey Texture
            createDynamicIndianJersey(userNumber, userName, (jerseyTex) => {
                shannonMesh.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        if (child.material) {
                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            mats.forEach(m => {
                                m.roughness = 0.62;
                                m.metalness = 0.05;
                                if (jerseyTex && (m.name.toLowerCase().includes('shirt') || m.name.toLowerCase().includes('cloth') || m.name.toLowerCase().includes('body') || !m.name)) {
                                    m.map = jerseyTex;
                                    m.needsUpdate = true;
                                }
                            });
                        }
                    }
                });
            });

            // Map skeleton bones
            shannonBones = {};
            shannonMesh.traverse((child) => {
                if (child.isBone) {
                    const name = (child.name || '').toLowerCase();
                    if (name.endsWith('head') || (name.includes('head') && !name.includes('top'))) shannonBones.head = child;
                    else if (name.endsWith('neck') || name.includes('neck')) shannonBones.neck = child;
                    else if (name.includes('spine2')) shannonBones.spine2 = child;
                    else if (name.includes('spine1')) shannonBones.spine1 = child;
                    else if (name.includes('spine')) shannonBones.spine = child;
                    else if (name.includes('hips')) shannonBones.hips = child;
                    else if (name.includes('rightshoulder')) shannonBones.rightShoulder = child;
                    else if (name.includes('leftshoulder')) shannonBones.leftShoulder = child;
                    else if (name.includes('rightarm') && !name.includes('fore')) shannonBones.rightArm = child;
                    else if (name.includes('leftarm') && !name.includes('fore')) shannonBones.leftArm = child;
                    else if (name.includes('rightforearm')) shannonBones.rightForeArm = child;
                    else if (name.includes('leftforearm')) shannonBones.leftForeArm = child;
                    else if (name.includes('righthand') && !name.includes('finger') && !name.includes('index') && !name.includes('thumb') && !name.includes('pinky') && !name.includes('middle') && !name.includes('ring')) shannonBones.rightHand = child;
                    else if (name.includes('lefthand') && !name.includes('finger') && !name.includes('index') && !name.includes('thumb') && !name.includes('pinky') && !name.includes('middle') && !name.includes('ring')) shannonBones.leftHand = child;
                    else if (name.includes('rightupleg')) shannonBones.rightUpLeg = child;
                    else if (name.includes('leftupleg')) shannonBones.leftUpLeg = child;
                    else if (name.includes('rightleg') && !name.includes('up')) shannonBones.rightLeg = child;
                    else if (name.includes('leftleg') && !name.includes('up')) shannonBones.leftLeg = child;
                    else if (name.includes('rightfoot')) shannonBones.rightFoot = child;
                    else if (name.includes('leftfoot')) shannonBones.leftFoot = child;
                }
            });

            // Scale compensation for gear socketed inside Shannon's 0.0104 scaled skeleton
            const gearScale = 96.0;

            // 1. Batting Helmet socketed to Head Bone (Centered, zero floating offset)
            if (gear.helmet && shannonBones.head) {
                const helmetWrapper = centerGearMesh(gear.helmet);
                helmetWrapper.position.set(0, 10, 2);
                helmetWrapper.scale.setScalar(gearScale * 0.95);
                shannonBones.head.add(helmetWrapper);
            }

            // 2. Batting Pads socketed to Left & Right Shin Bones
            const padMat = new THREE.MeshStandardMaterial({
                color: 0xf4f6f9,
                roughness: 0.38,
                metalness: 0.05
            });
            if (gear.padLeft && shannonBones.leftLeg) {
                const padL = centerGearMesh(gear.padLeft);
                padL.traverse(n => { if (n.isMesh) { n.material = padMat; n.castShadow = true; } });
                padL.position.set(0, -18, 6);
                padL.rotation.set(0, Math.PI, 0);
                padL.scale.setScalar(gearScale);
                shannonBones.leftLeg.add(padL);
            }
            if (gear.padRight && shannonBones.rightLeg) {
                const padR = centerGearMesh(gear.padRight);
                padR.traverse(n => { if (n.isMesh) { n.material = padMat; n.castShadow = true; } });
                padR.position.set(0, -18, 6);
                padR.rotation.set(0, Math.PI, 0);
                padR.scale.setScalar(gearScale);
                shannonBones.rightLeg.add(padR);
            }

            // 3. English Willow Bat socketed into Right Hand Grip
            batGroup = new THREE.Group();
            batGroup.name = "BatGroup";
            if (gear.bat) {
                const batMesh = centerGearMesh(gear.bat);
                batMesh.position.set(0, -28, 0); // Position handle right in palm
                batMesh.scale.setScalar(gearScale);
                batGroup.add(batMesh);
            } else {
                const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.13), createWillowBatTexture());
                blade.position.set(0, -0.4, 0);
                batGroup.add(blade);
            }

            if (shannonBones.rightHand) {
                shannonBones.rightHand.add(batGroup);
                batGroup.position.set(1, -2, 0);
                // Bat blade angled down toward the popping crease turf
                batGroup.rotation.set(Math.PI / 2 + 0.15, 0.20, -0.65);
            } else {
                batsmanRig.add(batGroup);
            }

            // 4. Grounded Cricket Bat Stance Adjustments:
            // Adjust the arms so the hands hold the bat DOWN near the crease tapping the ground
            if (shannonBones.rightArm) {
                shannonBones.rightArm.rotation.x += 0.35;
                shannonBones.rightArm.rotation.z += 0.25;
            }
            if (shannonBones.leftArm) {
                shannonBones.leftArm.rotation.x += 0.30;
                shannonBones.leftArm.rotation.z -= 0.20;
            }
            if (shannonBones.head) {
                shannonBones.head.rotation.y = Math.PI / 2.6; // head turned directly facing the bowler
                batsmanHead = shannonBones.head;
            }

            // Cache base stance angles for dynamic swing interpolation
            baseStance = {
                spineX: shannonBones.spine ? shannonBones.spine.rotation.x : 0.12,
                spineY: shannonBones.spine ? shannonBones.spine.rotation.y : 0.15,
                spineZ: shannonBones.spine ? shannonBones.spine.rotation.z : 0,
                lArmX: shannonBones.leftArm ? shannonBones.leftArm.rotation.x : 0.40,
                lArmY: shannonBones.leftArm ? shannonBones.leftArm.rotation.y : 0.45,
                lArmZ: shannonBones.leftArm ? shannonBones.leftArm.rotation.z : -1.05,
                rArmX: shannonBones.rightArm ? shannonBones.rightArm.rotation.x : 0.45,
                rArmY: shannonBones.rightArm ? shannonBones.rightArm.rotation.y : -0.30,
                rArmZ: shannonBones.rightArm ? shannonBones.rightArm.rotation.z : 1.15,
                lForeZ: shannonBones.leftForeArm ? shannonBones.leftForeArm.rotation.z : -0.80,
                rForeZ: shannonBones.rightForeArm ? shannonBones.rightForeArm.rotation.z : 0.85,
                batRotX: batGroup ? batGroup.rotation.x : Math.PI / 2.2,
                batRotY: batGroup ? batGroup.rotation.y : 0,
                batRotZ: batGroup ? batGroup.rotation.z : -Math.PI / 4
            };

            batsmanRig.add(shannonMesh);
        }, undefined, (err) => {
            console.error('❌ Error loading models/shannon_idle.fbx:', err);
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
        loadCricketGear((gear) => {
            loadShannonBatsman(gear);
        });
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

    // -------------------------------------------------------------
    // REALISTIC CRICKET BEHAVIOR PER-FRAME RENDER LOOP
    // -------------------------------------------------------------
    function animate() {
        animId = requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.1);
        const elapsedTime = clock.getElapsedTime();

        // 1. AUTHENTIC CRICKET BATSMAN BEHAVIORS:
        const activeBones = shannonBones || null;
        if (batsmanRig && batGroup) {
            if (shannonMixer && !isSwinging && !celebrationActive) {
                shannonMixer.update(dt);
            }

            if (isSwinging) {
                swingProgress += dt * 3.8;

                if (activeBones && baseStance) {
                    // SKELETAL RIGGED CRICKET SWINGS
                    if (swingType.includes('loft')) {
                        // LOFT / SIX: High backlift into powerful upward explosion
                        if (swingProgress < 0.35) {
                            const p = swingProgress / 0.35;
                            // Backlift: spine tilts back, arms raise bat upward
                            if (activeBones.spine) activeBones.spine.rotation.y = baseStance.spineY - p * 0.35;
                            if (activeBones.leftArm) activeBones.leftArm.rotation.z = baseStance.lArmZ - p * 0.45;
                            if (activeBones.rightArm) activeBones.rightArm.rotation.z = baseStance.rArmZ + p * 0.50;
                            batGroup.rotation.x = baseStance.batRotX - p * 0.70;
                        } else if (swingProgress < 0.75) {
                            const p = (swingProgress - 0.35) / 0.40;
                            // Downswing through ball: body turns forward toward bowler
                            if (activeBones.spine) activeBones.spine.rotation.y = baseStance.spineY - 0.35 + p * 1.25;
                            if (activeBones.leftArm) activeBones.leftArm.rotation.x = baseStance.lArmX - p * 1.40;
                            if (activeBones.rightArm) activeBones.rightArm.rotation.x = baseStance.rArmX - p * 1.50;
                            batGroup.rotation.x = baseStance.batRotX - 0.70 + p * 2.20;
                        } else if (swingProgress < 1.0) {
                            // Skyward high follow-through
                            const p = (swingProgress - 0.75) / 0.25;
                            if (activeBones.spine) activeBones.spine.rotation.y = baseStance.spineY + 0.90 - p * 0.90;
                            if (activeBones.leftArm) activeBones.leftArm.rotation.x = baseStance.lArmX - 1.40 + p * 1.40;
                            if (activeBones.rightArm) activeBones.rightArm.rotation.x = baseStance.rArmX - 1.50 + p * 1.50;
                            if (activeBones.leftArm) activeBones.leftArm.rotation.z = baseStance.lArmZ - 0.45 + p * 0.45;
                            if (activeBones.rightArm) activeBones.rightArm.rotation.z = baseStance.rArmZ + 0.50 - p * 0.50;
                            batGroup.rotation.x = baseStance.batRotX + 1.50 - p * 1.50;
                        } else {
                            isSwinging = false;
                            if (activeBones.spine) activeBones.spine.rotation.set(baseStance.spineX, baseStance.spineY, baseStance.spineZ);
                            if (activeBones.leftArm) activeBones.leftArm.rotation.set(baseStance.lArmX, baseStance.lArmY, baseStance.lArmZ);
                            if (activeBones.rightArm) activeBones.rightArm.rotation.set(baseStance.rArmX, baseStance.rArmY, baseStance.rArmZ);
                            if (activeBones.leftForeArm) activeBones.leftForeArm.rotation.z = baseStance.lForeZ;
                            if (activeBones.rightForeArm) activeBones.rightForeArm.rotation.z = baseStance.rForeZ;
                            batGroup.rotation.set(baseStance.batRotX, baseStance.batRotY, baseStance.batRotZ);
                        }
                    } else if (swingType.includes('defen')) {
                        // DEFENSIVE: Soft hands, forward press, bat angled down into crease
                        if (swingProgress < 0.45) {
                            const p = swingProgress / 0.45;
                            if (activeBones.spine) activeBones.spine.rotation.x = baseStance.spineX + p * 0.15;
                            if (activeBones.leftArm) activeBones.leftArm.rotation.x = baseStance.lArmX - p * 0.60;
                            if (activeBones.rightArm) activeBones.rightArm.rotation.x = baseStance.rArmX - p * 0.65;
                            batGroup.rotation.x = baseStance.batRotX + p * 0.40;
                        } else if (swingProgress < 1.0) {
                            const p = (swingProgress - 0.45) / 0.55;
                            if (activeBones.spine) activeBones.spine.rotation.x = baseStance.spineX + 0.15 - p * 0.15;
                            if (activeBones.leftArm) activeBones.leftArm.rotation.x = baseStance.lArmX - 0.60 + p * 0.60;
                            if (activeBones.rightArm) activeBones.rightArm.rotation.x = baseStance.rArmX - 0.65 + p * 0.65;
                            batGroup.rotation.x = baseStance.batRotX + 0.40 - p * 0.40;
                        } else {
                            isSwinging = false;
                            if (activeBones.spine) activeBones.spine.rotation.set(baseStance.spineX, baseStance.spineY, baseStance.spineZ);
                            if (activeBones.leftArm) activeBones.leftArm.rotation.set(baseStance.lArmX, baseStance.lArmY, baseStance.lArmZ);
                            if (activeBones.rightArm) activeBones.rightArm.rotation.set(baseStance.rArmX, baseStance.rArmY, baseStance.rArmZ);
                            batGroup.rotation.set(baseStance.batRotX, baseStance.batRotY, baseStance.batRotZ);
                        }
                    } else {
                        // DRIVE: Elegant flowing swing straight down the ground
                        if (swingProgress < 0.35) {
                            const p = swingProgress / 0.35;
                            if (activeBones.leftArm) activeBones.leftArm.rotation.z = baseStance.lArmZ - p * 0.30;
                            batGroup.rotation.x = baseStance.batRotX - p * 0.50;
                        } else if (swingProgress < 0.80) {
                            const p = (swingProgress - 0.35) / 0.45;
                            if (activeBones.spine) activeBones.spine.rotation.y = baseStance.spineY + p * 0.85;
                            if (activeBones.leftArm) activeBones.leftArm.rotation.x = baseStance.lArmX - p * 1.10;
                            if (activeBones.rightArm) activeBones.rightArm.rotation.x = baseStance.rArmX - p * 1.15;
                            batGroup.rotation.x = baseStance.batRotX - 0.50 + p * 1.60;
                        } else {
                            isSwinging = false;
                            if (activeBones.spine) activeBones.spine.rotation.set(baseStance.spineX, baseStance.spineY, baseStance.spineZ);
                            if (activeBones.leftArm) activeBones.leftArm.rotation.set(baseStance.lArmX, baseStance.lArmY, baseStance.lArmZ);
                            if (activeBones.rightArm) activeBones.rightArm.rotation.set(baseStance.rArmX, baseStance.rArmY, baseStance.rArmZ);
                            batGroup.rotation.set(baseStance.batRotX, baseStance.batRotY, baseStance.batRotZ);
                        }
                    }
                } else {
                    if (swingProgress > 1.0) {
                        isSwinging = false;
                        batGroup.rotation.set(0.22, 0, 0.15);
                    }
                }
            } else if (!celebrationActive) {
                // AUTHENTIC CRICKET BATSMAN IDLE:
                // Rhythmic Bat Tapping in the Crease (tap... tap... pause... tap...)
                const tapPeriod = 1.4;
                const tapTime = elapsedTime % tapPeriod;
                let tapAngle = 0;
                if (tapTime < 0.22) {
                    tapAngle = Math.sin(tapTime / 0.22 * Math.PI) * 0.12;
                } else if (tapTime > 0.38 && tapTime < 0.60) {
                    tapAngle = Math.sin((tapTime - 0.38) / 0.22 * Math.PI) * 0.12;
                }

                if (shannonBones) {
                    // Lower arms from high baseball stance to authentic grounded cricket stance
                    if (shannonBones.rightArm) {
                        shannonBones.rightArm.rotation.set(0.52, -0.32, 0.28);
                    }
                    if (shannonBones.rightForeArm) {
                        shannonBones.rightForeArm.rotation.set(-0.45, 0.22, 0.52 + tapAngle * 0.4);
                    }
                    if (shannonBones.leftArm) {
                        shannonBones.leftArm.rotation.set(0.48, 0.38, -0.38);
                    }
                    if (shannonBones.leftForeArm) {
                        shannonBones.leftForeArm.rotation.set(-0.35, 0, -0.48);
                    }
                    if (shannonBones.head) {
                        shannonBones.head.rotation.set(-0.08, Math.PI / 2.5, 0);
                    }
                    if (batGroup) {
                        batGroup.rotation.set(Math.PI / 2 + 0.15 - tapAngle * 0.8, 0.20, -0.65);
                    }
                    // Subtle athletic breathing & balance
                    const breath = Math.sin(elapsedTime * 2.2) * 0.012;
                    batsmanRig.position.y = breath;
                } else {
                    // Fallback bat tapping
                    const tapPeriodFallback = 1.6;
                    const tapTimeFallback = elapsedTime % tapPeriodFallback;
                    let tapAngleFallback = 0;
                    if (tapTimeFallback < 0.25) tapAngleFallback = Math.sin(tapTimeFallback * Math.PI * 4) * 0.08;
                    else if (tapTimeFallback > 0.45 && tapTimeFallback < 0.70) tapAngleFallback = Math.sin((tapTimeFallback - 0.45) * Math.PI * 4) * 0.08;
                    batGroup.rotation.x = 0.22 + tapAngleFallback;
                }
            }
        }

        // 2. BOWLER RUN-UP & DELIVERY WINDMILL ANIMATION:
        if (bowlerRig && bowlerArm && !celebrationActive) {
            // Subtle rhythmic bowler prep
            const bPhase = Math.sin(elapsedTime * 3.0);
            bowlerRig.position.y = Math.abs(bPhase) * 0.03;
            bowlerArm.rotation.x = Math.PI * 0.75 + bPhase * 0.25;
        }

        // 3. 3D BALL TRAJECTORY & SEAM ROTATION:
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

        // 4. VICTORY CELEBRATION (BAT RAISED ALOFT TO CHEERING CROWD):
        if (celebrationActive && batsmanRig && batGroup) {
            celebrationTime += dt;
            // Face crowd / camera
            batsmanRig.rotation.y = 0;
            if (batsmanHead) batsmanHead.rotation.y = 0;

            // Raise bat high in air
            batGroup.rotation.x = 2.4;
            batGroup.position.set(0.18, 1.85, 0);

            // Celebration jump / fist pump
            const t = Math.sin(celebrationTime * 4.0);
            batsmanRig.position.y = Math.abs(t) * 0.08;
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
        celebrateVictory,
        onResize
    };

    window.__match3d = {
        getBones: () => shannonBones,
        getBat: () => batGroup,
        getMesh: () => shannonMesh,
        getRig: () => batsmanRig
    };

})(window);

