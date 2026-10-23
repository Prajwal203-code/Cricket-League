# Cricket League

The existing browser game runs on Express, Socket.IO and MySQL/MariaDB. It keeps its current screens and 3D assets. Player progression, currency and live match results are decided by the server.

## Run locally

Use Node.js 22 or newer. From `backend/`, run `npm ci`, copy `.env.example` to `.env` if needed, and set the database connection. Then run `npm start` and open <http://localhost:3005>. There is no client build step.

On this Windows/XAMPP checkout, `start-cricket-league.bat` starts XAMPP MariaDB on the configured port and then starts the app. The defaults are app port **3005** and database port **3307**. Keep these separate from any other local apps or MySQL services. `npm run dev` uses Node's built-in watch mode.

Startup applies versioned migrations. Before upgrading a database with real accounts, run `npm run backup`. Backups and SHA-256 checksums go to `.cleanup-archive/database-backups/` outside the public directory. Override the executable with `MYSQLDUMP_PATH` or provide a destination with `npm run backup -- <directory>`. Test restores on a separate database; keep a protected copy off the development machine for production.

## Automatic progression and live balance

`backend/config/progression.json` controls the XP curve, level-up coins, milestone currencies, level multiplier, match performance rewards and free-reward cooldown. The default level limit is 10,000, with rewards generated beyond the original 50 levels and capped amounts.

- Earned XP carries through every crossed level. Each newly reached level automatically awards its coins and gems in the same database transaction.
- Previously unlocked, unclaimed roadmap rewards remain collectible. The recommended reward prioritizes major milestones, then regular milestones, then the highest available level.
- Match coins and XP scale with the player's level, up to the configured cap. Runs, sixes and wickets add bounded performance XP. Draws refund the entry fee; forfeiting players receive no match coins or XP.
- Practice is free and does not award currency, XP or ranked progress.
- Entry fees, prizes and venue unlock levels come from the `tours` table. Refunds always use the original reservation amount.

To change balance without rebuilding or restarting the client:

1. Copy `config/progression.json` to a candidate file and increment `revision`.
2. Edit the candidate. Run `npm run rules -- --check <candidate.json>` from `backend/`.
3. Publish with `npm run rules -- --publish <candidate.json>`.

Publication validates bounds and unknown fields, saves the previous configuration under `backend/config/history/`, and atomically replaces the active file. Running servers check every two seconds. Open clients refresh profile and reward information every 30 seconds and after actions. In-flight matches retain the rules chosen at match creation. Invalid or stale runtime edits retain the last good rules; invalid configuration at startup prevents boot. To roll back, copy a saved configuration, increase its revision above the current one, and publish it. The level limit cannot be reduced.

Only the values in this JSON file are hot-reloaded. Other feature rules and shot mechanics live in `backend/src/config/gameRules.js` and require a server restart after a code change. Changing the XP curve preserves earned levels and stored XP; the next positive XP award applies the new curve. This is deterministic game logic, not an AI service that invents rewards.

## Reliability and deployment

Wallet changes use account locks and an audit ledger. Match reservations prevent duplicate entry charges. Completed match payouts are saved once and returned on retry. Startup recovers pending payouts before refunding abandoned matches. `/api/health` checks database connectivity and reports the active rules version; `/api/config` exposes only public progression settings.

Run **one game server process**. PM2 is configured for one fork. Queues, active matches and presence are process-local; the optional Redis Socket.IO adapter alone does not distribute them. A restart refunds unfinished matches, rather than resuming their gameplay. Horizontal scaling requires durable/shared match ownership and queue state before adding workers.

For production, use HTTPS, a restricted database account, a strong stable JWT secret, the actual `CORS_ORIGINS`, and real social-provider credentials if offering social login. Set `TRUST_PROXY=1` only behind a trusted single-hop proxy. Monitor settlement errors and backup/restore health. Purchases without an implemented payment flow are shown as unavailable. The current implementation has automated coverage below; it has not been certified for production capacity or payment compliance.

## Verification

From `backend/`:

```powershell
npm test                         # Pure rules tests; database tests skip by default
$env:RUN_DB_TESTS='1'
npm test                         # Database + HTTP + two-player socket integration
npm audit
```

Database tests use randomized `cricket_test_*` databases and remove only their own fixtures. The configured database user must be allowed to create and drop those test databases. Tests cover concurrent claims/spends, XP boundaries, automatic milestones, hot reload, transaction rollback, original-fee refunds, settlement failure/recovery, private rooms and forfeiture.

Optional browser QA: start a separate local server with `DB_NAME=cricket_review_<suffix>` and `PORT=3001`. Set `PLAYWRIGHT_MODULE` to an installed `playwright-core` module (with Chromium installed) and run `node scripts/ui-smoke.cjs`. `CRICKET_QA_URL` defaults to `http://localhost:3001`. This creates test guest accounts, completes a private match through both browsers, checks responsive controls and confirmed rewards, and saves screenshots in `.load-test-results/`. Use a test database, not player data.

Run `node scripts/pose-smoke.cjs` with the same browser setup to check the actual loaded player model. It covers grip reach through a full swing, planted feet, unchanged limb lengths, equipment textures, character-editor remounts, saved pad/glove visibility and reuse of the match scene.

## Player stance

Home, character studio and matches share `backend/public/cricketPlayerRig.js`. It poses the existing FBX from its imported neutral transforms, using exact body joints instead of duplicate clothing helpers or finger joints. One bat transform drives both hands; the pads follow the shins. The bundled baseball idle animation is not played. Equipment materials remain separate from the jersey atlas.

Pose changes are served directly as JavaScript and need no client build. The original FBX still needs to download before the player appears; this change does not replace or compress the character asset.

## Project cleanup

Generated verification images, reports, scrape outputs and an unused test model were moved out of active source/public paths into `.cleanup-archive/2026-10-09/`. The archive contains 130 files, approximately 48.67 MiB, and preserves their relative paths for recovery. It is ignored by Git; this cleanup does not reclaim disk space.

The 33 model-authoring Python scripts now live in `tools/model-authoring/`. Run them from the repository root so their existing relative paths resolve. Runtime models and textures remain in `backend/public/models/`. Loose Unity prototype scripts are retained; they are separate from the working browser client.
