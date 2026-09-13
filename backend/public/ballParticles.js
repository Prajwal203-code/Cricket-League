// ==========================================================
// 3D Elemental Particle & Shader Engine for Ball Skins
// Real-time procedural animations for Fire, Water, Lightning, Galaxy, Magma, Gold & Cyber
// ==========================================================

class BallParticleEngine {
    constructor() {
        this.activeCanvases = new Map();
        this.animFrameId = null;
    }

    /**
     * Initializes and starts a dynamic 3D elemental animation canvas for a ball skin.
     * @param {HTMLCanvasElement} canvas 
     * @param {string} skinId 
     */
    attachCanvas(canvas, skinId) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set high-DPI scaling
        const width = canvas.width = 120;
        const height = canvas.height = 120;

        const state = {
            ctx,
            width,
            height,
            skinId,
            time: Math.random() * 100,
            particles: this.createParticlesForSkin(skinId, width, height)
        };

        this.activeCanvases.set(canvas, state);

        if (!this.animFrameId) {
            this.loop();
        }
    }

    detachCanvas(canvas) {
        this.activeCanvases.delete(canvas);
        if (this.activeCanvases.size === 0 && this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    }

    createParticlesForSkin(skinId, w, h) {
        const count = skinId === 'fireball' || skinId === 'water' || skinId === 'galaxy' ? 24 : 16;
        const particles = [];
        for (let i = 0; i < count; i++) {
            particles.push({
                x: w / 2 + (Math.random() - 0.5) * 40,
                y: h / 2 + (Math.random() - 0.5) * 40,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5 - (skinId === 'fireball' ? 1.2 : 0),
                size: Math.random() * 6 + 2,
                alpha: Math.random(),
                life: Math.random(),
                maxLife: Math.random() * 0.8 + 0.4,
                angle: Math.random() * Math.PI * 2,
                spinSpeed: (Math.random() - 0.5) * 0.08
            });
        }
        return particles;
    }

    loop() {
        this.activeCanvases.forEach((state) => {
            state.time += 0.03;
            this.renderSkinFrame(state);
        });

        if (this.activeCanvases.size > 0) {
            this.animFrameId = requestAnimationFrame(() => this.loop());
        }
    }

    renderSkinFrame(state) {
        const { ctx, width: w, height: h, skinId, time, particles } = state;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        const radius = 38;

        switch (skinId) {
            case 'fireball':
                this.draw3DFireball(ctx, cx, cy, radius, time, particles);
                break;
            case 'water':
                this.draw3DOceanWater(ctx, cx, cy, radius, time, particles);
                break;
            case 'lightning':
                this.draw3DLightningPlasma(ctx, cx, cy, radius, time, particles);
                break;
            case 'galaxy':
                this.draw3DGalaxyCosmic(ctx, cx, cy, radius, time, particles);
                break;
            case 'gold_sun':
                this.draw3DGoldenSun(ctx, cx, cy, radius, time, particles);
                break;
            case 'frostbite':
                this.draw3DFrostbiteIce(ctx, cx, cy, radius, time, particles);
                break;
            case 'rainbow':
                this.draw3DRainbowDisco(ctx, cx, cy, radius, time, particles);
                break;
            case 'magma':
                this.draw3DLavaMagma(ctx, cx, cy, radius, time, particles);
                break;
            case 'bomb':
                this.draw3DComicBomb(ctx, cx, cy, radius, time, particles);
                break;
            case 'cyber':
                this.draw3DCyberMatrix(ctx, cx, cy, radius, time, particles);
                break;
            default:
                this.draw3DClassicBall(ctx, cx, cy, radius, time);
                break;
        }
    }

    // --------------------------------------------------
    // 1. 🔥 REAL 3D FIREBALL INFERNO ANIMATION
    // --------------------------------------------------
    draw3DFireball(ctx, cx, cy, r, time, particles) {
        // Outer Blazing Flame Aura
        const auraGrad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.5);
        auraGrad.addColorStop(0, 'rgba(255, 140, 0, 0.9)');
        auraGrad.addColorStop(0.5, 'rgba(255, 60, 0, 0.5)');
        auraGrad.addColorStop(1, 'rgba(220, 20, 0, 0)');

        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Flickering Flame Tongues
        ctx.save();
        ctx.translate(cx, cy);
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI / 4) + Math.sin(time * 3 + i) * 0.2;
            const len = r + Math.sin(time * 8 + i * 2) * 12 + 6;

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(
                Math.cos(angle + 0.3) * (r + 4),
                Math.sin(angle + 0.3) * (r + 4),
                Math.cos(angle) * len,
                Math.sin(angle) * len
            );
            ctx.quadraticCurveTo(
                Math.cos(angle - 0.3) * (r + 4),
                Math.sin(angle - 0.3) * (r + 4),
                0, 0
            );

            const flameGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, len);
            flameGrad.addColorStop(0, '#ffffff');
            flameGrad.addColorStop(0.4, '#ffea00');
            flameGrad.addColorStop(0.8, '#ff3d00');
            flameGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = flameGrad;
            ctx.fill();
        }
        ctx.restore();

        // Core Glowing 3D Fire Sphere
        const ballGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.3, '#ffab00');
        ballGrad.addColorStop(0.7, '#dd2c00');
        ballGrad.addColorStop(1, '#3e0000');

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Rising Ember Particles
        particles.forEach(p => {
            p.y -= 1.4;
            p.x += Math.sin(time * 4 + p.life * 10) * 0.8;
            p.life += 0.03;
            if (p.y < cy - r * 1.5 || p.life > p.maxLife) {
                p.x = cx + (Math.random() - 0.5) * r * 1.2;
                p.y = cy + r * 0.6;
                p.life = 0;
            }

            const pAlpha = 1 - (p.life / p.maxLife);
            ctx.fillStyle = `rgba(255, ${Math.floor(200 * pAlpha)}, 0, ${pAlpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * pAlpha, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // --------------------------------------------------
    // 2. 🌊 REAL 3D OCEAN WATER / ICE LIQUID ANIMATION
    // --------------------------------------------------
    draw3DOceanWater(ctx, cx, cy, r, time, particles) {
        // Aquatic Blue Aura
        const auraGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.4);
        auraGrad.addColorStop(0, 'rgba(0, 229, 255, 0.8)');
        auraGrad.addColorStop(0.6, 'rgba(0, 145, 234, 0.4)');
        auraGrad.addColorStop(1, 'rgba(0, 18, 50, 0)');

        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Core 3D Liquid Water Sphere
        const ballGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        ballGrad.addColorStop(0, '#e0f7fa');
        ballGrad.addColorStop(0.35, '#00e5ff');
        ballGrad.addColorStop(0.75, '#006064');
        ballGrad.addColorStop(1, '#001e2b');

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Swirling Fluid Water Wave Rings
        ctx.save();
        ctx.translate(cx, cy);
        for (let i = 1; i <= 3; i++) {
            const ringR = (r * 0.3 * i + Math.sin(time * 3 + i) * 4);
            const waveY = Math.sin(time * 4 + i) * 6;

            ctx.strokeStyle = `rgba(224, 247, 250, ${0.7 - i * 0.18})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(0, waveY, ringR, ringR * 0.4, Math.PI / 6 * i + time * 0.5, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();

        // Translucent Water Splash Bubbles
        particles.forEach(p => {
            p.angle += p.spinSpeed;
            p.y += Math.sin(time * 2 + p.angle) * 0.6;
            p.x += Math.cos(time * 2 + p.angle) * 0.6;

            ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + Math.sin(time * 5 + p.x) * 0.3})`;
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }

    // --------------------------------------------------
    // 3. ⚡ REAL 3D LIGHTNING PLASMA ANIMATION
    // --------------------------------------------------
    draw3DLightningPlasma(ctx, cx, cy, r, time, particles) {
        // High-Voltage Plasma Glow
        const auraGrad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.5);
        auraGrad.addColorStop(0, 'rgba(0, 229, 255, 0.9)');
        auraGrad.addColorStop(0.5, 'rgba(41, 121, 255, 0.5)');
        auraGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Core 3D Plasma Sphere
        const ballGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.3, '#00e5ff');
        ballGrad.addColorStop(0.7, '#1565c0');
        ballGrad.addColorStop(1, '#0a0a23');

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Jagged Lightning Bolts
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2;

        for (let i = 0; i < 3; i++) {
            const startAngle = Math.random() * Math.PI * 2;
            let currentX = cx + Math.cos(startAngle) * (r * 0.3);
            let currentY = cy + Math.sin(startAngle) * (r * 0.3);

            ctx.beginPath();
            ctx.moveTo(currentX, currentY);
            for (let step = 0; step < 4; step++) {
                const targetAngle = startAngle + (Math.random() - 0.5) * 0.8;
                const dist = (r * 0.25);
                currentX += Math.cos(targetAngle) * dist + (Math.random() - 0.5) * 8;
                currentY += Math.sin(targetAngle) * dist + (Math.random() - 0.5) * 8;
                ctx.lineTo(currentX, currentY);
            }
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
    }

    // --------------------------------------------------
    // 4. 🌌 REAL 3D GALAXY COSMIC ANIMATION
    // --------------------------------------------------
    draw3DGalaxyCosmic(ctx, cx, cy, r, time, particles) {
        // Deep Space Nebula Glow
        const auraGrad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 1.5);
        auraGrad.addColorStop(0, 'rgba(234, 128, 252, 0.9)');
        auraGrad.addColorStop(0.5, 'rgba(170, 0, 255, 0.4)');
        auraGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Core Galaxy Sphere
        const ballGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.3, '#ea80fc');
        ballGrad.addColorStop(0.7, '#aa00ff');
        ballGrad.addColorStop(1, '#1a0033');

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Spiral Galaxy Arm Particles
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(time * 0.4);
        particles.forEach((p, idx) => {
            const armAngle = (idx % 2 === 0 ? 0 : Math.PI) + (idx * 0.2) + time * 0.3;
            const dist = (idx / particles.length) * (r * 0.9);
            const px = Math.cos(armAngle) * dist;
            const py = Math.sin(armAngle) * dist;

            ctx.fillStyle = idx % 3 === 0 ? '#ffffff' : (idx % 2 === 0 ? '#ea80fc' : '#80d8ff');
            ctx.beginPath();
            ctx.arc(px, py, Math.random() * 2 + 1.2, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    // --------------------------------------------------
    // 5b. ❄️ REAL 3D FROSTBITE ICE DRAGON ANIMATION
    // --------------------------------------------------
    draw3DFrostbiteIce(ctx, cx, cy, r, time, particles) {
        // Glacial Frost Mist Glow
        const auraGrad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.5);
        auraGrad.addColorStop(0, 'rgba(128, 222, 234, 0.9)');
        auraGrad.addColorStop(0.5, 'rgba(0, 172, 193, 0.5)');
        auraGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Core Glacial Crystal Sphere
        const ballGrad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.3, '#80deea');
        ballGrad.addColorStop(0.7, '#00838f');
        ballGrad.addColorStop(1, '#00252e');

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Icy Snowflake & Crystal Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.6, cy); ctx.lineTo(cx + r * 0.6, cy);
        ctx.moveTo(cx, cy - r * 0.6); ctx.lineTo(cx, cy + r * 0.6);
        ctx.stroke();
    }

    // --------------------------------------------------
    // 5. 👑 REAL 3D GOLDEN SUN KING ANIMATION
    // --------------------------------------------------
    draw3DGoldenSun(ctx, cx, cy, r, time, particles) {
        // Solar Coronal Flare
        const auraGrad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.5);
        auraGrad.addColorStop(0, 'rgba(255, 238, 88, 0.9)');
        auraGrad.addColorStop(0.5, 'rgba(255, 171, 0, 0.5)');
        auraGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Shimmering 24K Gold Ball
        const ballGrad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.3, '#ffee58');
        ballGrad.addColorStop(0.7, '#f57f17');
        ballGrad.addColorStop(1, '#4a2800');

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Gold Sparkle Glints
        for (let i = 0; i < 4; i++) {
            const angle = time * 2 + (i * Math.PI / 2);
            const gx = cx + Math.cos(angle) * (r * 0.6);
            const gy = cy + Math.sin(angle) * (r * 0.6);

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(gx, gy, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // --------------------------------------------------
    // 6. 🌈 REAL 3D RAINBOW DISCO POP ANIMATION
    // --------------------------------------------------
    draw3DRainbowDisco(ctx, cx, cy, r, time) {
        const hue = (time * 60) % 360;
        const auraGrad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.4);
        auraGrad.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.8)`);
        auraGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
        ctx.fill();

        const ballGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.4, `hsl(${hue}, 100%, 60%)`);
        ballGrad.addColorStop(0.8, `hsl(${(hue + 120) % 360}, 100%, 40%)`);
        ballGrad.addColorStop(1, '#0f172a');

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // --------------------------------------------------
    // 7. 🌋 REAL 3D LAVA MAGMA ANIMATION
    // --------------------------------------------------
    draw3DLavaMagma(ctx, cx, cy, r, time, particles) {
        const ballGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        ballGrad.addColorStop(0, '#ff9100');
        ballGrad.addColorStop(0.4, '#ff3d00');
        ballGrad.addColorStop(0.8, '#dd2c00');
        ballGrad.addColorStop(1, '#1c0a00');

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Magma Veins
        ctx.strokeStyle = `rgba(255, 235, 59, ${0.6 + Math.sin(time * 4) * 0.3})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 1.5);
        ctx.stroke();
    }

    // --------------------------------------------------
    // 8. 💣 REAL 3D COMIC BOMB ANIMATION
    // --------------------------------------------------
    draw3DComicBomb(ctx, cx, cy, r, time) {
        const ballGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        ballGrad.addColorStop(0, '#757575');
        ballGrad.addColorStop(0.5, '#212121');
        ballGrad.addColorStop(1, '#000000');

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Lit Fuse Spark
        const fuseX = cx + r * 0.6;
        const fuseY = cy - r * 0.6;
        ctx.fillStyle = time % 0.2 > 0.1 ? '#ffea00' : '#ff3d00';
        ctx.beginPath();
        ctx.arc(fuseX, fuseY, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // --------------------------------------------------
    // 9. 🟢 REAL 3D CYBER MATRIX ANIMATION
    // --------------------------------------------------
    draw3DCyberMatrix(ctx, cx, cy, r, time) {
        const ballGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        ballGrad.addColorStop(0, '#e8f5e9');
        ballGrad.addColorStop(0.4, '#00e676');
        ballGrad.addColorStop(0.8, '#004d40');
        ballGrad.addColorStop(1, '#001b00');

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Digital Laser Ring Rotation
        ctx.strokeStyle = '#69f0ae';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 0.85, r * 0.25, time * 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    // --------------------------------------------------
    // 10. 🟤 REAL 3D CLASSIC MATTE BROWN LEATHER BALL (DEFAULT)
    // --------------------------------------------------
    draw3DClassicBall(ctx, cx, cy, r, time) {
        // Plain Matte Brown Leather Ball Gradient
        const ballGrad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.05, cx, cy, r);
        ballGrad.addColorStop(0, '#9e5d2d');
        ballGrad.addColorStop(0.35, '#6d3c19');
        ballGrad.addColorStop(0.75, '#42230e');
        ballGrad.addColorStop(1, '#211005');

        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Stitched Cream/White Leather Seam
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.85, Math.PI * 0.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// Global Singleton Engine Instance
const ballParticleEngine = new BallParticleEngine();

if (typeof window !== 'undefined') {
    window.ballParticleEngine = ballParticleEngine;
}
