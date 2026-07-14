# Stripe subscription billing — implementation plan (not yet built)

Status as of 2026-07-14: **no live payment provider is wired up.** `plan` in
D1 (`user_identities.plan`) is only ever set manually via the admin panel
(`PATCH /api/cv/admin/users/plan`). `PricingModal`'s "Upgrade" button just
opens a `mailto:` link. This doc is the plan for replacing that with real
Stripe billing. Nothing in this file has been implemented — it's a reference
for whoever picks this up next.

## Why the standard Replit Stripe skill doesn't apply as-is

The `stripe` skill (`.local/skills/stripe/SKILL.md`) assumes a Node/Express
server backed by **Postgres**, using the `stripe-replit-sync` package to
mirror Stripe's data into a `stripe` schema and a managed webhook.

This project's backend is a **Cloudflare Worker** (`backend/cv-engine-worker`)
with **D1** (SQLite), not Postgres/Express. `stripe-replit-sync` targets
Postgres and a long-running Node process — it doesn't fit a Workers/D1
runtime. So this needs a **manual** Stripe integration: call the Stripe API
directly from the Worker, verify webhook signatures with Stripe's Web Crypto
API (works fine in Workers), and write subscription state into D1 ourselves.
Read the `monetization` and `stripe` skills for the general Replit-Stripe
conventions (checkout flow shape, publishing with live keys, secrets
handling) but adapt the storage/webhook layer to Worker+D1, not
Postgres+stripe-replit-sync.

## What's already correct and should NOT change

- Tier priority order: `premium` > `byok` > `free` (`getEffectiveTier()` in
  `frontend/services/accountTierService.ts`).
- The D1 `plan` column only ever holds `'free' | 'premium'`. BYOK stays a
  separate, client-detected runtime state (`byok_enabled` column / key
  presence) — never store `'byok'` as a `plan` value.
- As of this session, `AuthContext._saveUser` now calls
  `syncTierFromSession(user.plan)` on every confirmed session (boot,
  sign-in, sign-out), so the client-side feature-gating tier
  (`cv_builder:accountTier`) always mirrors whatever `plan` the server
  returns — including downgrades. Any new Stripe code should keep writing
  the *source of truth* to `user_identities.plan`; the client sync is
  already handled.

## Required D1 schema additions

Add a migration (next number after `039_byok_flag.sql`) with subscription
tracking columns on `user_identities` (or a separate `subscriptions` table if
you want history):

```sql
ALTER TABLE user_identities ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE user_identities ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE user_identities ADD COLUMN subscription_status TEXT; -- Stripe's status: active, past_due, canceled, unpaid, etc.
ALTER TABLE user_identities ADD COLUMN current_period_end INTEGER; -- unix seconds
ALTER TABLE user_identities ADD COLUMN cancel_at_period_end INTEGER DEFAULT 0; -- 0/1
CREATE INDEX IF NOT EXISTS idx_user_identities_stripe_customer ON user_identities(stripe_customer_id);
```

Without `current_period_end` / `cancel_at_period_end`, there is no way to
show "renews on X" or "cancels on X" in the UI, and no way to distinguish
"canceled but still paid through end of period" from "already lapsed."

## Checkout flow

1. New Worker route `POST /api/cv/billing/checkout` — creates a Stripe
   Checkout Session (`mode: 'subscription'`) for the signed-in user, passing
   `client_reference_id` = the D1 user id (or reuse `stripe_customer_id` if
   already set). Redirect back to `/?upgraded=1`.
2. Wire `PricingModal.handleUpgradePremium()` to call this route and redirect
   to `session.url`, replacing the current `mailto:` stub.
3. New Worker route `POST /api/cv/billing/portal` — creates a Stripe Billing
   Portal session for self-service plan management (cancel, update card,
   view invoices). Surface this from `AccountPage` next to "Sign out" /
   "Delete account" once a user is on `premium`.

## Webhook handler (the actual expiry/cancellation logic)

New Worker route `POST /api/cv/billing/webhook`, registered so it reads the
**raw body** (Workers `request.text()` before any JSON parsing) to verify
the Stripe signature with `stripe.webhooks.constructEventAsync` (the async
Web Crypto variant — the Node-only `constructEvent` will not work in a
Worker).

Handle at minimum:

| Event | Action |
|---|---|
| `checkout.session.completed` | Look up user by `client_reference_id`, store `stripe_customer_id` + `stripe_subscription_id`, set `plan = 'premium'`, `subscription_status = 'active'`. |
| `customer.subscription.updated` | Sync `subscription_status`, `current_period_end`, `cancel_at_period_end` from the event payload. If status becomes `canceled`, `unpaid`, or `incomplete_expired` → set `plan = 'free'`. |
| `customer.subscription.deleted` | Set `plan = 'free'`, clear `stripe_subscription_id`. This fires when a subscription actually ends (immediately for an immediate cancel, or at period end for a scheduled one — Stripe sends this event exactly once, at the moment access should end). |
| `invoice.payment_failed` | Optional: flag `subscription_status = 'past_due'` so the UI can show a "payment failed, update your card" banner before Stripe's own retry schedule eventually cancels the subscription. |

This is the mechanism that answers "what happens when my subscription
ends" — the downgrade is driven by `customer.subscription.deleted` (or
`updated` transitioning to a terminal status), not by the client polling or
guessing. No cron/poller is needed; Stripe's webhook already fires at the
right moment.

## Cancellation UX — recommended policy

- **User clicks "Cancel" in the Billing Portal:** default to canceling **at
  period end**, not immediately (Stripe's portal supports this natively —
  `cancel_at_period_end: true`). The user keeps premium/clean PDFs until
  `current_period_end`, then the `customer.subscription.deleted` webhook
  fires and flips them to `free` (or `byok` if they also have a key
  configured — already handled by `getEffectiveTier()`).
- Show the user their renewal/cancellation date in `AccountPage` using
  `current_period_end` + `cancel_at_period_end`, so "you're canceled but
  paid through March 3" is visible instead of surprising them later.
- No separate grace period beyond what Stripe already gives via
  `cancel_at_period_end` — don't invent a second grace window on top of
  Stripe's, it just creates two sources of truth for "when does this end."

## Edge cases to handle explicitly when implementing

- **Multiple devices / tabs:** already handled by this session's fix —
  `AuthContext` re-syncs the tier from the server-confirmed `plan` on every
  boot/login on every device, so a webhook-driven downgrade on one device
  is picked up the next time any other tab re-validates its session. If a
  near-real-time downgrade across *already-open* tabs matters, add a
  lightweight poll (e.g. re-run `syncTierFromServer` on `visibilitychange`)
  — not required for correctness, only for how fast an open tab notices.
- **Premium lapses while the user also has a BYOK key configured:** no
  special-casing needed — `getEffectiveTier()` already falls back to
  `'byok'`, not `'free'`, once `plan` flips back to `'free'`.
- **Payment fails but Stripe hasn't given up yet (`past_due`):** keep the
  user on `premium` while Stripe's own retry schedule runs; only downgrade
  on the terminal `customer.subscription.deleted` event, not on the first
  `invoice.payment_failed`.
- **Re-subscribing after a cancellation:** `checkout.session.completed` will
  fire again with a new `stripe_subscription_id` — make sure the handler
  overwrites the old one rather than erroring on a duplicate, since the old
  subscription id is gone.
- **Admin manually setting `plan` in D1 while a real Stripe subscription
  also exists:** avoid this once Stripe is live — it desyncs D1 from
  Stripe's own state with nothing to reconcile them. If an admin override is
  still needed (e.g. comping an account), track it as a distinct flag
  (`comped: 1`) rather than overwriting `plan` directly, so a later webhook
  doesn't silently undo the comp or vice versa.
- **PDF download counters on downgrade:** per existing behavior (see
  `.agents/memory/` — free-tier `pdf_dl_count` is a cumulative D1 counter,
  never reset on tier transitions), a user who lapses back to `free` keeps
  whatever count they'd already accumulated before ever going premium. Keep
  this as-is unless product wants a different policy; don't reset counters
  in the webhook handler without an explicit decision to do so.

## Suggested implementation order

1. D1 migration (schema above).
2. Webhook handler + signature verification (get this right first — it's
   the actual expiry/cancellation mechanism).
3. Checkout session route + wire `PricingModal`.
4. Billing portal route + surface "Manage subscription" in `AccountPage`.
5. Show renewal/cancellation date in `AccountPage` once `current_period_end`
   exists.
6. Only after the above is verified end-to-end in Stripe test mode: swap in
   live keys per the `stripe` skill's publishing section.
