# Billing & Subscriptions

Last updated: 2026-02-28

---

## Overview

Per-bakery billing with a 14-day free trial, then a paywall. Stripe handles payments; our DB mirrors subscription state via webhooks. Two gated features: member count and data export.

- **Model**: 14-day free trial → Pro (paid). No permanent free tier.
- **Billing unit**: Per-bakery. Owner pays, all members benefit.
- **Gated features**: Member count (25 max including pending invites), Data export (Pro only).
- **Trial abuse prevention**: Each user gets one trial. Subsequent bakeries require immediate payment.

---

## Architecture

```
User clicks "Subscribe to Pro"
        │
        ▼
POST /api/stripe/checkout
        │ Creates Stripe Customer (if new)
        │ Creates Stripe Checkout Session
        ▼
Redirect to Stripe Checkout (hosted page)
        │
        ▼
User completes payment
        │
        ▼
Stripe fires webhook → POST /api/stripe/webhook
        │ checkout.session.completed
        │ Fetches full subscription from Stripe
        │ Upserts bakery_subscriptions row
        ▼
User redirected to /bakeries/settings/billing?success=1
```

### Subscription Lifecycle

```
┌─────────┐    14 days     ┌──────────────┐
│ trialing │───────────────→│ trial_expired │──→ Redirect to billing
└─────────┘                 └──────────────┘
     │                            │
     │ Subscribe                  │ Subscribe
     ▼                            ▼
┌─────────┐                 ┌─────────┐
│  active  │◄───────────────│  active  │
└─────────┘                 └─────────┘
     │                            │
     │ Payment fails              │ Cancel
     ▼                            ▼
┌──────────┐  7-day grace   ┌──────────┐
│ past_due  │───────────────→│ canceled  │──→ Redirect to billing
└──────────┘                 └──────────┘
     │
     │ invoice.paid
     ▼
┌─────────┐
│  active  │
└─────────┘
```

---

## Database

### Table: `bakery_subscriptions`

