# EmploCore — Backend API (v1)

This is the Express and MySQL REST API behind the EmploCore frontend
([employee-management-system-frontend](https://github.com/jmacoy52/employee-management-system-frontend), live at https://emplocore.vercel.app).

> **Branch note:** this branch (`v1/aiven-production`) continues the v1 API that the frontend calls (`/api/users/*`, `/api/employees`, `/api/audit-logs`). The v2 rewrite on `main` (multi-tenant, `/api/admin/*`, paginated responses) is **not** compatible with the current frontend.

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
| `GET /api/employees` (`?limit=&offset=`), `GET /api/employees/:id` | HR, Admin | List includes `user_id`, `linked_username`, `linked_email` |
| `POST /api/employees`, `PUT/DELETE /api/employees/:id` | HR, Admin | Validated (name, position, Department, salary ≥ 0; email optional, unique) |
| `PUT /api/employees/:id/link` | HR, Admin | `{ user_id }` to link an account, `{ user_id: null }` to unlink |
| `GET /api/audit-logs` (`?limit=&offset=`) | Admin | Max 1000 rows per request |
| `GET /api/audit-logs/recent` | HR, Admin | |
| `GET /api/live` | Public | Process is up (no DB). Use as the Render health check |
| `GET /api/health` | Public | `200 {status:"ok"}` or `503` when the database is unreachable |

### Sessions and accounts
- Every request re-reads the account's role, `is_active` and `token_version` from the database, so role changes, deactivation, deletion, logout and password changes take effect immediately.
- **Password reset without email:** there is no email service. An admin either (a) issues a temporary password, which the user must change at next sign-in, or (b) generates a one-time reset link and shares it with the user directly. Only a SHA-256 hash of the link token is stored; it expires and works once. Nothing is emailed.

## Environment variables

| Name | Required | Format / example |
|---|---|---|
| `DB_URL` | yes | `mysql://USER:PASSWORD@HOST:PORT/DATABASE?ssl-mode=REQUIRED` (for Aiven, use the Service URI) |
| `DB_SSL_CA_PATH`, `DB_SSL_CA_BASE64` or `DB_SSL_CA` | yes for Aiven | The CA certificate as a file path, base64 of the PEM, or PEM text |
| `JWT_SECRET` | yes | A long random string |
| `JWT_EXPIRES_IN` | no | `8h` (default) |
| `SEED_DEMO` | no | `true` loads the demo data in `npm run db:init`. Default off |
| `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MIN` | no | Login/register/reset attempts per IP (default 10 per 15 min) |
| `RESET_LINK_TTL_MINUTES` | no | Reset link lifetime (default 60) |
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
- `npm run db:schema` = schema + migrations, never demo data. `node scripts/init-db.js --reset --yes` drops and recreates everything.
- New schema change: add `db/migrations/NNN_description.sql` (next number). Never edit an applied migration.

Demo logins exist only if demo data was loaded (`SEED_DEMO=true` / `npm run db:seed`). **Change or delete them before real use.**

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
