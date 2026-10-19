# 12. Glossary

| Term | Meaning |
|---|---|
| **Account / user** | A login (`users` row) with an e-mail, password and role. Not the same as an employee record |
| **Admin (organisation admin)** | The role that manages an organisation's accounts and reads its audit log; can also do HR work |
| **Allowance** | A named monthly amount added to gross pay and taxed (e.g. Transport) |
| **Audit log** | Append-only record of actions (`audit_logs`): who did what, when, in which organisation |
| **Basis point (bp)** | One hundredth of a percent. 5.5% = 550 bp. Used for exact rate maths |
| **bcrypt** | The slow, salted password-hashing function used for every password |
| **Bootstrap (owner)** | The one-time creation of the first owner through `POST /api/platform/bootstrap-owner` |
| **CORS** | Browser rule that decides which websites may call the API; controlled by `ALLOWED_ORIGINS` |
| **Demo mode** | Settings that protect the public demo logins and show them on the website (`DEMO_MODE`, `REACT_APP_DEMO_MODE`) |
| **Draft payslip** | A payslip created by a payroll run but not yet visible to the employee; can be deleted |
| **Employee (role)** | A staff member's login: own profile and own published payslips |
| **Employee record** | HR's data about a person (`employees` row): position, department, salary. May be linked to an account |
| **Enquiry** | A "Request a demo" message from the contact page, handled in the owner console |
| **GRA** | Ghana Revenue Authority, which sets PAYE rates |
| **Grace period** | (Proposed billing) time after a failed payment or trial end before downgrade or suspension |
| **Gross pay** | Basic salary plus allowances |
| **Head of department** | The member of a department chosen as its head (`departments.head_employee_id`) |
| **Helmet** | Express middleware that sets HTTP security headers |
| **HR** | The role that manages employee records, departments and payroll |
| **JWT** | JSON Web Token: the signed session token the browser sends as `Authorization: Bearer ...` |
| **Migration** | A numbered SQL file in `db/migrations/` that changes the schema once; recorded in `schema_migrations` |
| **Multi-tenant** | One deployment and database serving many organisations, each isolated by `organization_id` |
| **Net pay** | Gross − employee SSNIT − PAYE − other deductions |
| **Organisation (tenant)** | A client company using EmploCore (`organizations` row) |
| **Organisation status** | `pending`, `active`, `suspended` or `rejected`; only `active` can sign in |
| **Other deductions** | Named after-tax deductions (e.g. a loan repayment, staff welfare) |
| **Owner (platform owner)** | The EmploCore operator's account: no organisation, uses the owner console |
| **Owner console** | The `/owner` area and `/api/platform/*` API |
| **PAYE** | Pay As You Earn: income tax withheld from pay using graduated monthly bands |
| **Payroll run** | One organisation's payroll for one month (`payroll_runs`) |
| **Pesewa** | 1/100 of a Ghana cedi. All payroll money is stored in pesewas |
| **Platform scope** | Audit entries the owner may read: organisation-level events and owner actions |
| **Pool (connection pool)** | A set of reusable database connections (`DB_CONNECTION_LIMIT`) |
| **Published payslip** | A final payslip visible to the employee; cannot be changed or deleted |
| **Rate limit** | Maximum attempts per IP in a time window; over it the API returns 429 |
| **Reset link** | A one-time password link an admin generates; only its hash is stored |
| **Seat limit** | Maximum active user accounts an organisation may have (`seat_limit`; `NULL` = unlimited) |
| **Slug** | URL-safe unique name of an organisation, e.g. `accra-logistics-ltd` |
| **Snapshot** | The copy of all details and figures stored on a payslip when it is created |
| **SPA** | Single-page application: one `index.html` with client-side routing (React Router) |
| **SSNIT** | Social Security and National Insurance Trust. Tier 1: employee 5.5%, employer 13% of basic, up to the maximum insurable earnings |
| **Taxable (chargeable) income** | Gross pay minus employee SSNIT; PAYE is calculated on it |
| **Temporary password** | A random password set by an admin (or the owner, for admins); must be changed at the next sign-in |
| **Tenant boundary** | The rule that the owner sees an organisation's details, admins and head counts, never its staff |
| **Tenant scope** | Audit entries about routine activity inside one organisation, readable by its admins only |
| **Token version (`tv`)** | A counter on each account; bumping it revokes every existing token for that account |
| **TLS** | Encryption for connections; used between the API and MySQL (and HTTPS for browsers) |