```sql
CREATE TABLE IF NOT EXISTS bakery_subscriptions (
  id TEXT PRIMARY KEY,
  bakery_id TEXT NOT NULL UNIQUE REFERENCES bakeries(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  plan TEXT NOT NULL DEFAULT 'trial',
  status TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at INTEGER,          -- epoch seconds
  current_period_end INTEGER,     -- epoch seconds
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Column: `users.trial_bakery_created`

```sql
ALTER TABLE users ADD COLUMN trial_bakery_created INTEGER NOT NULL DEFAULT 0
```

Tracks whether a user has already used their one free trial. Prevents creating multiple bakeries to get unlimited trials.

### Backfill (runs on startup)

- All existing users marked `trial_bakery_created = 1`
- All existing bakeries without a subscription get a 14-day trial

### Functions in `db.js`

| Function | Purpose |
|----------|---------|
| `getBakerySubscription(bakeryId)` | Get subscription row by bakery |
| `getBakerySubscriptionByStripeCustomer(stripeCustomerId)` | Lookup by Stripe customer ID |
| `createBakerySubscription(bakeryId, data)` | Insert new subscription |
| `upsertBakerySubscription(bakeryId, patch)` | Create or update (used by webhooks) |
| `hasUserUsedTrial(userId)` | Check `trial_bakery_created` flag |
| `markUserTrialUsed(userId)` | Set flag to 1 |
| `createBakeryWithSubscription(name, slug, userId)` | Atomic: create bakery + member + subscription in one transaction |
| `getBakeryMemberCount(bakeryId)` | Count active members + pending invites |

---

## Server Modules

### `src/lib/server/plans.js`

Pure logic, no Stripe dependency.

- **`PLANS`**: `{ trial: { maxMembers: 25, exportEnabled: true }, pro: { maxMembers: 25, exportEnabled: true } }`
- **`TRIAL_DURATION_DAYS`**: 14
- **`GRACE_PERIOD_DAYS`**: 7 (past-due subscriptions get 7 days before lockout)
- **`getSubscriptionStatus(sub)`** → `{ active, reason, plan, trialDaysLeft }`
  - Handles all Stripe statuses: `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`
- **`checkEntitlement(plan, entitlement, context)`** → `{ allowed, limit, current, reason }`
  - `'member_count'` — compares total (members + pending invites) against plan max
  - `'export'` — checks `exportEnabled`

### `src/lib/server/billing.js`

Thin wrappers that throw like `requireRole()`:

- **`requireSubscription(locals)`** — redirects to `/bakeries/settings/billing` if inactive
- **`requireEntitlement(locals, entitlement)`** — calls `requireSubscription`, then `checkEntitlement`. Returns 403 if not allowed.

### `src/lib/server/stripe.js`

Lazy-initialized Stripe SDK singleton. Reads `STRIPE_SECRET_KEY` from `$env/dynamic/private`. Returns `null` if not set (trial still works without Stripe configured).

---

## Hooks Gate — `src/hooks.server.js`

After the email verification gate, a subscription gate checks all app routes.

**Bypass paths** (no subscription check):

```
/bakeries/settings/billing
/api/stripe
/login, /logout, /signup
/health, /terms, /privacy
/verify-email
/bakeries (setup/switch)
/invite
/settings
```

All other routes require an active subscription. If inactive → redirect to billing page.

`locals.subscription` is attached for all routes (bypassed or not) so downstream code can read the status.

---

## Stripe Endpoints

### `POST /api/stripe/checkout`

Creates a Stripe Checkout Session. Owner-only.

- Creates/reuses a Stripe Customer (stored in `bakery_subscriptions.stripe_customer_id`)
- Triple metadata for reliable webhook resolution:
  - `client_reference_id` on the Checkout Session
  - `metadata.bakery_id` on the Customer
  - `metadata.bakery_id` on the Subscription
- Redirects to Stripe-hosted checkout page
- Returns `{ url }` for client-side redirect

### `POST /api/stripe/portal`

Creates a Stripe Customer Portal Session. Owner-only. Returns `{ url }`.

The portal lets users:
- Update payment method
- Cancel subscription
- View invoices and receipts

Configure portal features at: [dashboard.stripe.com/settings/billing/portal](https://dashboard.stripe.com/settings/billing/portal)

### `POST /api/stripe/webhook`

Handles Stripe webhook events. No auth — verified by signature.

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Fetch full subscription from Stripe, upsert with `plan: 'pro'`, `status`, `stripe_subscription_id`, `stripe_price_id`, `current_period_end` |
| `customer.subscription.updated` | Sync `status`, `stripe_price_id`, `current_period_end`, `cancel_at_period_end` |
| `customer.subscription.deleted` | Set `status: 'canceled'` |
| `invoice.payment_failed` | Set `status: 'past_due'` |
| `invoice.paid` | Restore status from Stripe, update `current_period_end` |

Unhandled events (e.g., `customer.created`, `payment_intent.created`) return 200 — they're safe to ignore.

---

## Bakery Creation

Three creation points, all use `createBakeryWithSubscription()`:

| File | When |
|------|------|
| `src/routes/(auth)/signup/+page.server.js` | New user signup (no invite) |
| `src/routes/login/google/callback/+server.js` | New Google OAuth user |
| `src/routes/(setup)/bakeries/new/+page.server.js` | Creating additional bakery |

The function atomically creates bakery + member + subscription in one transaction:
- **First bakery**: Grants 14-day trial, marks `trial_bakery_created = 1`
- **Subsequent bakeries**: Creates with `status: 'canceled'` — user is immediately redirected to billing

---

## Feature Gates

### Member Count

Checked at two enforcement points:

1. **`src/routes/(app)/bakeries/settings/members/+page.server.js`** — `invite` action calls `requireEntitlement(locals, 'member_count')` before creating invitation
2. **`src/routes/invite/[token]/+page.server.js`** — `accept` action checks member count against plan limits before adding member

The count includes **active members + pending (non-expired) invitations**.

### Data Export

**`src/routes/(app)/settings/export/+server.js`** — calls `requireSubscription(locals)` as defense-in-depth (hooks gate already blocks expired subscriptions).

### Bakery Deletion

**`src/routes/(app)/bakeries/settings/+page.server.js`** — `delete` action cancels Stripe subscription (if exists) before deleting bakery. Non-blocking — deletion proceeds even if Stripe call fails. `ON DELETE CASCADE` handles the `bakery_subscriptions` row.

---

## UI

### Sidebar (`src/lib/components/app-sidebar.svelte`)

Three contextual cards between `Sidebar.Content` and `Sidebar.Footer`:

- **Trial**: Gradient card with zap icon, progress bar showing days remaining, "Upgrade to Pro →" link
- **Past Due**: Red card with alert icon, "Update billing info →" link
- **Canceling**: Subtle card with warning icon, "Manage billing →" link

Cards are clickable links to `/bakeries/settings/billing`. Hidden when subscription is active with no issues.

"Billing" is also listed in the Settings nav group with a credit-card icon.

### Billing Page (`/bakeries/settings/billing`)

Accessible to owners and admins. Three cards:

1. **Current Plan** — Status badge (Trial/Pro/Expired/Canceled/Past Due), trial days remaining or next billing date, cancel-at-period-end notice
2. **Usage** — Member count with progress bar, pending invite count
3. **Actions** — "Subscribe to Pro" or "Manage Billing" button depending on state

Flash messages from `?success=1` / `?canceled=1` query params after Stripe redirect.

### Layout (`src/routes/(app)/+layout.svelte`)

Passes `subscription` data to sidebar. Adds `billing` to breadcrumb route labels.

---

## Environment Variables

```env
STRIPE_SECRET_KEY=sk_test_...       # Stripe API secret key
STRIPE_WEBHOOK_SECRET=whsec_...     # Webhook signing secret
STRIPE_PRO_PRICE_ID=price_...       # Price ID for the Pro plan (NOT prod_)
```

All read via `$env/dynamic/private` (SvelteKit's env module, not `process.env`).

**Without Stripe keys**: Trial flow works fully. Checkout/portal buttons show "Billing is not configured" error.

---

## Local Development

### 1. Start webhook forwarding

```bash
stripe login              # one-time auth
stripe listen --forward-to localhost:4000/api/stripe/webhook
```

Copy the `whsec_...` secret it prints into `.env`.

### 2. Create a test product

1. Go to [dashboard.stripe.com/test/products](https://dashboard.stripe.com/test/products)
2. Create "Pro Plan" with a recurring price
3. Copy the `price_...` ID (not `prod_...`) into `STRIPE_PRO_PRICE_ID`

### 3. Test card numbers

| Card | Behavior |
|------|----------|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 3220` | Requires 3D Secure |
| `4000 0000 0000 9995` | Declines (payment_failed) |
| `4000 0000 0000 0341` | Attaches, then fails on charge |

