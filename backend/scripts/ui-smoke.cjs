// Optional local browser QA: PLAYWRIGHT_MODULE points to an installed playwright-core package.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const url = process.env.CRICKET_QA_URL || 'http://localhost:3001';
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Run this fixture only on a local test server.');
const output = path.resolve(__dirname, '../../.load-test-results');
fs.mkdirSync(output, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true });
    const errors = [];
    const pages = [];
    const outcomes = [];
    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        context.setDefaultTimeout(15000);
        const page = await context.newPage();
        page.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
            if (typeof payload !== 'string' || !payload.startsWith('42[')) return;
            const [name, data] = JSON.parse(payload.slice(2));
            if (name === 'ball_result') { outcomes.push(data); console.log(`Result: ${data.timing}, ${data.runs} runs, timeout=${data.timedOut}`); }
        }));
        pages.push(page);
        page.on('dialog', dialog => { console.log('Player 1 dialog:', dialog.message()); return dialog.dismiss(); });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.locator('#homeProgressHint').filter({ hasText: 'match rewards' }).waitFor({ timeout: 20000 });
        await page.locator('#csOnboardNextBtn').click();
        await page.locator('#csCtaBtn').click();
        await page.locator('#characterStudioModal').waitFor({ state: 'hidden' });
        if (await page.locator('#dailyStreakModal').isVisible()) await page.locator('#closeDailyStreakModal').click();
        await page.locator('#homeTourProgressWidget').click();
        await page.locator('#priorityRewardBtn').waitFor({ state: 'visible' });
        assert.match(await page.locator('#progressionSummary').innerText(), /Priority: level 1/);
        await page.screenshot({ path: path.join(output, 'progression-mobile.png') });
        await page.locator('#priorityRewardBtn').click();
        await page.locator('#roadmapClaimModal').waitFor({ state: 'visible' });
        await page.locator('#dismissRoadmapClaimBtn').click();
        await page.locator('#priorityRewardBtn').waitFor({ state: 'hidden' });
        assert.match(await page.locator('#progressionSummary').innerText(), /Next milestone: level 5/);
        await page.locator('#roadmapBackBtn').click();
        await page.locator('#freeCoinsWidget').click();
        await page.locator('#freeInstantClaimBtn:not([disabled])').waitFor({ state: 'visible' });
        await page.locator('#freeInstantClaimBtn').click();
        await page.locator('#freeInstantClaimBtn .free-claim-sub').filter({ hasText: 'Ready in' }).waitFor();
        assert.equal(await page.locator('#freeInstantClaimBtn').isDisabled(), true);
        await page.locator('#closeFreeRewardsBtn').click();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator('#homeTourProgressWidget').click();
        await page.locator('#progressionSummary').filter({ hasText: 'Next milestone' }).waitFor();
        await page.screenshot({ path: path.join(output, 'progression-desktop.png') });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

        // Exercise the actual controls on both sides of a private live match.
        await page.locator('#roadmapBackBtn').click();
        const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
        secondContext.setDefaultTimeout(15000);
        const opponent = await secondContext.newPage();
        pages.push(opponent);
        opponent.on('dialog', dialog => { console.log('Player 2 dialog:', dialog.message()); return dialog.dismiss(); });
        opponent.on('pageerror', error => errors.push(error.message));
        await opponent.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await opponent.locator('#homeProgressHint').filter({ hasText: 'match rewards' }).waitFor({ timeout: 20000 });
        await opponent.locator('#csOnboardNextBtn').click();
        await opponent.locator('#csCtaBtn').click();
        await opponent.locator('#characterStudioModal').waitFor({ state: 'hidden' });
        if (await opponent.locator('#dailyStreakModal').isVisible()) await opponent.locator('#closeDailyStreakModal').click();
        await page.locator('#homeCustomRoomWidget').click();
        await page.locator('#btnCreateCustomRoom').click();
        await page.locator('#roomCreatedBox').waitFor({ state: 'visible' });
        const code = (await Promise.all([1, 2, 3, 4].map(index => page.locator(`#pinDigit${index}`).textContent()))).join('');
        await opponent.locator('#homeCustomRoomWidget').click();
        await opponent.locator('#joinRoomCodeInput').fill(code.trim());
        await opponent.locator('#btnJoinCustomRoom').click();
        await page.locator('#screen-match').waitFor({ state: 'visible' });
        await opponent.locator('#screen-match').waitFor({ state: 'visible' });
        console.log('Both players entered the match.');
        const players = [page, opponent];
        const mobileControls = await opponent.locator('#inmatchControlDeck').boundingBox();
        assert.ok(mobileControls.y + mobileControls.height <= 844, 'All mobile match controls must fit on screen');
        await opponent.screenshot({ path: path.join(output, 'live-match-mobile.png'), timeout: 10000 });
        for (let ball = 0; ball < 12; ball++) {
            if (await page.locator('#screen-result').isVisible()) break;
            const bowler = await page.locator('#bowlingControlsOverlay').isVisible() ? page : opponent;
            const batsman = bowler === page ? opponent : page;
            console.log(`Ball ${ball + 1}: player ${bowler === page ? 1 : 2} bowls.`);
            await bowler.locator('#lockDeliveryBtn:not([disabled])').waitFor();
            const shotBox = await batsman.locator('.shot-action-btn[data-shot="defensive"]').boundingBox();
            await bowler.locator('#lockDeliveryBtn').click();
            await batsman.locator('.shot-action-btn[data-shot="defensive"]:not([disabled])').waitFor();
            await batsman.waitForFunction(() => parseFloat(document.getElementById('verticalTimingNeedle').style.top) >= 44, null, { timeout: 15000 });
            // A direct pointer event avoids locator actionability work delaying a timed shot.
            await batsman.mouse.click(shotBox.x + shotBox.width / 2, shotBox.y + shotBox.height / 2);
            await batsman.locator('.shot-action-btn[data-shot="defensive"][disabled]').waitFor({ state: 'attached' });
            await batsman.waitForFunction(() =>
                document.getElementById('matchRoleLabel').textContent !== 'PLAY YOUR SHOT'
                || !document.getElementById('screen-result').classList.contains('hidden'),
                null, { timeout: 15000 });
        }
        for (const player of players) {
            await player.locator('#payoutNotification').filter({ hasText: 'REWARDS COLLECTED' }).waitFor({ timeout: 30000 });
        }
        await page.screenshot({ path: path.join(output, 'live-match-result.png') });
        assert.ok(outcomes.length > 0, 'The match must produce server-confirmed deliveries');
        assert.ok(outcomes.every(result => !result.timedOut), 'Every delivery must be played through the UI, without server timeout fallback');
        assert.deepEqual(errors, []);
        console.log('UI PASS: onboarding, mobile roadmap, priority claim, persisted cooldown, desktop layout, private room, two-player batting/bowling and confirmed rewards; no page errors.');
    } catch (error) {
        console.error('UI failure:', error);
        for (const [index, page] of pages.entries()) {
            await page.screenshot({ path: path.join(output, `ui-failure-${index}.png`), timeout: 5000 }).catch(() => {});
            fs.writeFileSync(path.join(output, `ui-failure-${index}.txt`), await page.locator('body').innerText().catch(() => 'Page closed'));
        }
        throw error;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
