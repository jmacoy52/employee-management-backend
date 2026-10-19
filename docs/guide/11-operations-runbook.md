# 11. Operations runbook

Values of secrets never go in Git, chat or this guide. Set them in the Render or Vercel dashboard
(or in a local, git-ignored `.env`). Only the **names** are listed here.

## Environment variables

### Backend (Render web service)

| Name | Required | Purpose |
|---|---|---|
| `DB_URL` (or `DATABASE_URL`) | yes | MySQL connection URI, with `?ssl-mode=REQUIRED` |
| `DB_SSL_CA_BASE64` / `DB_SSL_CA_PATH` / `DB_SSL_CA` | yes for Aiven | The database CA certificate (base64, a Render Secret File path, or PEM text) |
| `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_PORT` | no | Force TLS on/off; certificate check (keep on); port if the URL has none |
| `DB_CONNECTION_LIMIT` | no | Pool size (default 5) |
| `JWT_SECRET` | yes | Signs session tokens. Long and random |
| `JWT_EXPIRES_IN` | no | Session length (default `8h`) |
| `ALLOWED_ORIGINS` | yes in production | Frontend origins allowed by CORS (comma-separated, `*` allowed in the host) |
| `SEED_DEMO` | no | `true` loads demo data on `db:init`. Keep `false` in production |
| `SEED_DEMO_PAYROLL` | no | `false` stops the demo payroll seed on a demo database |
| `DEMO_MODE` | no | `true` / `false` / unset (automatic). Real deployments: `false` |
| `DEMO_PROTECTED_EMAILS` | no | Override the protected demo logins (empty = none) |
| `OWNER_SETUP_TOKEN_HASH` | no | bcrypt hash of the one-time owner setup token |
| `RESET_LINK_TTL_MINUTES` | no | Reset-link lifetime (default 60) |
| `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MIN` | no | Login/register/reset limit (10 per 15 min) |
| `ORG_SIGNUP_RATE_LIMIT_MAX`, `ORG_SIGNUP_RATE_LIMIT_WINDOW_MIN` | no | Sign-up and bootstrap limit (5 per 60 min) |
| `ENQUIRY_RATE_LIMIT_MAX`, `ENQUIRY_RATE_LIMIT_WINDOW_MIN` | no | Contact form limit (5 per 60 min) |
| `NODE_VERSION`, `PORT` | set by `render.yaml` / Render | Node 20; the port Render assigns |
| `PAYSTACK_SECRET_KEY` | for payments | Paystack secret key. Unset = payments off ("Payments coming soon, contact us"); also verifies webhook signatures |
| `PAYSTACK_PUBLIC_KEY` | no | Paystack public key (kept for a future inline checkout) |
| `APP_URL` | no | Frontend address used for the Paystack callback (default `https://emplocore.vercel.app`) |
| `PAYSTACK_CALLBACK_URL` | no | Overrides the callback (default `APP_URL/admin/billing/callback`) |
| `ENABLE_AUDIT_LOG_TEST_ROUTE` | local only | Re-enables the old test route that writes audit entries. Never in production |

The live service currently runs as the public demo. `render.yaml` documents `DEMO_MODE` as `"true"`,
but the dashboard value wins over the blueprint, so check the dashboard.

### Command-line scripts only

`ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `ADMIN_ORG`, `ADMIN_ORG_SLUG` (`create-admin`);
`OWNER_EMAIL`, `OWNER_NAME`, `OWNER_PASSWORD` (`create-owner`).

### Tests

`TEST_DB_URL` (backend `npm test`: a **disposable local** database that is wiped).
`E2E_BASE_URL`, `E2E_API_URL`, `E2E_SETUP_TOKEN`, `E2E_OUT`, `E2E_SCREENS`, `E2E_CHROME`
(frontend `e2e/e2e.py`, local stack only: it creates and changes users).

### Frontend (Vercel)

| Name | Purpose |
|---|---|
| `REACT_APP_API_URL` | API base URL, no trailing `/api` (defaults to the Render URL) |
| `REACT_APP_API_TIMEOUT_MS` | Request timeout (default 60000) |
| `REACT_APP_DEMO_MODE` | `true` shows demo logins; `false` for a real deployment. Vercel's value overrides `.env.production` |

These are baked in at **build** time: change them, then redeploy.

### Billing cron (Render cron service `emplocore-billing-daily`)

Defined in `render.yaml`: `npm install`, then `npm run billing:daily`, every day at 06:00 UTC
(06:00 Accra). It needs `DB_URL`, `DB_SSL_CA_BASE64` and `PAYSTACK_SECRET_KEY` (without the key it
still runs trials, grace and downgrades; it just skips the Paystack checks). It is safe to run twice
or by hand: `npm run billing:daily` locally against a database. Each run is logged and recorded in
`billing_job_runs`. Render bills cron jobs by run time, at least US$1 a month per job.
See [Subscriptions](09-monetisation-roadmap.md) and `docs/PAYSTACK_SETUP.md`.

## Deploying

1. Run the tests locally: backend `npm test`; frontend `CI=true npx react-scripts test --watchAll=false`.
2. **Backend first** when both change: push to `v1/aiven-production`. Render builds
   (`npm install && npm run db:init`, applying migrations), then starts `node server.js`. Watch the
   Render deploy log for `Applying migration ...` and `Server is running`.
3. Check `GET /api/health` returns `{"status":"ok","database":"connected"}`.
4. **Frontend:** push to `main`. Vercel builds and deploys. Check the commit status (GitHub shows
   Vercel's check) or the Vercel dashboard, then open the site.
5. Smoke test with the demo logins (admin, HR, employee).

## Running migrations

- Automatic on every Render deploy (`npm run db:init`). Only files not yet in `schema_migrations` run.
- By hand, from a trusted machine with database access:
  `DB_URL='...' DB_SSL_CA_PATH=./ca.pem npm run db:migrate` (same as `db:init --schema-only`).
- Local reset of a **disposable** database: `node scripts/init-db.js --reset --yes` (add
  `SEED_DEMO=true` for demo data). Never point this at production.

## Creating the owner and admins

- **Owner, over HTTPS (once):** `POST /api/platform/bootstrap-owner` with
  `{ setupToken, email, name, password }`. The token is checked against `OWNER_SETUP_TOKEN_HASH`
  (or the committed hash). It returns 410 once any owner exists. To set a new token, generate one and
  its hash (the command is in `config/ownerBootstrap.js`), put only the **hash** in Render, and keep
  the token private.
- **Owner, from the command line:**
  `npm run create-owner -- --email you@example.org --name "Your Name"`. The password comes from
  `OWNER_PASSWORD` or a hidden prompt, and is never printed. It refuses if an owner exists, unless you
  pass `--additional`.
- **Organisation admin, from the command line:**
  `npm run create-admin -- --org "Accra Logistics Ltd" --email admin@yourorg.org --name "Ama Owusu"`
  (creates an active organisation), or `--org-slug <slug>` to add an admin to an existing one. The
  password comes from `ADMIN_PASSWORD` or a hidden prompt. Usually not needed: organisations register
  on the website, or the owner creates them in the console.

## Rotating secrets

| Secret | How | Effect |
|---|---|---|
| `JWT_SECRET` | Set a new random value in Render, redeploy | Every session ends; users sign in again. Do it at once if it may have leaked, and on a schedule |
| Database password | Create a new password or user at Aiven, update `DB_URL`, redeploy, then revoke the old one | No downtime if done in that order |
| CA certificate | Replace `DB_SSL_CA_BASE64` or the Secret File when the provider rotates it | None |
| Owner setup token | Generate a new token + hash, set `OWNER_SETUP_TOKEN_HASH` | Only matters before an owner exists |
| Owner password | **My account** → *Change password* | Other owner sessions end |

## Rolling back a bad deploy

- **Frontend:** in Vercel, open *Deployments*, pick the last good one and promote it to production
  (Instant Rollback). Or `git revert` the bad commit and push.
- **Backend:** in Render, open the service's *Events/Deploys* and roll back to the previous deploy,
  or `git revert` and push.
- **Migrations do not roll back.** A previous code version keeps working as long as the migration was
  additive (new tables, nullable columns, indexes). If a migration changed or removed something the
  old code needs, write a new forward migration that fixes the schema; do not delete rows from
  `schema_migrations` by hand unless you have also undone that migration's changes.

## Restoring a database backup

1. **Do not restore over production first.** Create a new, empty database (or a new Aiven service
   from a backup or point-in-time recovery, if your plan offers it).
2. Load the backup: `gunzip -c emplocore-YYYY-MM-DD.sql.gz | mysql -h HOST -P PORT -u USER -p DATABASE`
   (TLS options as your provider requires).
3. Point a local or staging API at it and check: `/api/health`, sign-in, a few organisations, the latest
   payroll month.
4. Switch production: update `DB_URL` (and the CA if it changed) in Render and redeploy. The build runs
   any migrations the backup is missing.
5. Tell users about any data entered between the backup and the restore.

## Common errors and fixes

| Symptom | Cause | Fix |
|---|---|---|
| **429** "Too many attempts" on login | `authLimiter`: 10 tries per 15 minutes per IP | Wait for the window to pass. The counters are in memory, so a restart or redeploy also clears them. If it happens to many users behind one office IP, raise `AUTH_RATE_LIMIT_MAX` |
| Browser console: **CORS** error, the request "has no Access-Control-Allow-Origin" | The site's origin is not in `ALLOWED_ORIGINS` | Add the exact origin (scheme + host, no path) and redeploy the API. Previews need `https://emplocore-*.vercel.app` |
| "The server is waking up" | The Render instance was asleep or restarting | Wait up to a minute; consider an always-on plan |
| `/api/health` returns 503 | Database unreachable: wrong `DB_URL`, expired credentials, CA problem, provider outage | Check the Render log (`MySQL connection failed: ...`), the Aiven console, and the CA variable |
| **Render build fails at "Applying migration"** | SQL error in a new migration, or a partly applied earlier attempt | Read the error. MySQL DDL commits each statement, so earlier statements of that file may already be applied. Fix the schema by hand (or make the file safe to re-run), fix the migration, push again. The old version keeps serving meanwhile |
| Users suddenly signed out | `JWT_SECRET` changed, or their `token_version` was bumped (logout elsewhere, password or role change) | Expected; sign in again |
| 403 `PASSWORD_CHANGE_REQUIRED` | Temporary password in use | The user changes their password at `/account/password` |
| 403 `DEMO_ACCOUNT_PROTECTED` | Trying to change a demo login | Expected in demo mode; set `DEMO_MODE=false` for real deployments |
| 409 `SEAT_LIMIT_REACHED` | The organisation's active accounts reached `seat_limit` | Deactivate an account, or the owner raises the limit |
| Owner gets 404 on a user | The target is not an organisation admin (tenant boundary) | Expected; ask that organisation's admin |

