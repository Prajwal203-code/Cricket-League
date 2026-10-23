'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { db } = require('../src/config/env');

try {
    if (!/^[a-zA-Z0-9_]+$/.test(db.database)) throw new Error('Invalid database name');
    const directory = path.resolve(process.argv[2] || path.join(__dirname, '../../.cleanup-archive/database-backups'));
    fs.mkdirSync(directory, { recursive: true });
    const filename = `${db.database}-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
    const destination = path.join(directory, filename);
    const bundled = path.resolve(__dirname, '../../../../mysql/bin/mysqldump.exe');
    const executable = process.env.MYSQLDUMP_PATH || (fs.existsSync(bundled) ? bundled : 'mysqldump');
    const result = spawnSync(executable, [
        `--host=${db.host}`, `--port=${db.port}`, `--user=${db.user}`,
        '--single-transaction', '--routines', '--triggers', '--events', '--hex-blob',
        `--result-file=${destination}`, db.database
    ], { env: { ...process.env, MYSQL_PWD: db.password }, encoding: 'utf8', windowsHide: true });
    if (result.error || result.status !== 0) {
        throw new Error(`Backup failed; do not use the partial file. ${result.error?.message || result.stderr}`);
    }
    const contents = fs.readFileSync(destination);
    if (!contents.length) throw new Error('Backup is empty');
    const sha256 = crypto.createHash('sha256').update(contents).digest('hex');
    fs.writeFileSync(`${destination}.sha256`, `${sha256}  ${filename}\n`, { flag: 'wx' });
    console.log(`Backup saved: ${destination} (${contents.length} bytes). SHA-256 checksum saved alongside it.`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
