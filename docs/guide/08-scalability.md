# 8. Scalability

EmploCore is sized for a small number of small and medium organisations. Nothing below is urgent
today; it is the order in which to act as usage grows. Measure first (see *Monitoring*), then change
one thing at a time.

## Current set-up and limits

| Area | Today | Limit or risk |
|---|---|---|
| API | One Render web service, one Node process | One CPU-bound request (e.g. a big PDF) delays the others; a free or low-tier instance may sleep when idle (the frontend warns that the server "is waking up" and waits up to 60 s) |
| Database connections | Pool of `DB_CONNECTION_LIMIT` (default 5) per process | Each authenticated request makes one extra query (the account reload). Small managed MySQL plans have low connection limits |
| Rate limiting | In process memory | Resets on deploy; not shared if you run two or more instances |
| Lists | `?limit=&offset=` with default 500 and maximum 1000 rows | The frontend loads `/api/employees` and `/api/users/all` without paging, so an organisation with **more than 500** employee records would see a truncated list |
| Payroll run | One request, one transaction for the whole month | Fine for tens or low hundreds of employees; very large runs make one long request |
| PDFs | Built on request by pdfkit | CPU on the API instance; nothing is cached |
| Audit log | One row per action, kept forever | Grows without bound; indexed by organisation/time and scope/time |
| Files | None stored (PDFs are generated, never saved) | Nothing to scale yet |
| Frontend | Static files on Vercel's CDN | Scales without effort |

## What breaks first (most likely order)

1. **Cold starts and a single small instance**: slow first requests and timeouts as traffic grows.
2. **Database connections**: "too many connections" or queueing when several instances or busy
   periods share a small MySQL plan.
3. **Unpaged lists** for an organisation past 500 employees.
4. **Long payroll runs and PDF generation** blocking the event loop for other users.
5. **Audit-log size** making the admin's audit view and backups slower.

## Growth path, step by step

1. **Upgrade the Render instance** to a paid, always-on plan. This removes cold starts. No code change.
2. **Watch slow queries and add indexes.** Turn on the MySQL slow query log (or the provider's query
   insights). The likely candidates are already indexed (`organization_id` on every tenant table,
   `(organization_id, created_at)` and `(scope, created_at)` on audit logs, payslip indexes by run and
   employee). Add composite indexes that start with `organization_id` for any new filter.
3. **Size the connection pool.** Set `DB_CONNECTION_LIMIT` so that *instances × pool size* stays
   below the database plan's connection limit, with headroom for migrations and admin tools.
4. **Paginate the big lists in the UI** (employees, users, audit log) using the existing `limit`/`offset`
   parameters, with server-side search and filters.
5. **Shared rate limiting before running more than one instance.** Move `express-rate-limit` to a
   shared store (for example Redis) so limits hold across instances. Then scale the API horizontally
   (it is otherwise stateless: sessions are JWTs).
6. **Caching** where it pays: the tax rules (static per deploy), organisation status lookups
   (seconds-long cache, with care, since suspension must take effect quickly), and HTTP caching
   headers for published payslip PDFs (they never change).
7. **Background jobs and cron.** Move long work off the request: payroll runs for large
   organisations, bulk PDF generation, and the daily billing job (see
   [Subscriptions](09-monetisation-roadmap.md)). Options: a Render Cron Job or Background Worker with a
   simple jobs table in MySQL, or a queue (for example BullMQ on Redis).
8. **File storage** if you start keeping files (bulk payslip archives, imports, logos): use object
   storage (S3, Cloudflare R2, Backblaze B2) with signed URLs. Never store files in the database or
   on the Render disk (it is not permanent).
9. **Move the database plan up.** More memory/CPU, more connections, high availability and
   point-in-time recovery. See the runbook for a planned move.
10. **Read replicas** for heavy read-only work (reports, exports, the owner's platform views), keeping
    writes and anything that needs fresh data on the primary.
11. **Audit-log retention**: archive entries older than, say, 2 years to cold storage or a separate
    table, or partition by month. Agree the retention period with clients first.
12. **Split services only when needed.** Candidates if one part dominates: payroll/PDF generation, and
    billing webhooks. Keep a single database until there is a clear reason; splitting earlier adds
    cost and complexity.

## Monitoring

- **Uptime:** point an uptime monitor at `GET /api/health` (checks the database). Render's own health
  check uses `GET /api/live` (process only), so a database outage does not restart the API.
- **Logs:** Render logs show start-up, MySQL connection retries, and `console.error` lines from failed
  queries and audit writes. Look for `MySQL connection failed`, `Failed to log`, and 5xx responses.
- **Metrics to watch:** response times, 5xx rate, 429 rate (users locked out), database CPU,
  connections and storage (Aiven console), Vercel deploy status.
- **Errors in the browser:** consider adding an error tracker (for example Sentry) to both apps.

## Backups

- Turn on the provider's automatic backups (and point-in-time recovery if your plan has it); check
  how long they are kept.
- Keep an off-site logical backup as well, for example a nightly `mysqldump --single-transaction`
  stored encrypted outside the database provider.
- **Test a restore** into a scratch database regularly (at least quarterly). The steps are in the
  [runbook](11-operations-runbook.md#restoring-a-database-backup).