## Moving to a bigger production database

1. Create the new MySQL 8 service (bigger plan or another provider), with TLS and a dedicated user that
   only has rights on the EmploCore database. Turn on backups.
2. Lower risk: announce a short maintenance window. Optionally suspend sign-ups during it.
3. Take a consistent dump of the current database
   (`mysqldump --single-transaction --routines --set-gtid-purged=OFF ...`).
4. Load it into the new database and compare row counts per table.
5. Test a staging API against the new database (`/api/health`, sign-in, payroll month, PDFs).
6. Update `DB_URL`, the CA variable and `DB_CONNECTION_LIMIT` in Render; redeploy.
7. Watch the logs and `/api/health`; keep the old database read-only for a few days, then delete it
   after a final backup.

For a first real (non-demo) deployment, also follow [PRODUCTION.md](../PRODUCTION.md), including its
go-live checklist.

## Local development and tests

- Backend: copy `.env.example` to `.env` (git-ignored), set a local `DB_URL` and `JWT_SECRET`, then
  `npm run db:init -- --seed` and `npm run dev`.
- Frontend: `REACT_APP_API_URL=http://localhost:5000 npm start`.
- Backend tests need `TEST_DB_URL` pointing at a disposable local MySQL database.
- End-to-end: start a local API (with demo data and an `OWNER_SETUP_TOKEN_HASH` for a local test
  token) and a built frontend, then `python3 e2e/e2e.py` with the `E2E_*` variables. Never against
  production.
