# Backend patch — payment gate, settlements, ad tracking, Flutterwave

Apply these files over your existing backend repo (they're modified copies of files
you already have, plus a few new ones), then follow the setup steps below.

## New/changed files

- `database/schema.sql` — 2 new columns (`orders.settlement_id`, `ads.impressions`, `ads.clicks`)
- `models/orderModel.js` — `paid_at` no longer auto-set at checkout; new helpers for
  payment-ref lookup, marking paid, and settlement eligibility
- `models/adModel.js` — `trackHit()` for impression/click counters
- `controllers/orderController.js` — real payment gate, Flutterwave checkout + verification, webhook handler
- `controllers/adminController.js` — `verifyOrderPayment` (manual transfer confirmation), settlement rejection now frees up orders
- `controllers/settlementController.js` — amount is now computed from eligible orders, not vendor-supplied
- `controllers/adController.js` — `trackAd` handler
- `routes/orderRoutes.js`, `routes/adminRoutes.js`, `routes/vendorRoutes.js`, `routes/adRoutes.js` — new routes for the above
- `routes/webhookRoutes.js` — **new file**, Flutterwave webhook
- `utils/flutterwave.js` — **new file**, Flutterwave API client
- `middleware/validators.js` — `amount` no longer required on settlement creation
- `app.js` — mounts the new webhook route
- `.env.example` — documents the 2 new Flutterwave env vars

## What actually changed, behaviorally

1. **Real payment gate.** Previously `paid_at` was set the instant a payment method was
   chosen at checkout — meaning nothing was ever actually gated. Now `paid_at` stays
   NULL until real verification happens, and a vendor can't move an order from
   `pending` → `preparing` until it does. Admins can still override via the status
   buttons on `/admin/orders`.
2. **Bank transfer verification** is manual: admin checks the uploaded receipt on
   `/admin/orders`, clicks "Verify payment" → `paid_at` is set → vendor is unblocked.
3. **Card payment is now real**, via Flutterwave: checkout returns a hosted checkout
   link, the customer pays there, gets redirected back to `/checkout/callback` on
   your frontend, which calls `GET /orders/verify-payment` to confirm and mark the
   order(s) paid. A webhook (`POST /webhooks/flutterwave`) double-confirms
   server-to-server in case the customer closes the tab before the redirect fires.
4. **Settlements are now eligibility-based**, not a free-typed amount. An order
   becomes eligible for payout the day after its payment is verified, once it's
   delivered, and once it hasn't already been claimed by an earlier settlement
   request. The vendor's payout page shows exactly what's available and the amount
   is computed server-side — they can no longer type an arbitrary number. If you
   reject a settlement, its orders become eligible again automatically.
5. **Ad impressions/clicks** are now tracked via `POST /ads/:id/track`, called by the
   frontend once per ad shown and once per click. Running totals only, no
   time-series breakdown.
6. **Cash on delivery is rejected server-side too** now (previously the frontend just
   didn't offer it in the UI, but the API would have accepted it if sent directly).
7. **Admin login fix, no terminal needed.** If `node database/reset-admin.js`
   wasn't runnable for you (no Railway CLI/terminal access to production), there's
   now a boot-time version: set `RESET_ADMIN_ON_BOOT=true` on Railway and redeploy —
   `server.js` runs the same sync automatically on startup and logs the result to
   the deploy logs. Turn the env var back off afterward (it's harmless to leave on,
   but there's no reason to). Also fixed: email login lookup was **case-sensitive**
   (`WHERE email = $1`), so typing the email with different capitalization than
   what's actually stored in the database would silently fail every time with the
   same generic "Invalid email or password" — that's now case-insensitive.

## Setup steps

1. **Copy these files into your repo**, overwriting the existing ones.
2. **Run the schema migration**: `node database/migrate.js` (same command you'd
   already use — it's idempotent, safe to re-run).
3. **Get your Flutterwave keys**: dashboard.flutterwave.com → Settings → API Keys.
   Add to Railway's backend service variables:
   - `FLW_SECRET_KEY` — from that page
   - `FLW_WEBHOOK_HASH` — make up any long random string yourself
4. **Register the webhook** in the Flutterwave dashboard: Settings → Webhooks →
   set the URL to `https://<your-backend-domain>/api/webhooks/flutterwave`, and
   paste the *same* random string into the "Secret Hash" field there.
5. **Set the company account details** at `/admin/settings` (already built in the
   last frontend update) — bank name, account number, account name. These show to
   customers at checkout for bank transfers.
6. Redeploy the backend.

## Test checklist

- [ ] Register/checkout with **transfer** → order sits `pending`, unpaid → vendor
      can't move it to preparing → admin verifies payment on `/admin/orders` →
      vendor now can.
- [ ] Checkout with **card** → redirected to Flutterwave (use their test card
      `5531 8866 5214 2950`, any future expiry, CVV `564`, PIN `3310`, OTP `12345`) →
      redirected back to `/checkout/callback` → order shows paid.
- [ ] Deliver an order, wait a day (or manually set `paid_at` further back in the DB
      for testing), confirm it shows up under vendor "Payouts" as eligible.
- [ ] Post an ad from `/admin/ads`, confirm it shows on the targeted page and
      impressions/clicks increment.
