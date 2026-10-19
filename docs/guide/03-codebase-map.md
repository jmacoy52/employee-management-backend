# 3. Codebase map

## Backend: `employee-management-backend`

```
server.js            Express app: helmet, CORS, JSON limit, health checks, route mounting, error handler
render.yaml          Render blueprint (documents dashboard settings; no secret values)
.env.example         Every environment variable name with placeholders
config/              Settings and shared rules (no HTTP code)
routes/              URL -> middleware chain -> controller method
middleware/          Authentication and role guards
controllers/         Request handling: validate, call models, shape responses, audit
models/              Raw SQL through the mysql2 pool, always scoped by organisation
services/            Pure logic: payroll maths, payslip PDF
validator/           express-validator schemas for users and employees
db/schema.sql        The original v1 tables (CREATE TABLE IF NOT EXISTS)
db/migrations/       001-008, applied once each, in filename order
db/seed.sql          Demo organisation and sample data (only with SEED_DEMO=true or --seed)
scripts/             CLI tools: init-db, migrate, create-admin, create-owner, seed-payroll-demo
tests/               node:test + supertest against a disposable local MySQL database
docs/                PRODUCTION.md and this guide
```

### Request entry: `server.js`

Sets `trust proxy` (Render sits in front), applies `helmet()`, `cors(corsOptions)` and
`express.json({ limit: '100kb' })`, defines `GET /api/live` (process up, no DB) and
`GET /api/health` (runs `SELECT 1`), mounts the routers, returns JSON 404 for unknown `/api` paths
and 400 for invalid JSON. It only calls `app.listen` when run directly, so tests can import the app.

| Mount point | Router file | Purpose |
|---|---|---|
| `/api` | `routes/employeeRoute.js` | `/api/employees` CRUD and account linking (HR, admin) |
| `/api/users` | `routes/userRoute.js` | Login, logout, reset with link, change password, `/me`, profile, user management (admin) |
| `/api/audit-logs` | `routes/auditLogRoute.js` | Organisation audit log (admin only) |
| `/api/departments` | `routes/departmentRoute.js` | Departments, members, head (HR, admin) |
| `/api/organizations` | `routes/organizationRoute.js` | Public organisation sign-up |
| `/api/platform` | `routes/platformRoute.js` | Owner console API and the one-time owner bootstrap |
| `/api/enquiries` | `routes/enquiryRoute.js` | Public "Request a demo" form |
| `/api/payroll` | `routes/payrollRoute.js` | Pay details, runs, payslips (HR, admin); own payslips (any signed-in user) |

### `config/`

| File | What it holds |
|---|---|
| `db.js` | The shared mysql2 **pool** and the start-up connection check with retry |
| `dbConfig.js` | Builds connection options from `DB_URL`/`DATABASE_URL` and the `DB_SSL_*` variables |
| `cors.js` | Origin allow-list from `ALLOWED_ORIGINS` (wildcards in the host allowed) |
| `rateLimits.js` | `authLimiter`, `orgSignupLimiter`, `enquiryLimiter` |
| `roles.js` | Role names and password rules (`passwordProblem`, `ownerPasswordProblem`) |
| `demoAccounts.js` | Demo mode (`DEMO_MODE`) and the protected demo logins |
| `ownerBootstrap.js` | The bcrypt hash used to check the one-time owner setup token |
| `ghanaPayroll.js` | PAYE bands and SSNIT rates, each with an effective date |
| `signupOptions.js` | Fixed lists on the sign-up form (organisation types, staff sizes) |
| `slug.js` | Organisation slug generation ("Accra Logistics Ltd." -> `accra-logistics-ltd`) |
| `pagination.js` | `?limit=&offset=` with bounds (default 500, max 1000) |

### `middleware/authMiddleware.js`

- `authenticateToken`: verifies the JWT, reloads the account from the database, rejects
  deactivated accounts, revoked tokens (`token_version`), and users of non-active organisations;
  enforces "change your temporary password first".
- `optionalAuth`: attaches `req.user` if a valid token is sent; never blocks (used by `/register`).
- `authorizeOwner`, `authorizeAdmin`, `authorizeHR` (HR **or** admin): role guards (403).
- `organisationBlock` / `ORG_BLOCKED`: the messages and codes for pending, suspended and rejected
  organisations.

### `controllers/` and `models/`

