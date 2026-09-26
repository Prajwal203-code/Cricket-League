# Secret Rotation Checklist

`backend/.env` was committed to this repository. It is now untracked and ignored, but the
credentials it contained must be treated as **public** and rotated. Removing the file from
tracking does not invalidate the secrets themselves.

The values were only ever in one local commit with no remote configured, so real-world exposure is
low. Rotate anyway — it is cheap now and expensive later.

## Status

- [x] `backend/.env` removed from git tracking (`git rm --cached`)
- [x] `.gitignore` updated to ignore `.env` and `.env.*` (previously only ignored `.env.*.local`)
- [ ] `JWT_SECRET` rotated
- [ ] `GOOGLE_CLIENT_SECRET` rotated
- [ ] `FACEBOOK_APP_SECRET` rotated

## 1. `JWT_SECRET`

Anyone holding the old value can forge a session token for any user account.

Generate a new one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Put it in `backend/.env` as `JWT_SECRET=<value>` and restart the server. Every existing session is
invalidated and all players are signed out once — expected, and the point of the exercise.

The server refuses to boot with the old placeholder value (`cricket_strike_super_secret_jwt_key_2026`);
it is on the blocklist in `backend/src/config/env.js`.

## 2. `GOOGLE_CLIENT_SECRET`

Google Cloud Console → **APIs & Services** → **Credentials** → your OAuth 2.0 Client ID →
**Add secret**, then delete the old one once the new value is deployed.

Note: this server verifies Google ID tokens against Google's public signing keys, which needs only
the **client ID** (public). The client secret is not used by any current code path — you can leave
`GOOGLE_CLIENT_SECRET` blank entirely unless you later add a server-side authorization-code
exchange. Rotate it regardless, since it was published.

`GOOGLE_CLIENT_ID` is public by design and does not need rotating.

## 3. `FACEBOOK_APP_SECRET`

Meta for Developers → your app → **App Settings** → **Basic** → **App Secret** → **Reset**.

This one is genuinely used server-side: Facebook access tokens are verified through the
`debug_token` endpoint, which authenticates with `app_id|app_secret`. Facebook login stops working
until the new value is in `.env`.

`FACEBOOK_APP_ID` is public and does not need rotating.

## 4. Database credentials

The committed file used the XAMPP default `root` with an empty password on `127.0.0.1:3307`. That
is fine for local development and unacceptable in production.

Before deploying, create a dedicated least-privilege account:

```sql
CREATE USER 'cricket_app'@'%' IDENTIFIED BY '<strong-random-password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON cricket_league.* TO 'cricket_app'@'%';
FLUSH PRIVILEGES;
```

Deliberately no `CREATE`/`DROP`/`ALTER`: schema changes are applied by the migration runner, which
should be run separately with an admin account, not by the running application.

## Git history

The secrets remain in commit `ade513a`. Left as-is by decision — there is no remote, so history
rewriting buys little here. If you ever push this repository to a hosted remote, purge it first:

```bash
git filter-repo --path backend/.env --invert-paths
```

Rotating the three secrets above makes the historical values worthless either way, which is the
more reliable protection.

## Preventing recurrence

`.gitignore` now covers `.env` and `.env.*` with an explicit `!.env.example` exception. Verify
before any commit that adds config:

```bash
git ls-files | grep -E "\.env$"
```

Empty output means nothing is tracked.
