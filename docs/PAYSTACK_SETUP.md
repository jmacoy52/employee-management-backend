# Switching on Paystack payments

EmploCore's subscriptions work without Paystack: trials, plan limits, the owner's manual actions and the daily job
all run, and the Billing page says **"Payments coming soon"**. Follow these steps when you are ready to take money.
Never paste keys into code, commits, chat or tickets: they go into the Render dashboard only.

## 1. Paystack account
1. Sign in at <https://dashboard.paystack.com> with the business account (Ghana, GHS).
2. Finish **Compliance / Go live** (business details, settlement bank or MoMo). Until then only test keys work.
3. You do **not** need to create plans in the dashboard: EmploCore creates one Paystack plan per organisation and
   price automatically (named "EmploCore Growth monthly - org 12"), so the subscription always maps to one
   organisation and its amount can follow extra employees and the end of a founding discount.

## 2. Test first
1. In Paystack, switch to **Test mode**. Open **Settings → API Keys & Webhooks**.
2. Copy the **Test Secret Key** and **Test Public Key**.
3. In Render, open the web service **employee-management-system-backend → Environment** and add:
   - `PAYSTACK_SECRET_KEY` = the test secret key
   - `PAYSTACK_PUBLIC_KEY` = the test public key
   - `APP_URL` = `https://emplocore.vercel.app` (already in render.yaml)
   Save; Render redeploys.
4. Still in **API Keys & Webhooks** (test mode), set **Test Webhook URL** to:
   `https://employee-management-system-backend-vxar.onrender.com/api/billing/paystack/webhook`
   (Optionally also set **Test Callback URL** to `https://emplocore.vercel.app/admin/billing/callback`; EmploCore
   sends the callback URL with every payment anyway.)
5. Sign in as an organisation admin of a **non-demo** organisation, open **Billing**, choose a plan and pay with a
   Paystack test card (Paystack docs: "Test payments"). You come back to the confirmation page; the plan switches
   to the paid plan and the payment appears under **Payments** with a PDF invoice.
6. Check the owner console: **Revenue** shows the MRR; **Audit log** shows `BILLING_SUBSCRIPTION_ACTIVATED`.

## 3. Go live
1. In Paystack switch to **Live mode** and copy the **Live Secret Key** and **Live Public Key**.
2. In Render, replace `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` with the live keys (web service).
3. Set the **Live Webhook URL** to the same address as above.
4. Payments started with test keys cannot be confirmed with live keys; ask anyone who started a test payment to
   start again.

## 4. Daily billing job (Render cron)
`render.yaml` defines a cron job **emplocore-billing-daily** (`npm run billing:daily`, every day at 06:00 UTC, which
is 06:00 in Accra). Render bills cron jobs by run time, prorated by the second, with a minimum of US$1 per cron job a
month (render.com/docs/cronjobs, checked October 2026).
1. In Render, choose **New → Blueprint** (or **Blueprints → Sync**) on this repository so the cron job is created,
   or create it by hand: **New → Cron Job**, branch `v1/aiven-production`, build `npm install`, command
   `npm run billing:daily`, schedule `0 6 * * *`.
2. Give it the same `DB_URL` and `DB_SSL_CA_BASE64` as the web service, and the same `PAYSTACK_SECRET_KEY`.
3. Use **Trigger Run** once and read the log: it ends with `billing:daily done {...}`. Running it twice is safe.

Without the cron job nothing breaks, but trials do not expire, grace periods do not end and reminders are not
created.

## Environment variables (names only)
| Name | Where | Needed | Purpose |
|---|---|---|---|
| `PAYSTACK_SECRET_KEY` | web service and cron job | to take payments | API calls and webhook signature check (HMAC SHA512 of the raw body, header `x-paystack-signature`) |
| `PAYSTACK_PUBLIC_KEY` | web service | recommended | reported as configured; not needed by the redirect checkout |
| `APP_URL` | web service | default is fine | frontend address; the return page is `APP_URL/admin/billing/callback` |
| `PAYSTACK_CALLBACK_URL` | web service | optional | overrides the return page |
| `PAYSTACK_WEBHOOK_URL` | anywhere | optional | informational only; the API serves the webhook at `/api/billing/paystack/webhook` |

## Rotating the secret key
Generate a new secret key in Paystack, update `PAYSTACK_SECRET_KEY` on **both** the web service and the cron job,
and redeploy. Webhooks signed with the old key are refused (401) and Paystack retries them, so nothing is lost.

## What happens to money and plans
- Each plan change starts a new paid period on the day of payment; the old Paystack subscription is stopped. There
  is no proration yet.
- **Cancel renewal** stops future charges; the plan stays until the end of the paid period, then a 7-day grace
  period, then Free. Data is never deleted; data above the Free limits becomes read-only.
- A failed renewal starts the 7-day grace period immediately and shows a banner to the organisation admin.
- The founding offer (40% for 12 months, first 25 paying organisations) is applied automatically while it is
  switched on in **Owner console → Plans**. When it ends, the daily job raises the Paystack price to the full price
  from the next charge.
