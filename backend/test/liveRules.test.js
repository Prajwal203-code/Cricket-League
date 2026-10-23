const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('live reload activates a revision, retains snapshots and rejects partial or stale writes', async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cricket-rules-'));
    const file = path.join(temporary, 'rules.json');
    const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/progression.json'), 'utf8'));
    fs.writeFileSync(file, JSON.stringify(rules));
    process.env.PROGRESSION_CONFIG_FILE = file;
    const live = require('../src/config/liveRules');
    try {
        const original = live.getRules();
        rules.revision++;
        rules.free.coins += 25;
        fs.writeFileSync(file, JSON.stringify(rules));
        assert.equal(await live.refreshRules(), true);
        assert.equal(live.getRules().free.coins, rules.free.coins);
        assert.equal(original.free.coins, rules.free.coins - 25);
        fs.writeFileSync(file, '{');
        assert.equal(await live.refreshRules(), false);
        assert.equal(live.getRules().free.coins, rules.free.coins);
        rules.free.coins++;
        fs.writeFileSync(file, JSON.stringify(rules));
        assert.equal(await live.refreshRules(), false, 'editing without a new revision is rejected');
    } finally {
        fs.unlinkSync(file);
        fs.rmdirSync(temporary);
    }
});
