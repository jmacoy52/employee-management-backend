# EmploCore — Backend API (v1)

This is the Express and MySQL REST API behind the EmploCore frontend
([employee-management-system-frontend](https://github.com/jmacoy52/employee-management-system-frontend), live at https://emplocore.vercel.app).

> **Moving to a real (non-demo) deployment?** Follow [docs/PRODUCTION.md](docs/PRODUCTION.md): new database, migrations, first admin, demo mode off, backups and secrets.

> **Branch note:** this branch (`v1/aiven-production`) continues the v1 API that the frontend calls (`/api/users/*`, `/api/employees`, `/api/departments`, `/api/audit-logs`). The v2 rewrite on `main` (multi-tenant, `/api/admin/*`, paginated responses) is **not** compatible with the current frontend.

## Stack
Node 18+, Express 5, mysql2 (connection pool with TLS, raw parameterised SQL), bcryptjs, jsonwebtoken, express-validator, helmet, express-rate-limit.

## API

| Method & path | Access | Notes |
|---|---|---|
| `POST /api/users/register` | Public, or an admin token | Public sign-up creates `employee` accounts only. An admin token can create `hr` and `admin`. Rate limited |
| `POST /api/users/login` | Public | Returns `{ token, user }` (`user.mustChangePassword`). Deactivated accounts get `403 ACCOUNT_DEACTIVATED`. Rate limited |
| `POST /api/users/logout` | Signed in | Revokes every token of the account (signs out all devices) |
| `PUT /api/users/change-password` | Signed in | `{ currentPassword, newPassword }`; returns a fresh token, other sessions are signed out |
| `POST /api/users/reset-password` | Public | `{ token, newPassword }` with a one-time link from an admin. Rate limited |
| `GET /api/users/me`, `GET /api/users/me/employee` | Signed in | Current account; the employee record linked to it (404 if none) |
| `GET/PUT /api/users/profile` | Signed in | Profile fields: first_name, last_name, phone, address |
| `GET /api/users/all` | Admin | Includes `is_active` and the linked employee |
| `GET /api/users/linkable` | HR, Admin | id/username/email/role and current link, for the link-account control |
| `PUT /api/users/:id/role` | Admin | Admins can't change their own role. Revokes the user's tokens |
| `PUT /api/users/:id/status` | Admin | `{ is_active: true|false }`. Deactivating revokes tokens. Not on yourself |
| `POST /api/users/:id/temporary-password` | Admin | Optional `{ password }`; otherwise one is generated and returned once. User must change it at next sign-in |
| `POST /api/users/:id/reset-link` | Admin | Returns a one-time `token` (default 60 min) for `/reset-password?token=...` |
| `DELETE /api/users/:id` | Admin | Admins can't delete their own account |
| `GET /api/employees` (`?limit=&offset=&department_id=`), `GET /api/employees/:id` | HR, Admin | List includes `user_id`, `linked_username`, `linked_email`, `department_id`, `department_name`. `department_id=none` lists employees without a department |
| `POST /api/employees`, `PUT/DELETE /api/employees/:id` | HR, Admin | Validated (name, position, department, salary ≥ 0; email optional, unique). Send `department_id`; the older free-text `Department` is still accepted (matched by name, or a department is created). A deactivated department cannot receive new employees |
| `PUT /api/employees/:id/link` | HR, Admin | `{ user_id }` to link an account, `{ user_id: null }` to unlink |
| `GET /api/departments`, `GET /api/departments/:id` | HR, Admin | List with `employee_count`, `head_name`, `is_active`; one department includes `members` |
| `POST /api/departments`, `PUT /api/departments/:id` | HR, Admin | `{ name, description? }`. Names are unique (case-insensitive). Renaming updates the employees' `Department` copy |
| `PUT /api/departments/:id/status` | HR, Admin | `{ is_active: true|false }`. Deactivated departments keep their members but accept no new ones |
| `DELETE /api/departments/:id` | HR, Admin | Only when it has no employees, otherwise `409` |
| `POST /api/departments/:id/employees` | HR, Admin | `{ employee_ids: [..] }` moves employees into the department (anyone heading another department stops doing so) |
| `DELETE /api/departments/:id/employees/:employeeId` | HR, Admin | Removes the employee from the department (and from its head role) |
| `PUT /api/departments/:id/head` | HR, Admin | `{ employee_id }` (must be a member) or `{ employee_id: null }` |
| `GET /api/audit-logs` (`?limit=&offset=`) | Admin | Max 1000 rows per request |
| `GET /api/audit-logs/recent` | HR, Admin | |
| `GET /api/live` | Public | Process is up (no DB). Use as the Render health check |
| `GET /api/health` | Public | `200 {status:"ok"}` or `503` when the database is unreachable |

### Sessions and accounts
- Every request re-reads the account's role, `is_active` and `token_version` from the database, so role changes, deactivation, deletion, logout and password changes take effect immediately.
- **Password reset without email:** there is no email service. An admin either (a) issues a temporary password, which the user must change at next sign-in, or (b) generates a one-time reset link and shares it with the user directly. Only a SHA-256 hash of the link token is stored; it expires and works once. Nothing is emailed.

## Multi-tenant model and platform owner

EmploCore is multi-tenant. Every user (except the platform owner), employee, department and audit entry belongs to an **organisation** (`organizations` table, migration `005_organizations.sql`). All queries are scoped to the caller's organisation as loaded from the database; records in another organisation return **404**. Existing data was backfilled into the **EmploCore Demo** organisation (slug `demo`).

- **Organisation status:** `pending` → `active` (approved) or `rejected`; `active` ⇄ `suspended`. Users of pending, suspended or rejected organisations cannot log in (403, code `ORGANISATION_PENDING` / `ORGANISATION_SUSPENDED` / `ORGANISATION_REJECTED`; a rejection carries the owner's optional `reason`), and their existing tokens are rejected (401).
- **Public sign-up:** `POST /api/organizations/register` (`organizationName`, `organizationType`, `sizeRange`, `country`, `city` (optional), `phone`, `contactName`/`contactEmail` (optional, default to the admin), `adminName`, `email`, `password`) creates a *pending* organisation and its first admin. Type and size come from fixed lists in `config/signupOptions.js` (migration `006_org_signup_details_enquiries.sql`). It is rate-limited (`ORG_SIGNUP_RATE_LIMIT_MAX`, default 5 per `ORG_SIGNUP_RATE_LIMIT_WINDOW_MIN`, default 60). Anonymous employee self-sign-up is closed: `POST /api/users/register` needs an admin (any organisation role) or HR (employees only) and respects the organisation's `seat_limit`.
- **E-mail addresses are globally unique** (login is by e-mail), so signing up with an address already used in another organisation returns 409.
- **Roles:** `employee`, `hr`, `admin` within an organisation, plus `owner` (platform level, no organisation). `owner` can never be created through a public route.
- **Owner console API:** `/api/platform/*` (owner only): `overview`, `organizations` (list/search/filter, create with first admin, `GET/PATCH /:id`, `POST /:id/approve|reject|suspend|reactivate` (reject takes an optional `reason`), `DELETE /:id`: a pending or rejected registration without employee records is deleted with its sign-up account(s); anything else only when empty, otherwise 409), `users` (search/filter, `PATCH /:id/status`, `POST /:id/temporary-password`, `POST /:id/reset-link`) `audit-logs`, `enquiries` (list/filter, `PUT /:id/status` new/contacted/closed, `DELETE /:id`) and `account` (`GET`, `PUT { name, email, currentPassword }`: the owner's own name and e-mail; changing the e-mail needs the current password and an address no other account uses). The owner changes their password with `PUT /api/users/change-password` (owner password rules). Every owner action is audited. There is no impersonation. In demo mode the demo organisation cannot be suspended and the demo logins stay protected.
- **Bootstrapping the owner:** `POST /api/platform/bootstrap-owner` with `{ setupToken, email, name, password }` works once. The token is checked against the bcrypt hash in `OWNER_SETUP_TOKEN_HASH` (env), or the hash committed in `config/ownerBootstrap.js`. When an owner exists, the endpoint returns **410**. To rotate the token, set `OWNER_SETUP_TOKEN_HASH` to a new bcrypt hash. Alternatively, run `npm run create-owner -- --email you@example.com --name "Your Name"` against the database (password prompted or read from `OWNER_PASSWORD`; use `--additional` to add a second owner). Owner passwords need 12+ characters, including a letter and a number.
- **Demo requests:** `POST /api/enquiries` (`name`, `organizationName`, `email`, `phone`, `message`; public, honeypot, rate-limited by `ENQUIRY_RATE_LIMIT_MAX`, default 5 per `ENQUIRY_RATE_LIMIT_WINDOW_MIN`, default 60) stores the contact page's "Request a demo" form for the owner console's *Enquiries* page.
- **Approving organisations:** sign in at `/login` as the owner, go to *Owner console → Organisations*, use the *Pending approval* list at the top (or open the organisation) and choose **Approve** or **Reject** (with an optional reason). Spam registrations can then be deleted.
- **Billing:** organisations carry `plan` and `status` fields. Paystack billing will hook in later by updating these (for example, suspending on failed payment). There is no payment code yet.

## Environment variables

| Name | Required | Format / example |
|---|---|---|
| `DB_URL` | yes | `mysql://USER:PASSWORD@HOST:PORT/DATABASE?ssl-mode=REQUIRED` (for Aiven, use the Service URI) |
| `DB_SSL_CA_PATH`, `DB_SSL_CA_BASE64` or `DB_SSL_CA` | yes for Aiven | The CA certificate as a file path, base64 of the PEM, or PEM text |
| `JWT_SECRET` | yes | A long random string |
| `JWT_EXPIRES_IN` | no | `8h` (default) |
| `SEED_DEMO` | no | `true` loads the demo data in `npm run db:init`. Default off: a new database starts empty |
| `DEMO_MODE` | no | `true` = public demo (demo logins protected), `false` = real deployment (no protection). Unset = automatic: on when `SEED_DEMO=true`, otherwise the seeded demo logins are protected only if they exist |
| `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MIN` | no | Login/register/reset attempts per IP (default 10 per 15 min) |
| `RESET_LINK_TTL_MINUTES` | no | Reset link lifetime (default 60) |
| `DEMO_PROTECTED_EMAILS` | no | Only in demo mode. Comma-separated logins that can't be deleted, deactivated, re-roled, have their password changed/reset or lose their employee link (403). Default: the three demo logins. Empty value turns protection off |
| `ALLOWED_ORIGINS` | no | `https://emplocore.vercel.app,https://emplocore-*.vercel.app,http://localhost:3000` (default) |
| `PORT` | no | Render sets this automatically |
| `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_CONNECTION_LIMIT`, `DB_PORT` | no | See `config/dbConfig.js` |

Copy `.env.example` to `.env` for local development.

## Database setup

```bash
npm install
DB_URL='mysql://avnadmin:...@host:port/defaultdb?ssl-mode=REQUIRED' DB_SSL_CA_PATH=./ca.pem npm run db:init
```

- `npm run db:init` applies `db/schema.sql` (idempotent) and then every pending file in `db/migrations/` (recorded in `schema_migrations`, each runs once). It is safe on every deploy.
- Demo data (`db/seed.sql`) is loaded **only** when `SEED_DEMO=true` or with `npm run db:seed`. Deploys therefore never re-create demo accounts you deleted.
- `npm run db:schema` / `npm run db:migrate` = schema + migrations, never demo data.
- `npm run create-admin -- --email you@yourorg.org --name "Your Name"` creates the first admin of a new database (password from `ADMIN_PASSWORD` or a hidden prompt; never printed).
- Migration `004_departments.sql` turns the old free-text `employees.Department` values into `departments` rows and links every employee through `employees.department_id`. The `Department` column stays as a copy of the name that the API keeps in sync, so older clients keep working; it can be dropped in a later migration. `node scripts/init-db.js --reset --yes` drops and recreates everything.
- New schema change: add `db/migrations/NNN_description.sql` (next number). Never edit an applied migration.

Demo logins exist only if demo data was loaded (`SEED_DEMO=true` / `npm run db:seed`). They are protected by `DEMO_PROTECTED_EMAILS` (see above) so a public demo stays usable; **set `DEMO_PROTECTED_EMAILS=` (empty) and then change or delete them before real use.**

| Role | Email | Password |
|---|---|---|
| admin | admin@emplocore.demo | Admin@EmploCore2026 |
| hr | hr@emplocore.demo | Hr@EmploCore2026 |
| employee | kwame.mensah@emplocore.demo | Staff@EmploCore2026 |

## Tests

API tests use `node:test` + `supertest` against a **local, disposable** MySQL database (it is wiped; the helper refuses non-local hosts).

```bash
TEST_DB_URL='mysql://USER:PASSWORD@127.0.0.1:3307/emplocore_test?ssl-mode=REQUIRED' \
DB_SSL_CA_PATH=/path/to/local-ca.pem npm test
```

## Run

```bash
npm start        # node server.js
npm run dev      # nodemon
```

## Deploy (Render)

- **Build command:** `npm install && npm run db:init` (schema + migrations; demo data only with `SEED_DEMO=true`). **Start command:** `node server.js`. **Health check path:** `/api/live` (`/api/health` also checks the database). `render.yaml` documents these settings.
- Set `ALLOWED_ORIGINS` without `localhost` in production.
- Set the environment variables above. Put the Aiven CA in a Render **Secret File**, for example `aiven-ca.pem`, and point `DB_SSL_CA_PATH` at `/etc/secrets/aiven-ca.pem`.
- If the database is unreachable, the server keeps running. It retries the connection and reports the state at `/api/health`.
