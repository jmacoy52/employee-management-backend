# EmploCore — Backend API (v1)

This is the Express and MySQL REST API behind the EmploCore frontend
([employee-management-system-frontend](https://github.com/jmacoy52/employee-management-system-frontend), live at https://emplocore.vercel.app).

> **Branch note:** this branch (`v1/aiven-production`) continues the v1 API that the frontend calls (`/api/users/*`, `/api/employees`, `/api/audit-logs`). The v2 rewrite on `main` (multi-tenant, `/api/admin/*`, paginated responses) is **not** compatible with the current frontend.

## Stack
Node 18+, Express 5, mysql2 (connection pool with TLS), bcryptjs, jsonwebtoken, express-validator.

## API

| Method & path | Access | Notes |
|---|---|---|
| `POST /api/users/register` | Public, or an admin token | Public sign-up can choose `employee` (the default) or `hr`. Only an admin token can create an `admin`. Passwords need at least 8 characters |
| `POST /api/users/login` | Public | Returns `{ token, user }`. The JWT expires after `JWT_EXPIRES_IN` |
| `GET/PUT /api/users/profile` | Any signed-in user | Profile fields: first_name, last_name, phone, address |
| `GET /api/users/all` | Admin | |
| `PUT /api/users/:id/role` | Admin | Role must be employee, hr or admin. Admins can't change their own role |
| `DELETE /api/users/:id` | Admin | Admins can't delete their own account |
| `GET /api/employees`, `GET /api/employees/:id` | HR, Admin | |
| `POST /api/employees`, `PUT/DELETE /api/employees/:id` | HR, Admin | |
| `GET /api/audit-logs` | Admin | |
| `GET /api/audit-logs/recent` | HR, Admin | |
| `GET /api/health` | Public | Returns `200 {status:"ok"}` or `503` when the database is unreachable |

## Environment variables

| Name | Required | Format / example |
|---|---|---|
| `DB_URL` | yes | `mysql://USER:PASSWORD@HOST:PORT/DATABASE?ssl-mode=REQUIRED` (for Aiven, use the Service URI) |
| `DB_SSL_CA_PATH`, `DB_SSL_CA_BASE64` or `DB_SSL_CA` | yes for Aiven | The CA certificate as a file path, base64 of the PEM, or PEM text |
| `JWT_SECRET` | yes | A long random string |
| `JWT_EXPIRES_IN` | no | `8h` (default) |
| `ALLOWED_ORIGINS` | no | `https://emplocore.vercel.app,https://emplocore-*.vercel.app,http://localhost:3000` (default) |
| `PORT` | no | Render sets this automatically |
| `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_CONNECTION_LIMIT`, `DB_PORT` | no | See `config/dbConfig.js` |

Copy `.env.example` to `.env` for local development.

## Database setup

```bash
npm install
DB_URL='mysql://avnadmin:...@host:port/defaultdb?ssl-mode=REQUIRED' DB_SSL_CA_PATH=./ca.pem npm run db:init
```

- `db/schema.sql` creates the tables `users`, `user_profiles`, `employees` and `audit_logs`. It is idempotent.
- `db/seed.sql` loads demo data. It is also idempotent: rows are matched on email.
- `npm run db:schema` creates the tables only. `node scripts/init-db.js --reset --yes` drops and recreates everything.

Demo logins come from `db/seed.sql`. **Change or delete them before real use.**

| Role | Email | Password |
|---|---|---|
| admin | admin@emplocore.demo | Admin@EmploCore2026 |
| hr | hr@emplocore.demo | Hr@EmploCore2026 |
| employee | kwame.mensah@emplocore.demo | Staff@EmploCore2026 |

## Run

```bash
npm start        # node server.js
npm run dev      # nodemon
```

## Deploy (Render)

- **Build command:** `npm install`. **Start command:** `node server.js`. **Health check path:** `/api/health`.
- Set the environment variables above. Put the Aiven CA in a Render **Secret File**, for example `aiven-ca.pem`, and point `DB_SSL_CA_PATH` at `/etc/secrets/aiven-ca.pem`.
- If the database is unreachable, the server keeps running. It retries the connection and reports the state at `/api/health`.