Any future expiry date, any 3-digit CVC.

### 4. Simulate trial expiry

```bash
sqlite3 data/recipe-engine.db "UPDATE bakery_subscriptions SET trial_ends_at = strftime('%s','now') - 1 WHERE status = 'trialing';"
```

### 5. Trigger webhook events manually

```bash
stripe trigger invoice.payment_failed
stripe trigger invoice.paid
stripe trigger customer.subscription.deleted
```

### 6. Inspect DB state

```bash
sqlite3 data/recipe-engine.db "SELECT b.name, bs.plan, bs.status, bs.trial_ends_at, bs.stripe_subscription_id, bs.cancel_at_period_end FROM bakery_subscriptions bs JOIN bakeries b ON b.id = bs.bakery_id;"
```

---

## Files

| File | Role |
|------|------|
| `src/lib/server/db.js` | Schema, migrations, backfill, subscription CRUD, `createBakeryWithSubscription` |
| `src/lib/server/plans.js` | Plan config, `getSubscriptionStatus`, `checkEntitlement` |
| `src/lib/server/billing.js` | `requireSubscription`, `requireEntitlement` helpers |
| `src/lib/server/stripe.js` | Stripe SDK singleton |
| `src/hooks.server.js` | Subscription gate (after email verification gate) |
| `src/routes/api/stripe/checkout/+server.js` | Checkout Session creation |
| `src/routes/api/stripe/portal/+server.js` | Customer Portal creation |
| `src/routes/api/stripe/webhook/+server.js` | Webhook handler (5 events) |
| `src/routes/(app)/bakeries/settings/billing/+page.server.js` | Billing page data |
| `src/routes/(app)/bakeries/settings/billing/+page.svelte` | Billing UI |
| `src/routes/(app)/+layout.server.js` | Exposes subscription status to layout |
| `src/routes/(app)/+layout.svelte` | Passes subscription to sidebar |
| `src/lib/components/app-sidebar.svelte` | Trial/past-due/canceling cards, billing nav link |
| `src/routes/(auth)/signup/+page.server.js` | Uses `createBakeryWithSubscription` |
| `src/routes/login/google/callback/+server.js` | Uses `createBakeryWithSubscription` |
| `src/routes/(setup)/bakeries/new/+page.server.js` | Uses `createBakeryWithSubscription` |
| `src/routes/(app)/bakeries/settings/+page.server.js` | Cancels Stripe on bakery delete |
| `src/routes/(app)/bakeries/settings/members/+page.server.js` | Member count entitlement gate |
| `src/routes/invite/[token]/+page.server.js` | Member count check on invite accept |
| `src/routes/(app)/settings/export/+server.js` | Export subscription gate |
| `.env.example` | Stripe env var documentation |
| `package.json` | `stripe` dependency |

---

## Future Considerations

- **Multiple tiers**: Add rows to `PLANS` in `plans.js`, add price IDs. `stripe_price_id` column already supports this.
- **Per-seat pricing**: Replace flat `maxMembers` with Stripe's quantity-based billing. Update member count on invite/remove.
- **Webhooks in production**: Register endpoint at [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks) with the 5 events listed above.
- **Idempotency**: Webhook handlers use `upsertBakerySubscription` which is idempotent — safe for Stripe retries.
- **Rate limiter**: Consider adding rate limiting to `/api/stripe/checkout` and `/api/stripe/portal` to prevent abuse.
