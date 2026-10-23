#!/usr/bin/env node
'use strict';
require('../src/config/env');
const fs = require('node:fs');
const path = require('node:path');
const { validateRules, getRules, rulesPath } = require('../src/config/liveRules');

const [operation = '--check', candidatePath = rulesPath] = process.argv.slice(2);
try {
    if (!['--check', '--publish'].includes(operation)) throw new Error('Usage: npm run rules -- --check|--publish [candidate.json]');
    const candidate = validateRules(JSON.parse(fs.readFileSync(path.resolve(candidatePath), 'utf8').replace(/^\uFEFF/, '')));
    if (operation === '--publish') {
        const current = getRules();
        if (candidate.revision <= current.revision) throw new Error('The candidate revision must be higher than the active revision.');
        if (candidate.xp.maxLevel < current.xp.maxLevel) throw new Error('The level limit cannot be reduced.');
        const history = path.join(path.dirname(rulesPath), 'history');
        fs.mkdirSync(history, { recursive: true });
        fs.copyFileSync(rulesPath, path.join(history, `${current.version}.json`), fs.constants.COPYFILE_EXCL);
        const temporary = `${rulesPath}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, `${JSON.stringify(candidate, null, 2)}\n`, { flag: 'wx' });
        fs.renameSync(temporary, rulesPath);
        console.log(`Published revision ${candidate.revision}. Running servers adopt it within two seconds; active matches retain their original rules.`);
    } else console.log(`Valid progression rules, revision ${candidate.revision}.`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
