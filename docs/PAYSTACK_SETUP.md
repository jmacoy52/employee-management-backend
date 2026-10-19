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
   **Test Callback URL** can be `https://emplocore.vercel.app/billing/callback` or
   `https://emplocore.vercel.app/admin/billing/callback`: both work (`/billing/callback` redirects to the admin
   page, keeping `?reference=`). EmploCore also sends the callback address with every payment.
   Check it all on **Owner console → Revenue → Payments settings**: it shows *Paystack TEST mode*, whether both
   keys are set, the webhook address (with a **Copy** button) and when the last webhook arrived. Keys are never
   stored in the database or shown there.
5. Sign in as an organisation admin of a **non-demo** organisation, open **Billing**, choose a plan and pay with a
   Paystack test card: **4084 0840 8408 4081**, CVV **408**, any future expiry date, PIN **0000**, OTP **123456**
   (Paystack docs, "Test payments"). Paystack's checkout page has a Cloudflare "verify you are human" check, so
   this step needs a real browser. You come back to the confirmation page; the plan switches
   to the paid plan and the payment appears under **Payments** with a PDF invoice.
6. Check the owner console: **Revenue** shows the MRR; **Audit log** shows `BILLING_SUBSCRIPTION_ACTIVATED`.

## 3. Go live
1. In Paystack switch to **Live mode** and copy the **Live Secret Key** and **Live Public Key**.
2. In Render, replace `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` with the live keys (web service).
3. Set the **Live Webhook URL** to the same address as above.
4. Payments started with test keys cannot be confirmed with live keys; ask anyone who started a test payment to
   start again.

## 4. Daily billing job (nothing to set up)
The web service runs the daily billing job itself (`services/billingScheduler.js`): every 30 minutes it checks
whether today's run has happened and, from 06:00 UTC (06:00 in Accra), runs it once. A MySQL lock makes sure only
one instance runs it, and every step is safe to repeat. The last run is shown under **Payments settings**.
On a free Render plan the service sleeps when idle; the job then runs at the first request after 06:00.

**Optional cron service.** If you prefer a separate Render cron job, uncomment the `emplocore-billing-daily` block
in `render.yaml` (or create **New → Cron Job**: branch `v1/aiven-production`, build `npm install`, command
`npm run billing:daily`, schedule `0 6 * * *`) and give it `DB_URL`, `DB_SSL_CA_BASE64` and `PAYSTACK_SECRET_KEY`.
Render bills cron jobs by run time with a minimum of US$1 a month per job. Both together are safe; set
`BILLING_IN_APP_DAILY=false` on the web service if only the cron job should run it.

## Environment variables (names only)
| Name | Where | Needed | Purpose |
|---|---|---|---|
| `PAYSTACK_SECRET_KEY` | web service and cron job | to take payments | API calls and webhook signature check (HMAC SHA512 of the raw body, header `x-paystack-signature`) |
| `PAYSTACK_PUBLIC_KEY` | web service | recommended | reported as configured; not needed by the redirect checkout |
| `APP_URL` | web service | default is fine | frontend address; the return page is `APP_URL/admin/billing/callback` |
| `PAYSTACK_CALLBACK_URL` | web service | optional | overrides the return page |
| `PAYSTACK_WEBHOOK_URL` | web service | optional | overrides the address shown on Payments settings; the API always serves the webhook at `/api/billing/paystack/webhook` |
| `BILLING_IN_APP_DAILY` | web service | optional | `false` turns off the in-app daily billing job (default on) |

## Rotating the secret key
Generate a new secret key in Paystack, update `PAYSTACK_SECRET_KEY` on the web service (and the cron job, if you added one),
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

## Without Joseph's developer: owner panel controls
Everything day to day is in the owner console, and every action is recorded in the platform audit log:
- **Organisation page → Subscription**: *Extend trial*, *End trial now* (grace or straight to Free), *Record
  payment* (cash, mobile money, bank: plan, months, amount, reference, date, note; creates a paid invoice the admin
  can download), *Assign plan* (including Enterprise), *Apply founding discount*, *Pause* / *Resume*, *Cancel
  subscription* (now, or at the end of a paid Paystack period).
- **Revenue → Payments settings**: test or live mode, keys set, webhook address, last webhook, last daily run.
- **Plans and prices**: prices, limits, features and the founding offer.

