# 5. Design decisions and why

Each decision lists what was chosen, the alternatives, and the trade-offs. None of them is
permanent; the growth path in [Scalability](08-scalability.md) says when to revisit some of them.

## Raw SQL with mysql2, no ORM

- **Chosen:** hand-written, parameterised SQL (`?` placeholders) in `models/`, through one mysql2 pool.
- **Alternatives:** Sequelize, Prisma, TypeORM, Knex (query builder).
- **Why:** the schema is small and stable; every query must contain `organization_id`, and it is
  easiest to review that when the SQL is right there. No ORM-generated queries, no hidden N+1
  queries, no extra build step, and the migrations are plain SQL the database runs as-is.
- **Trade-offs:** more boilerplate (mapping rows, writing joins by hand); no automatic type
  checking of columns; refactors touch SQL strings. Mitigated by tests that hit a real MySQL.
- **Rule:** never build SQL by concatenating user input. Only fixed fragments (e.g. a chosen
  `WHERE` clause) are joined; values always go through placeholders. `LIKE` searches escape `%`, `_`
  and `\`.

## JWT sessions with bcrypt passwords

- **Chosen:** on login the API signs a JWT (`{ id, email, role, tv }`, expiry `JWT_EXPIRES_IN`,
  default `8h`) with `JWT_SECRET`. Passwords are bcrypt hashes (cost 10; 12 for owner accounts).
- **Alternatives:** server-side sessions with cookies (express-session + a store), an identity
  provider (Auth0, Clerk, Firebase Auth), Argon2 hashes.
- **Why:** the frontend and API are on different domains (Vercel and Render); a bearer token avoids
  cross-site cookie set-up and CSRF handling. No session store is needed.
- **Fixing the usual JWT weakness:** a plain JWT cannot be revoked. EmploCore reloads the account on
  **every** request and compares `tv` with `users.token_version`; logout, password change, role change
  and deactivation bump the version, so old tokens stop working at once.
- **Trade-offs:** one extra database query per request; the token is kept in `localStorage`, which
  an XSS bug could read (React escapes output by default, and helmet sets security headers). Moving
  to an `HttpOnly` cookie would remove that risk but needs CSRF protection and a shared parent domain.

## One shared database with `organization_id` (not a database per client)

- **Chosen:** a single MySQL schema. Every tenant row carries `organization_id`; every query filters on it.
- **Alternatives:** a database (or schema) per client; a separate deployment per client.
- **Why:** one deploy, one migration run, one backup; adding a client is an `INSERT`, not
  provisioning; cross-tenant admin (the owner console) is a simple query; very cheap at small scale.
- **Trade-offs:** a missing `WHERE organization_id = ?` would leak data, so the rule is enforced in the
  model signatures and covered by `tests/tenancy.test.js`. One noisy tenant shares resources with
  everyone. A client asking for "our own database" or data residency would need special handling.
  Unique keys are per organisation (`(organization_id, email)` on employees), except user e-mail,
  which is global because it is the login.

## Another organisation's records answer 404, not 403

- **Chosen:** a record that exists in another organisation is treated as "not found".
- **Alternative:** 403 Forbidden.
- **Why:** 403 would confirm the id exists, which helps someone probing ids. 404 reveals nothing.
  It also keeps the code simple: the query includes `organization_id`, so the row is simply not found.
- **Trade-off:** debugging support cases is slightly harder (a "missing" record may be in another
  organisation). The audit log helps.

## The owner has `organization_id = NULL`

- **Chosen:** the platform owner is a row in `users` with role `owner` and no organisation; a
  database check (`chk_users_org_role`) makes "owner" and "no organisation" equivalent.
- **Alternatives:** a separate `platform_admins` table; an "owner organisation".
- **Why:** one login system and one token format for everyone; the owner cannot accidentally pass an
  organisation filter, and the org guards (`authorizeHR`, `authorizeAdmin`) refuse the owner.
  Owner endpoints live under `/api/platform/*` behind `authorizeOwner`.
- **Trade-off:** code must remember that `organizationId` can be `NULL` for one role; the
  middleware handles it (`organisationBlock`).

## The one-time owner bootstrap token

- **Chosen:** `POST /api/platform/bootstrap-owner` creates the first owner only if **no owner exists**
  and the request carries the setup token whose **bcrypt hash** is in `OWNER_SETUP_TOKEN_HASH` (or the
  committed default in `config/ownerBootstrap.js`). Once an owner exists it answers 410 Gone for good.
  It is rate-limited like sign-up.
- **Alternatives:** only the CLI (`npm run create-owner`, which needs database access); seeding an
  owner in SQL; a hard-coded admin.
- **Why:** on hosted platforms you may not have a shell with database access; this lets you create
  the owner over HTTPS once, safely. Only a hash is stored, so publishing it in the repository does
  not reveal the token.
- **Trade-off:** until the owner exists, whoever has the token can claim the platform, so create
  the owner immediately after a fresh deploy and keep the token private.

## Demo protection

- **Chosen:** the three public demo logins (`config/demoAccounts.js`) cannot be deleted,
  deactivated, re-roled, have their password changed or reset, or lose their employee link (403,
  `DEMO_ACCOUNT_PROTECTED`); the demo organisation cannot be suspended while demo mode is on.
- **Modes:** `DEMO_MODE=true` (on), `false` (off), unset (automatic: on with `SEED_DEMO=true`, and
  otherwise the default list only matches if those seeded demo accounts exist).
- **Alternatives:** reset the demo database on a schedule; read-only demo users.
- **Why:** a public demo must survive visitors who try to break it, without a nightly wipe and
  without making the demo read-only (visitors can still add and edit records).
- **Trade-off:** special cases in a few handlers; real deployments must set `DEMO_MODE=false`.

## Versioned SQL migrations, run on every build

- **Chosen:** numbered `.sql` files, applied once each and recorded in `schema_migrations`, by
  `npm run db:init` in Render's build step.
- **Alternatives:** an ORM's migration tool; running migrations by hand; applying migrations at app start-up.
- **Why:** the schema can never drift from the code that needs it, and a failed migration fails the
  build, so the old version keeps serving. Plain SQL is easy to read and review.
- **Trade-offs:** MySQL DDL commits automatically, so a migration that fails half-way can leave
  earlier statements applied (fix by hand, see the runbook); no down migrations, so rollbacks rely
  on additive changes.

## Money in integer pesewas

- **Chosen:** all payroll money is stored and calculated as whole pesewas (`INT`), and rates as basis
  points (1% = 100 bp). Rounding happens once, half up.
- **Alternatives:** `DECIMAL(12,2)` with decimal arithmetic in JavaScript; floats.
- **Why:** JavaScript numbers are floating point (`0.1 + 0.2 !== 0.3`). Integer maths is exact,
  fast and easy to test.
- **Trade-off:** convert at the edges (`toPesewas`, `formatPesewas`). The older `employees.salary`
  column is still `DECIMAL` in GHS.

## Payslips are snapshots

- **Chosen:** a payslip stores a full copy of the employee details, pay lines, amounts, PAYE bands
  and rules used when it was created. Published payslips cannot be changed or deleted.
- **Alternative:** calculate payslips on the fly from current pay details.
- **Why:** a payslip is a legal record. If a salary, a department name or the tax tables change
  next month, last month's payslip must still show exactly what was paid.
- **Trade-off:** more columns and some duplicated data; a mistake in a published payslip is fixed
  by a correction in a later period, not by editing it.

## Server-side PDF with pdfkit

- **Chosen:** `GET .../pdf` builds the payslip PDF on the server (`services/payslipPdf.js`) from
  the snapshot, with Inter embedded. The browser also has a print stylesheet for "Print".
- **Alternatives:** browser-only printing; a headless Chrome service (Puppeteer); client-side
  PDF libraries.
- **Why:** identical output for everyone, no browser differences, small dependency (no Chrome on
  Render), and the PDF is built only from stored data.
- **Trade-off:** the layout is code, not HTML/CSS, so design changes take longer; PDF generation uses
  the API's CPU (fine at current volumes).

## Audit scopes

- **Chosen:** every audit entry has a `scope` (008). `platform` = organisation-level events
  (registrations, approve/reject, suspend/reactivate, organisation edits and deletes, enquiries,
  owner set-up) and anything an owner does; everything else is `tenant`. The owner reads `platform`
  entries only; an organisation admin reads everything filed under their organisation; HR and
  employees read nothing.
- **Alternatives:** separate tables per audience; filtering by action names at read time.
- **Why:** one append-only log keeps writing simple ("log everything"), and visibility becomes a
  single indexed column. The decision is made when the entry is written
  (`AuditLogModel.insertLog`), with the list of platform actions in one place.
- **Trade-off:** new platform-level actions must be added to `PLATFORM_ACTIONS` in
  `models/auditLogModel.js`, or they will default to `tenant` (unless an owner did them).

## Tenant boundaries for the owner

- **Chosen:** the owner sees organisation details, the admin account(s) (name, e-mail, status,
  last sign-in) and head counts by role; the owner can support **admins** only (reset password,
  deactivate/reactivate) and manage the organisation's status. The API returns 404 for any other
  account (`requireOrgAdminTarget`).
- **Alternatives:** a full "super admin" who sees and edits all users; impersonation.
- **Why:** the industry norm for B2B SaaS. The client organisation owns its staff data; the vendor
  supports the account holder. It reduces privacy risk and the blast radius if the owner account is
  ever compromised.
- **Trade-off:** the owner cannot fix an HR user's problem directly; they help the organisation's
  admin, who then acts.

## CSS design tokens, no UI framework

- **Chosen:** plain CSS with custom properties in `src/styles/tokens.css`, shared components in
  `ui.css`, and Inter as the font.
- **Alternatives:** Tailwind, Material UI, Bootstrap, Chakra.
- **Why:** a small bundle, full control over the look, no framework upgrades to chase, and one file
  to change the brand.
- **Trade-off:** components such as modals, tables and menus are hand-built and must be tested for
  accessibility and mobile layouts (there are UI tests and a WebKit/iPhone check for that).