| Area | Controller | Model(s) |
|---|---|---|
| Accounts, login, passwords, profile | `userController.js` | `userModel.js`, `passwordResetModel.js`, `userProfileModel.js` |
| Employee records | `employeeController.js` | `employeeModel.js` |
| Departments | `departmentController.js` | `departmentModel.js` |
| Organisation sign-up | `organizationController.js` | `organizationModel.js` |
| Owner console | `platformController.js` (reuses some `userController` handlers) | `organizationModel.js`, `auditLogModel.js`, `enquiryModel.js` |
| Demo requests | `enquiryController.js` | `enquiryModel.js` |
| Payroll | `payrollController.js` | `payrollModel.js` |
| Audit log | `auditLogController.js` | `auditLogModel.js` |

Rule of thumb: **models never trust the request**. Every org-scoped model method takes the
organisation id as an argument, and controllers always pass `req.user.organizationId` (loaded from
the database). `userModel.js` has an `ANY_ORG` scope used only by the owner's support actions, and
it never matches owner accounts.

### `services/`

- `payrollCalc.js`: pure functions for the Ghana payslip maths in pesewas (`calculatePayslip`,
  `payeFor`, `toPesewas`, `formatPesewas`). No database. Covered by `tests/payrollCalc.test.js`.
- `payslipPdf.js`: builds the payslip PDF with pdfkit from the stored payslip snapshot, embedding
  Inter from `@fontsource/inter`. Only the last four digits of a bank account are printed.

- `paystack.js`: small Paystack API client (plans, transactions, subscriptions) and webhook signature
  check (HMAC SHA-512, constant-time). Tests swap the transport, so no request leaves the machine.
- `billing.js`: plans, subscriptions and entitlements (`getEntitlements`, `assertRoleCapacity`),
  quotes and coupons, checkout and verification, webhook handling, owner actions, revenue.
- `billingDaily.js`: the daily job (`runDaily`), run by `scripts/billing-daily.js`
  (`npm run billing:daily`).
- `invoicePdf.js`: the PDF invoice for a successful payment.
- `billingScheduler.js`: runs the daily job inside the web service once a day (started by `server.js`).
- Plan limits are enforced in `middleware/planGuards.js` (`requireFeature`,
  `requireEmployeeCapacity`, `requireEmployeesWithinLimit`) and, for accounts, in
  `OrganizationModel.lockSeat`. Billing routes: `routes/billingRoute.js`; owner routes in
  `routes/platformRoute.js` (`/billing`, `/plans`, `/coupons`, `/organizations/:id/subscription…`).

### `db/` and `scripts/`

- `scripts/init-db.js` (`npm run db:init`): runs `db/schema.sql`, then `scripts/migrate.js`
  (pending migrations, recorded in `schema_migrations`), then demo data if `SEED_DEMO=true` or
  `--seed`, then the conditional demo payroll (`scripts/seed-payroll-demo.js`). `--reset --yes` drops
  every EmploCore table first (local and test use only).
- `scripts/create-admin.js` (`npm run create-admin`) and `scripts/create-owner.js`
  (`npm run create-owner`): see the [runbook](11-operations-runbook.md).

### `tests/`

`npm test` runs `node --test --test-concurrency=1` against a **disposable local** MySQL database
(`TEST_DB_URL`, wiped by `tests/helpers.js`). 102 tests in 11 files:

| File | Tests | Covers |
|---|---|---|
| `api.test.js` | 26 | Health, security headers, CORS, login, roles, sessions, passwords, employees, audit |
| `platform.test.js` | 17 | Sign-up, owner bootstrap, owner console, tenant boundary, audit scopes |
| `payroll.test.js` | 10 | Payroll access, isolation, drafts vs published, snapshots, demo seed |
| `payrollCalc.test.js` | 10 | Hand-worked PAYE/SSNIT examples |
| `demoProtection.test.js` | 9 | Demo logins cannot be changed |
| `ownerConsole.test.js` | 8 | Approve/reject/delete, enquiries, owner account |
| `departments.test.js` | 7 | Department CRUD, members, head, audit |
| `tenancy.test.js` | 7 | Cross-organisation access is 404 everywhere |
| `setup.test.js` | 5 | Empty production DB by default, `create-admin` |
| `migrations.test.js` | 2 | Upgrading a populated v1 database without data loss; idempotency |
| `rateLimit.test.js` | 1 | Login rate limit (own process) |

## Frontend: `employee-management-system-frontend`

```
public/              index.html, manifest, favicon, robots.txt
vercel.json          Build command, output folder, SPA rewrite
src/index.js         React entry
src/App.js           Router and toaster
src/api/             client.js (axios instance), useDepartments.js (hook)
src/auth/session.js  Save/read/clear the session in localStorage; logout (server + local)
src/config/          env.js (REACT_APP_*), demo.js (demo mode and demo logins), signupOptions.js
src/routes/          paths.js, AppRoutes.js, PrivateRoute.js
src/components/      auth/, brand/, common/, layout/ (shared building blocks)
src/pages/           public/, auth/, employee/, hr/, admin/, owner/, payroll/
src/styles/          tokens.css, ui.css, pages.css
src/__tests__/       Jest + Testing Library (53 tests)
e2e/e2e.py           Playwright end-to-end script (local stack)
```

