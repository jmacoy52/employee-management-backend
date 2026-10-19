# Moving EmploCore to a production database

The public deployment (Render + Aiven + Vercel) runs as a **demo**: it has sample data and three
protected demo logins. These steps set up a real deployment for an organisation: an empty database,
your own admin account and no demo content. No step needs code changes.

## 1. Create the production database

- MySQL 8.0 or later (Aiven, AWS RDS, DigitalOcean, or your own server). Use a **new** database. Don't reuse the demo one.
- Create a dedicated database user with rights on that database only.
- Keep TLS on. Download the provider's CA certificate (Aiven: *Overview → CA certificate*).

## 2. Configure the API (Render → Environment)

| Variable | Value |
|---|---|
| `DB_URL` | `mysql://USER:PASSWORD@HOST:PORT/DATABASE?ssl-mode=REQUIRED` |
| `DB_SSL_CA_PATH` | `/etc/secrets/db-ca.pem`, uploaded as a Render **Secret File** (or `DB_SSL_CA_BASE64`) |
| `JWT_SECRET` | A new random value, at least 32 bytes: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `SEED_DEMO` | unset or `false`, so no sample data is loaded |
| `DEMO_MODE` | `false`, so the demo-account protection is off |
| `DEMO_PROTECTED_EMAILS` | unset |
| `ALLOWED_ORIGINS` | Your frontend URL(s) only, e.g. `https://hr.yourorg.org`. Remove `localhost` |
| `JWT_EXPIRES_IN` | `8h` (default) or shorter |

Never commit these values. `.env` is git-ignored; `.env.example` holds placeholders only.

## 3. Create the tables (migrations)

The Render build command (`npm install && npm run db:init`) creates the schema and applies every
pending migration on each deploy. With `SEED_DEMO` unset, nothing else is inserted (demo payroll is only
added to a database that already holds the seeded demo data, and never with `DEMO_MODE=false`). To run it by hand
from a trusted machine:

```bash
DB_URL='mysql://...' DB_SSL_CA_PATH=./db-ca.pem npm run db:migrate
```

The output ends with the row counts. A new database shows `users: 0, employees: 0, departments: 0`.

## 4. Create the first admin

```bash
DB_URL='mysql://...' DB_SSL_CA_PATH=./db-ca.pem \
  npm run create-admin -- --email ama.owusu@yourorg.org --name "Ama Owusu"
```

The script asks for the password twice and hides what you type. For automation, set `ADMIN_PASSWORD`
in the environment instead; never put it on the command line. The password is never printed. Rules:
at least 8 characters, with a letter and a number. The script refuses to touch an existing account.
Then sign in, open **User Management** and create HR accounts. Public self-sign-up is closed:
admins create accounts in **User Management** (the API also lets HR create `employee` accounts), and HR
creates employee records and links them to those accounts.

### 4b. Create the platform owner and approve organisations
Create the owner once, either with `POST /api/platform/bootstrap-owner` (setup token checked against `OWNER_SETUP_TOKEN_HASH` or the hash committed in `config/ownerBootstrap.js`; returns 410 once an owner exists) or with `npm run create-owner`. `npm run create-admin` now needs `--org "Organisation name"` (creates an active organisation) or `--org-slug <slug>`. New organisations that register publicly are **pending** until the owner approves (or rejects) them in the owner console (`/owner`); the owner manages their own name, e-mail and password under *My account*, and demo requests from the contact page appear under *Enquiries*. Billing (Paystack) will later drive each organisation's `plan` and `status` fields; there is no payment code yet.

**Tenant boundary.** The owner console follows the usual SaaS support boundary: for each organisation the owner sees its details, its admin account(s) (name, e-mail, status, last sign-in) and how many admin, HR and employee accounts it has (active and inactive), but never the names or e-mails of its HR and employee staff. *Organisation admins* (owner console) lists admin accounts only. The owner can reset an organisation admin's password (a temporary password shown once, or a one-time reset link), deactivate or reactivate the admin, and approve, reject, suspend or reactivate the organisation; each action is audit-logged with the owner's id. The API enforces this: `/api/platform/admins/:id/*` answers 404 for any account that is not an organisation admin. Organisation admins keep full control of their own HR and employee accounts.

**Audit-log visibility.** Migration `008_audit_scope_last_login.sql` adds `audit_logs.scope` and `users.last_login_at`, and backfills both (scope from the action name and whether an owner did it; last sign-in from existing `LOGIN` entries). The owner sees `platform` entries only: owner actions and organisation-level events (registrations, approve/reject, suspend/reactivate, edits and deletions, enquiries, owner resets and deactivations of organisation admins). Routine activity inside an organisation (staff and employee changes, departments, payroll, sign-ins) is visible only to that organisation's admins, who see every entry filed under their organisation. HR and employee accounts have no audit-log access (`/api/audit-logs` and `/api/audit-logs/recent` return 403). Nothing that was logged before has stopped being logged.

## 5. Configure the frontend (Vercel → Settings → Environment Variables)

| Variable | Value |
|---|---|
| `REACT_APP_DEMO_MODE` | `false`: hides the demo logins and "Try the demo" buttons. Vercel values override the committed `.env.production` |
| `REACT_APP_API_URL` | Your API URL, e.g. `https://api.yourorg.org` (no `/api` suffix) |

Redeploy the frontend after you change them, because `REACT_APP_*` values are baked in at build time.

## 6. Health checks and monitoring

- `GET /api/live` shows the process is up (no database). Use it as Render's health check path.
- `GET /api/health` returns `200 {"database":"connected"}` or `503`. Point an uptime monitor at it
  (e.g. UptimeRobot, Better Stack).

## 7. Backups

- Turn on the provider's automatic daily backups and point-in-time recovery if you can. Check how
  long backups are kept.
- Take an off-site logical backup too, e.g. a nightly job:
  `mysqldump --single-transaction --routines --set-gtid-purged=OFF -h HOST -P PORT -u USER -p DATABASE | gzip > emplocore-$(date +%F).sql.gz`
  Store it encrypted and outside the database provider.
- Test a restore into a scratch database at least once a quarter.

## 8. Rotating secrets

- **JWT secret:** set a new `JWT_SECRET` and redeploy. Every existing session ends and users sign in again.
  Do this at once if the secret may have leaked, and on a schedule (e.g. yearly).
- **Database password:** create the new password at the provider, update `DB_URL`, redeploy, then revoke
  the old one.
- **CA certificate:** replace the Secret File when the provider rotates it.

## 9. Before go-live checklist

- [ ] `/api/health` reports `connected`
- [ ] No `@emplocore.demo` accounts exist (User Management)
- [ ] `DEMO_MODE=false` on the API and `REACT_APP_DEMO_MODE=false` on the frontend; the landing page shows no demo logins
- [ ] `ALLOWED_ORIGINS` lists only your frontend
- [ ] Backups are on and one restore has been tested
- [ ] Departments are set up (HR → Departments) before staff records are added
- [ ] Payroll: the PAYE bands and SSNIT rates in `config/ghanaPayroll.js` are the ones in force (HR → Payroll → Tax rates shows them); add a new dated entry when GRA or SSNIT change them

## Switching an existing demo database to real use

If you would rather keep the current database: set `DEMO_MODE=false`, redeploy, then as admin delete the
three demo users, and as HR delete the sample employees and departments. The demo payslips stay with the
demo organisation's payroll history (they cannot be deleted from the app once published). A fresh database
(above) is cleaner.
