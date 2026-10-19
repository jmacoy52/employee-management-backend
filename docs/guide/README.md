# EmploCore system guide

This guide explains how EmploCore works, why it is built the way it is, and how to run it. It is
written for the developer who owns the product. Everything here comes from the code in this
repository and the frontend repository at the time of writing (19 October 2026, migrations 001–008).
If the code and this guide ever disagree, the code wins. Please update the guide in the same commit.

Secrets are never written here. Environment variables are named, never given values.

| # | Section | What it covers |
|---|---|---|
| 1 | [Overview](01-overview.md) | What EmploCore is, who uses it, the multi-tenant model |
| 2 | [Architecture](02-architecture.md) | Frontend, backend, database, request lifecycle, deploy pipeline |
| 3 | [Codebase map](03-codebase-map.md) | Folder-by-folder tour of both repositories |
| 4 | [Data model](04-data-model.md) | Every table, relationships, migrations 001–008 |
| 5 | [Design decisions](05-design-decisions.md) | Why things are built this way, alternatives and trade-offs |
| 6 | [Security and tenancy](06-security-and-tenancy.md) | Auth flow, permissions matrix, limits, audit, demo mode |
| 7 | [Payroll](07-payroll.md) | Ghana PAYE and SSNIT, a worked example, yearly updates |
| 8 | [Scalability](08-scalability.md) | Current limits, what breaks first, growth path, monitoring |
| 9 | [Subscriptions and billing](09-monetisation-roadmap.md) | LIVE: plans, trials, limits, Paystack, daily job, switching on payments |
| 10 | [User guides](10-user-guides.md) | Step-by-step for owner, org admin, HR and employee |
| 11 | [Operations runbook](11-operations-runbook.md) | Env vars, deploys, migrations, CLIs, rollback, common errors |
| 12 | [Glossary](12-glossary.md) | Terms used across the product and code |

Related: [`../PRODUCTION.md`](../PRODUCTION.md) (setting up a real, non-demo deployment) and the
[backend README](../../README.md) (full API table).

Screenshots in [`img/`](img/) were taken from the live site using the public demo organisation
("EmploCore Demo") and its sample data only.
