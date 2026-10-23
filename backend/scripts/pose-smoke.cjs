// Browser regression against the shipped FBX, including its duplicate helper joints.
// Run against a local test database with the same setup as ui-smoke.cjs.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const url = process.env.CRICKET_QA_URL || 'http://localhost:3001';
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use a local test server.');
const output = path.resolve(__dirname, '../../.load-test-results');
fs.mkdirSync(output, { recursive: true });

async function verifyPose(page, surface) {
    await page.waitForFunction(key => window[key]?.getPose(), surface, { timeout: 45000 });
    const report = await page.evaluate(key => {
        const api = window[key], pose = api.getPose(), gear = api.getEquipment();
        const frame = api.getMesh().parent;
        const point = bone => frame.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
        const errors = [];
        pose.update(0, 0);
        const initial = Object.fromEntries(Object.entries(pose.bones).map(([name, bone]) => [name, point(bone)]));
        for (const side of ['Left', 'Right']) {
            if (!new RegExp(`${side}Hand$`).test(pose.bones[`${side}Hand`].name)) errors.push('Grip uses a finger instead of a wrist');
            if (pose.bones[`${side}Hand`].parent.name === pose.bones[`${side}Hand`].name) errors.push('Grip uses a helper joint');
        }
        for (let sample = 0; sample <= 32; sample++) {
            pose.update(sample, sample / 32);
            for (const [side, gripY] of [['Left', -.055], ['Right', -.145]]) {
                const grip = frame.worldToLocal(gear.bat.localToWorld(new THREE.Vector3(0, gripY, 0)));
                const wristTarget = grip.add(new THREE.Vector3(0, .02, -.105));
                if (point(pose.bones[`${side}Hand`]).distanceTo(wristTarget) > .002) errors.push(`Disconnected ${side} grip at ${sample}`);
                if (point(pose.bones[`${side}Foot`]).distanceTo(initial[`${side}Foot`]) > .001) errors.push(`Foot drift at ${sample}`);
                for (const [a, b] of [['Arm', 'ForeArm'], ['ForeArm', 'Hand'], ['UpLeg', 'Leg'], ['Leg', 'Foot']]) {
                    const length = point(pose.bones[side + a]).distanceTo(point(pose.bones[side + b]));
                    if (Math.abs(length - initial[side + a].distanceTo(initial[side + b])) > .001) errors.push('Limb stretched');
                }
            }
            api.getMesh().traverse(bone => {
                if (bone.isBone && !bone.matrixWorld.elements.every(Number.isFinite)) errors.push('Invalid skeleton transform');
            });
        }
        pose.update(0, 0);
        for (const [name, start] of Object.entries(initial)) {
            if (point(pose.bones[name]).distanceTo(start) > .001) errors.push('Stance changed after swing');
        }
        if (gear.bat.localToWorld(new THREE.Vector3(0, -.9, 0)).y >= pose.bones.LeftHand.getWorldPosition(new THREE.Vector3()).y) errors.push('Bat does not point toward the turf');
        Object.values(gear).forEach(item => item.traverse(mesh => {
            for (const material of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) {
                if (material.map?.isCanvasTexture) errors.push('Jersey atlas leaked onto equipment');
            }
        }));
        return { errors, joints: Object.keys(pose.bones).length };
    }, surface);
    assert.deepEqual(report.errors, [], `${surface}: ${report.errors.join(', ')}`);
    assert.equal(report.joints, 20);
    console.log(`${surface}: full swing, connected grip, planted feet, stable skeleton and equipment materials passed.`);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 430, height: 920 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.locator('#csOnboardNextBtn').click();
        await page.locator('#csCtaBtn').click();
        await page.locator('#characterStudioModal').waitFor({ state: 'hidden' });
        if (await page.locator('#dailyStreakModal').isVisible()) await page.locator('#closeDailyStreakModal').click();
        await verifyPose(page, '__hero3d');
        await page.evaluate(() => Hero3DBatsman.triggerSwing());
        await page.waitForFunction(() => __hero3d.getBat().rotation.x < -.5);
        await page.waitForFunction(() => __hero3d.getBat().rotation.x > -.2);
        await page.screenshot({ path: path.join(output, 'cricket-stance-final.png') });

        // Opening the editor destroys and remounts the renderer; saving does it again.
        await page.locator('#settingsBtn').click();
        await verifyPose(page, '__hero3d');
        await page.locator('[data-tab="gear"]').click();
        for (const label of ['Pads', 'Gloves']) {
            await page.locator('.cs-gear-row').filter({ has: page.locator('.cs-gear-label', { hasText: label }) }).locator('button').click();
        }
        assert.equal(await page.evaluate(() => __hero3d.getEquipment().leftPad.visible || __hero3d.getEquipment().rightGlove.visible), false);
        await page.locator('#csCtaBtn').click();
        await verifyPose(page, '__hero3d');
        assert.equal(await page.evaluate(() => __hero3d.getEquipment().leftPad.visible || __hero3d.getEquipment().rightGlove.visible), false);

        // Enter free practice to inspect the same asset on the pitch, without rewards.
        await page.evaluate(() => startMatchPlay());
        await verifyPose(page, '__match3d');
        assert.equal(await page.evaluate(() => __match3d.getEquipment().leftPad.visible || __match3d.getEquipment().rightGlove.visible), false);
        const modelId = await page.evaluate(() => __match3d.getMesh().uuid);
        await page.evaluate(() => {
            Hero3DBatsman.setGear('pads', { on: true });
            Hero3DBatsman.setGear('gloves', { on: true });
            Match3DEngine.init('match3dCanvas', 'inmatchStadiumViewport');
        });
        assert.equal(await page.evaluate(() => __match3d.getMesh().uuid), modelId, 'Next match reuses the loaded player');
        assert.equal(await page.evaluate(() => __match3d.getEquipment().leftPad.visible && __match3d.getEquipment().rightGlove.visible), true);
        await page.evaluate(() => Match3DEngine.triggerShot('Straight', 4, 'Perfect'));
        await page.waitForFunction(() => __match3d.getBat().rotation.x < -.5);
        await page.waitForFunction(() => __match3d.getBat().rotation.x > -.2);
        await page.screenshot({ path: path.join(output, 'cricket-match-stance.png') });
        await page.evaluate(() => Match3DEngine.setCameraMode('celebration'));
        await page.screenshot({ path: path.join(output, 'cricket-match-front.png') });
        assert.deepEqual(errors, []);
        console.log('POSE PASS: actual FBX, home/editor remounts, equipment settings, match reuse and animated swings; no page errors.');
    } catch (error) {
        await page.screenshot({ path: path.join(output, 'pose-failure.png') }).catch(() => {});
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
