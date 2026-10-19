# 9. Monetisation roadmap (proposed, not live)

> **Status: PROPOSED.** There is no billing or payment code in EmploCore today. Organisations
> have `plan` and `seat_limit` fields that the owner edits by hand. The prices below come from
> `/workspace/emplocore/pricing/pricing_proposal.md` (prepared 19 October 2026) and are **not
> published or charged anywhere**. Re-check them before launch.

## Proposed tiers (from the pricing proposal)

All prices in GHS, billed through Paystack. Yearly = 10 × monthly (2 months free).

| Tier | Monthly | Yearly | Employees included | Extra employee | Main features |
|---|---|---|---|---|---|
| Free | GH₵0 | – | up to 5 | – (upgrade) | Employee records, departments, 1 admin, roles. No payroll |
| Starter | GH₵99 | GH₵990 | up to 15 | GH₵6 /month | + Ghana payroll (PAYE, SSNIT), PDF and printable payslips, My payslips; 1 admin + 1 HR |
| Growth (suggested default) | GH₵249 | GH₵2,490 | up to 50 | GH₵5 /month | + unlimited HR users, organisation audit log, priority support |
| Business | GH₵549 | GH₵5,490 | up to 150 | GH₵4 /month | + onboarding help; self-serve billing page and invoices (planned) |
| Enterprise | Custom (from about GH₵1,200) | Custom | 150+ | negotiated | Custom terms |

Proposed offers: a 30-day Growth trial with no card, a 7-day grace period before downgrading to Free,
and 40% off for 12 months for the first 25 paying organisations (price locked while subscribed).

Paystack (Ghana) charges 1.95% per transaction and supports Plans, Subscriptions and webhooks, which
is what this design uses.

## What exists today that billing would drive

- `organizations.plan` (free text, validated pattern) and `organizations.seat_limit` (maximum
  **active** user accounts, enforced on account creation and reactivation with `SEAT_LIMIT_REACHED`).
- `organizations.status` (`suspended` already blocks sign-in and sessions, and keeps the data).
- The owner console can already change plan, seat limit and status, all audit-logged.

Not built yet: feature gates per plan (for example "no payroll on Free"), employee-count limits
(today's seat limit counts user **accounts**, not employee records), trials, invoices.

## Proposed design

### Data (new migration, e.g. `009_billing.sql`)

| Table | Key columns |
|---|---|
| `subscriptions` | `organization_id` (unique), `tier`, `interval` (`monthly`/`annually`), `status` (`trialing`, `active`, `past_due`, `cancelled`, `free`), `trial_ends_at`, `current_period_end`, `grace_ends_at`, `paystack_customer_code`, `paystack_subscription_code`, `paystack_email_token` |
| `billing_events` | `id`, `paystack_event_id` or a hash of the payload (unique, for idempotency), `event`, `organization_id`, `payload` (JSON), `received_at`, `processed_at` |
| `invoices` (optional at first) | `organization_id`, `paystack_reference`, `amount_pesewas`, `status`, `paid_at` |

Tier rules (included employees, extra-employee price, feature flags) would live in one config file,
for example `config/plans.js`, like `config/ghanaPayroll.js` does for tax.

### Paystack set-up

1. Create one Paystack **Plan** per tier and interval (amounts in pesewas, currency GHS).
2. Checkout: the organisation admin clicks *Upgrade*; the API initialises a transaction for the
   plan (`POST /transaction/initialize` with `plan` and the admin's e-mail, metadata
   `organization_id`) and returns Paystack's `authorization_url`; the browser goes there.
3. Paystack creates the subscription after the first successful charge and renews it automatically.
4. New environment variable names (values in Render only, never committed): `PAYSTACK_SECRET_KEY`;
   on the frontend, if inline checkout is used, `REACT_APP_PAYSTACK_PUBLIC_KEY`.

### Webhook endpoint

`POST /api/billing/paystack/webhook` (public, but verified):

1. Read the **raw** request body (configure `express.json({ verify })` or mount a raw parser on this
   route only).
2. Verify the `x-paystack-signature` header: it must equal the HMAC-SHA512 of the raw body using
   `PAYSTACK_SECRET_KEY`. Reject anything else with 401.
3. Store the event in `billing_events`; if it was already processed, answer 200 and stop
   (Paystack retries, so handlers must be idempotent).
4. Answer 200 quickly, then process:

| Paystack event | Effect |
|---|---|
| `charge.success` | Mark the period paid; `status = active`; set `current_period_end`; update `organizations.plan` and `seat_limit`; reactivate the organisation if billing had suspended it |
| `subscription.create` | Save the subscription and customer codes |
| `invoice.payment_failed` | `status = past_due`; set `grace_ends_at` = now + 7 days; e-mail or notify the admin |
| `subscription.not_renew` / `subscription.disable` | Plan ends at `current_period_end`, then the organisation moves to Free |

Every change is audit-logged with a platform-scope action (for example `BILLING_PLAN_CHANGED`,
added to `PLATFORM_ACTIONS`).

### Daily cron job

A Render Cron Job (for example `node scripts/billing-daily.js`, once a day at 06:00 Accra time) that:

1. **Trial reminders:** organisations whose trial ends in 7, 3 and 1 days get a reminder (in-app
   banner, and e-mail once an e-mail service exists).
2. **Trial end:** expired trials without a subscription move to Free (or to grace, if the proposal's
   7-day grace applies to trials too).
3. **Grace and suspension:** `past_due` organisations past `grace_ends_at` are downgraded to Free. If
   their usage is above the Free limits, they are suspended (`organizations.status = 'suspended'`,
   which already blocks sign-in) until they pay. *Decide this policy before launch.*
4. **Reconcile:** optionally re-fetch subscription status from Paystack for organisations whose
   state looks inconsistent.
5. Log a summary and audit each change.

The job must be idempotent (safe to run twice) and use the same database connection settings as
the API.

### Frontend

- Organisation admin: a *Billing* page (current plan, usage against limits, upgrade, cancel, invoices).
- Owner console: plan and subscription status per organisation, and manual overrides
  (for example for Enterprise deals), all audit-logged.

## Order of work (suggested)

1. Plan definitions and feature gates (payroll off on Free; employee limits), with tests.
2. Migration 009, the webhook endpoint with signature check and idempotency, and tests using signed
   sample payloads.
3. Checkout for one tier in Paystack **test mode**, end to end.
4. The daily cron job.
5. Billing pages; then switch to live keys.