### Routing and guards

- `src/routes/paths.js`: every path (`PATHS`), legacy redirects, and `ROLE_HOME` (where each role
  lands after sign-in: owner `/owner`, admin `/admin`, HR `/hr`, employee `/employee`).
- `src/routes/AppRoutes.js`: groups routes under `PrivateRoute allowedRoles={[...]}`. Admins may open
  every organisation route (including `/hr/*`) but not the owner console. The owner only has the owner
  console and the change-password page.
- `src/routes/PrivateRoute.js`: no token means `/login`; an expired token (read with `jwt-decode`) clears the
  session; `mustChangePassword` forces `/account/password`; the wrong role is sent to its own home.
  This is a convenience. **The API enforces the real rules.**

### Pages

| Folder | Pages |
|---|---|
| `pages/public/` | `Home` (landing, with `#pricing`), `Pricing`, `Contact` (request a demo), `Privacy`, `Terms`, `NotFound` |
| `pages/auth/` | `Login`, `RegisterOrganisation`, `Register` (explains there is no public employee sign-up), `ForgotPassword` (explains that an administrator resets passwords), `ResetPassword` (one-time link), `ChangePassword` |
| `pages/employee/` | `EmployeeDashboard` (profile and linked employment record) |
| `pages/hr/` | `HRDashboard`, `EmployeeListPage`, `AddEmployeePage`, `DepartmentsPage`, `MyProfilePage` |
| `pages/admin/` | `AdminDashboard`, `UserList` ("View Users"), `UserManagement`, `AuditLog` |
| `pages/owner/` | `OwnerOverview`, `OwnerOrganisations`, `OwnerOrganisationDetail`, `OwnerAdmins` + `OwnerAdminTable`, `OwnerEnquiries`, `OwnerAuditLog`, `OwnerAccount`, `OwnerBilling` (Revenue), `OwnerPlans`, `OrgSubscriptionPanel`, `PendingApprovals`, `RejectModal`, `ownerShared.js` |
| `pages/billing/` | `Billing` (admin plan, usage, change plan, payments and invoices), `BillingCallback` (Paystack return page) |
| `pages/payroll/` | `PayrollPage` (months, pay details, tax rates, Run payroll), `PayrollRunPage` (one month), `PayslipPage`, `PayslipDocument` (shared on-screen and print layout), `MyPayslips`, `payrollShared.js` (money formatting), `Payroll.css` (includes print CSS) |

### Components

- `components/layout/`: `AppNav` (role navigation; collapses to a menu button on small screens),
  `OwnerNav`, `AdminNav`, `HRNav`, `EmployeeNav` (their menu items), `AppLayout` (signed-in page
  frame: nav, title, actions, footer), `PageLayout`, `Header`, `Footer` (public pages).
- `components/common/`: `Modal`, `EmployeeForm`, `EmployeeList`, `EmployeeStats`,
  `EmploymentRecord`, `ProfilePanel`, `RoleBadge`/`StatusBadge`, `ActionBadge` (colours audit actions).
- `components/auth/`: `AuthLayout`, `PasswordInput` (show/hide), `SubmitButton`.
- `components/billing/`: `PricingSection` and `PricingPlans` (plan cards, public and Billing page), `IntervalToggle`, `PlanBanner` (trial, grace, limit and payroll notices); helpers in `api/billing.js`.
- `components/brand/Logo.js`: the SVG logo.

### Styles and tokens

- `src/styles/tokens.css`: the **only** place colours, type sizes, spacing, radii and shadows are
  defined (CSS custom properties). Brand primary `#2453d6`, accent `#14b8a6`, ink `#0f1e3d`; font
  Inter with system fallbacks; a 4px spacing scale.
- `src/styles/ui.css`: shared building blocks (buttons, cards, form fields, option rows for radios
  and checkboxes, tables that turn into cards on phones, badges, alerts, stat tiles).
- `src/styles/pages.css`: page frames for public pages and the signed-in app.
- Page and component stylesheets use only these variables.

### Frontend tests

`CI=true npx react-scripts test --watchAll=false` runs 53 tests in 7 files (`auth`, `departments`,
`owner`, `payroll`, `tenantBoundary`, `ui`, `App`). The API is mocked with `jest.mock`.
`e2e/e2e.py` drives a real browser against a local backend and frontend (see the runbook).
