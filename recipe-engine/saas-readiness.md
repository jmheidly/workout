# SaaS Readiness Guide

Last updated: 2026-02-28

---

## Current Status Summary

The recipe engine has a comprehensive feature set: multi-tenancy with RBAC, five auth methods (password, passwordless OTP, Google OAuth, email code login, passkey/WebAuthn), WebAuthn 2FA, email verification, Stripe billing with subscription gating, email infrastructure, legal pages, and account management. The remaining gaps are infrastructure/ops (backups, CI/CD, monitoring).

| Category | Status |
|----------|--------|
| Authentication (password + passwordless + OTP + Google OAuth + passkey) | Done |
| WebAuthn 2FA (security key / biometric on login) | Done |
| Passkey auth (passwordless primary login) | Done |
| Password reset (token + OTP) | Done |
| Passwordless signup + OTP login | Done |
| Email service (Resend) | Done |
| Email verification on signup | Done |
| Multi-tenancy (bakery scoping, roles, invites) | Done |
| Invitation emails | Done |
| Terms of Service + Privacy Policy | Done |
| Health check endpoint | Done |
| User settings (profile, password, passkeys, 2FA, delete) | Done |
| Data export (JSON) | Done |
| Account deletion (cascading) | Done |
| .env secured / .gitignore correct | Done |
| Billing / Stripe (checkout, webhooks, portal, gating) | Done |
| SQLite performance pragmas | Done |
| Error monitoring (Sentry) | Not started |
| SQLite backup strategy (Litestream) | Not started |
| Docker + CI/CD | Not started |
| Rate limiter persistence | Not started |

**Progress: 17/21 items complete. 4 remaining (all infrastructure/ops).**

---

## P0 — Pre-launch blockers

All P0 items are complete.

### 1. Environment secrets — DONE

- `.env` is in `.gitignore`
- `.env.example` documents required variables
- Database files excluded from git

### 2. Password reset — DONE

- `/forgot-password` sends 6-digit OTP + reset link (1-hour expiry)
- `/reset-password/[token]` for link-based reset
- OTP attempt tracking, single-use tokens
- Files: `src/routes/(auth)/forgot-password/`, `src/routes/(auth)/reset-password/`

### 3. Email infrastructure — DONE

- Resend integration (`resend@6.9.2`)
- Templates: password reset, login code, email verification, invitation
- Console fallback when API key missing or test key
- File: `src/lib/server/email.js`

### 4. Terms of Service + Privacy Policy — DONE

- `/terms` and `/privacy` routes with full content
- Cross-linked, referenced from login/signup forms
- Files: `src/routes/terms/`, `src/routes/privacy/`

### 5. Health check — DONE

- `GET /health` returns `{ status: "ok" }` (200) or `{ status: "error" }` (503)
- Tests DB connectivity
- File: `src/routes/health/+server.js`

---

## P1 — Required for paid SaaS launch

### 1. Billing / Stripe — DONE

- Stripe SDK integration (`src/lib/server/stripe.js`)
- Subscription management (`src/lib/server/billing.js`)
- Plan logic and status resolution (`src/lib/server/plans.js`)
- `bakery_subscriptions` table: `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `current_period_end`, `cancel_at_period_end`
- Checkout endpoint: `src/routes/api/stripe/checkout/+server.js`
- Webhook handler: `src/routes/api/stripe/webhook/+server.js`
  - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`
- Billing management UI: `src/routes/(app)/bakeries/settings/billing/`
- Subscription gating in `hooks.server.js` — inactive subscriptions redirected to `/bakeries/settings/billing`
- Feature-level gating via `requireSubscription()` and `requireEntitlement()` helpers

### 2. Email verification on signup — DONE

- `users.email_verified_at` column (NULL = unverified, timestamp = verified)
- `hooks.server.js` gates unverified users → redirect to `/verify-email`
- Bypass paths: `/verify-email`, `/login`, `/logout`, `/signup`, `/health`, `/terms`, `/privacy`, `/mfa`, `/api/mfa`, `/api/passkey`
- Signup auto-sends 6-digit OTP, redirects to `/verify-email`
- Google OAuth users auto-verified at account creation and account linking
- Existing users backfilled as verified on migration
- Reuses `email_login_codes` table and OTP infrastructure from passwordless login
- Rate limiting: 3 sends/10min, 5 verify attempts/10min, max 5 attempts per code
- Files: `src/routes/(auth)/verify-email/`, `src/lib/server/email.js`, `src/hooks.server.js`, `src/lib/server/db.js`

### 3. Account deletion + data export — DONE

- `/settings` has delete account with confirmation
- `deleteUser()` cascades: bakeries (sole owner), members, sessions, tokens, login codes
- `/settings/export` downloads full bakery JSON (recipes, mixers, ingredients)
- Files: `src/routes/(app)/settings/+page.svelte`, `src/routes/(app)/settings/export/`

### 4. User settings page — DONE

- Profile update (name)
- Password change (set or change)
- Passkeys management (add/remove, passwordless login)
- Two-factor authentication (WebAuthn security keys, enable/disable)
- Data export button
- Account deletion with confirmation
- File: `src/routes/(app)/settings/+page.svelte`

### 5. WebAuthn 2FA — DONE

- Security key enrollment: `src/routes/api/mfa/webauthn/enroll/` (options + verify)
- MFA login challenge: `src/routes/api/mfa/webauthn/options/+server.js`
- MFA login verify: `src/routes/api/mfa/webauthn/verify/+server.js`
- Credential management: `src/routes/api/mfa/webauthn/credentials/` (list + delete)
- `mfa_pending` table for pending MFA challenges with attempt tracking
- `users.mfa_enabled` toggle, managed in settings
- MFA challenge page: `src/routes/mfa/`
- Config: `src/lib/server/webauthn-config.js` (rpName, rpID, origin)

### 6. Passkey auth — DONE

- Passwordless primary login via Touch ID / Face ID / security keys
- Login endpoints (public): `src/routes/api/passkey/login/` (options + verify)
- Registration endpoints (authed): `src/routes/api/passkey/register/` (options + verify)
- `kind='passkey'` vs `kind='mfa_key'` in `webauthn_credentials` — independent management
- Login verify accepts any credential kind (platform auths create discoverable creds regardless of hint)
- Passkey login bypasses MFA, creates session directly
- Settings page: Passkeys section between Password and 2FA
- Full docs: `passkey-auth.md`

### 7. Error monitoring — NOT STARTED

**What's needed:**
- Sentry (or Bugsnag/LogRocket) integration
- Server-side error capture in `hooks.server.js`
- Client-side error capture in `hooks.client.js`
- Source maps uploaded on deploy

**Recommended:** `@sentry/sveltekit` — purpose-built for SvelteKit with auto-instrumentation.

**Files to create/modify:**
- `src/hooks.server.js` — add `handleError` export
- `src/hooks.client.js` — add client error handler
- `svelte.config.js` — Sentry Vite plugin for source maps

### 8. SQLite backup strategy — NOT STARTED

**What's needed:**
- Litestream for continuous WAL-based replication to S3/R2
- Scheduled backup verification (restore test)
- Point-in-time recovery capability

**Recommended:** Litestream replicating to Cloudflare R2 or S3. Runs as a sidecar process alongside the Node server.

**Files to create:**
- `litestream.yml` — replication config
- `Dockerfile` — run Litestream as init process, Node as subprocess
- Deployment docs with restore procedures

### 9. Docker + CI/CD — NOT STARTED

**What's needed:**
- Multi-stage Dockerfile (build + runtime)
- `docker-compose.yml` for local dev
- GitHub Actions workflow: lint, test, build, deploy
- Environment-specific configs

**Files to create:**
- `Dockerfile`
- `docker-compose.yml`
- `.github/workflows/ci.yml`
- `.dockerignore`

### 10. Rate limiter persistence — NOT STARTED

**Current state:** In-memory `Map<string, Map<string, number[]>>` — resets on server restart.

**What's needed:** Persist rate limit data to survive restarts. Two options:

- **SQLite table** (simplest, no new deps): `rate_limit_attempts` table, query with window filter
- **Redis** (standard, but adds infra): use `ioredis` with sliding window counters

**Recommendation:** SQLite table for now. Single-node deployment means no cross-process sharing needed. Add a `rate_limits` table with `(key, limiter, timestamp)` and query with `WHERE timestamp > ?`.

---

## P2 — Important for growth

### 1. Invitation emails — DONE

- `invitationEmail()` template sends email with accept link
- 7-day expiry, role included in email body
- File: `src/lib/server/email.js`

### 2. SQLite performance pragmas — DONE

All recommended pragmas are set in `getDb()`:
```js
_db.pragma('busy_timeout = 5000')
_db.pragma('synchronous = NORMAL')
_db.pragma('cache_size = -64000')
_db.pragma('mmap_size = 268435456')
_db.pragma('temp_store = MEMORY')
```
Plus `journal_mode = WAL` and `foreign_keys = ON`.

File: `src/lib/server/db.js`

### 3. N+1 on recipe list — NOT OPTIMIZED

**Current:** `getRecipesByBakery()` returns list, then `getRecipe()` + `calculateRecipe()` called per recipe in the load function.

**Options:**
- Batch load: single query joining recipes + ingredients + preferments
- Denormalize: store computed summary fields (total weight, hydration) on the recipe row
- Lazy calculate: only calculate on recipe detail page, show stored summaries on list

**File:** `src/routes/(app)/recipes/+page.server.js`

### 4. Usage limits tied to billing — NOT STARTED

Depends on entitlement checks from Stripe (P1.1, now done). Define limits per plan:

| Limit | Free | Pro | Team |
|-------|------|-----|------|
| Recipes | 5 | Unlimited | Unlimited |
| Bakery members | 1 | 5 | 25 |
| Templates | 3 | Unlimited | Unlimited |
| Data export | No | Yes | Yes |

Enforce via `requireEntitlement()` helper in `src/lib/server/billing.js`.

### 5. Onboarding flow — BASIC

**Current:** New users land on empty `/recipes` page.

**Ideas:**
- First-login detection → onboarding modal/checklist
- Seed a demo recipe on bakery creation
- Contextual empty states with CTAs ("Create your first recipe")

### 6. Analytics — NOT IMPLEMENTED

**Recommended:** Plausible (privacy-respecting, no cookie consent needed, simple script tag).

**Alternative:** PostHog for product analytics (feature usage, funnels).

Privacy policy currently states "no tracking cookies" — Plausible is compatible with this since it uses no cookies.

### 7. Cookie consent banner — NOT NEEDED

Only cookie is `recipe_session` (httpOnly, functional). Privacy policy states no tracking cookies. No banner required under GDPR for strictly necessary cookies.

### 8. Cross-tenant isolation tests — PARTIALLY DONE

**Current:** 41 role enforcement tests verify RBAC (viewer blocked, owner/admin/member allowed). Tests mock DB functions.

**Gap:** No integration tests verifying bakery A's data is invisible to bakery B's members.

**Add:** Tests that create two bakeries with different users and verify cross-bakery queries return empty/403.

**File:** `tests/role-enforcement.test.js`

### 9. DB migration tracking — BASIC

**Current:** `ALTER TABLE ... ADD COLUMN` wrapped in try/catch. Errors silently ignored (column already exists = no-op).

**Works because:** Additive-only migrations. No column drops or renames.

**Better approach:** Add a `schema_version` table, track applied migrations by number, run only new ones. Enables rollback awareness and audit trail.

---

## P3 — Nice to have

| Item | Notes |
|------|-------|
| Public API + API keys | REST API for external integrations (POS, inventory systems) |
| Dark mode | Tailwind `dark:` classes, theme toggle in settings |
| LibSQL/Turso | If multi-node deployment needed (SQLite is single-writer) |
| Rate limit /api/calculate | CPU-intensive endpoint, add per-IP throttling |

---

## What's Already Solid

- **Multi-tenancy**: Bakery-scoped data, RBAC with 4 roles, defense-in-depth DB scoping
- **Auth**: Five methods — password, passwordless OTP, Google OAuth, email code login, passkey/WebAuthn. Scrypt hashing (N=2^14), SHA256 session tokens, 30-day auto-extending sessions
- **2FA**: WebAuthn security keys with MFA pending flow, attempt tracking, 5-minute challenge expiry
- **Passkeys**: Passwordless primary auth via discoverable WebAuthn credentials, bypasses MFA
- **Billing**: Stripe checkout, webhooks, subscription gating in hooks, entitlement helpers
- **Security headers**: X-Frame-Options DENY, X-Content-Type-Options nosniff, HSTS (production), Referrer-Policy
- **CSRF protection**: SvelteKit form actions with built-in CSRF
- **SQL injection prevention**: Parameterized queries throughout
- **SQLite tuning**: WAL mode, all recommended pragmas (busy_timeout, synchronous NORMAL, 64MB cache, 256MB mmap)
- **Testing**: 41 role enforcement tests covering all protected routes
- **Invite system**: Token-based with email delivery, passthrough across OAuth flow

---

## Remaining Work — Implementation Order

### Phase 1: Infrastructure (before any public users)
1. Litestream backup + Dockerfile
2. GitHub Actions CI (lint + test + build)
3. Rate limiter to SQLite

### Phase 2: Security hardening
4. Sentry integration
5. Cross-tenant isolation tests

### Phase 3: Growth
6. Usage limits enforcement (billing infrastructure already exists)
7. Analytics (Plausible)
8. Onboarding flow
9. N+1 recipe list optimization
10. Migration version tracking

---

## Architecture Reference

```
recipe-engine/
  src/
    hooks.server.js          — session resolution, bakery context, subscription gating, security headers
    lib/
      server/
        db.js                — SQLite schema, CRUD, multi-tenancy, WebAuthn, subscriptions
        auth.js              — sessions, password hashing, requireRole()
        email.js             — Resend integration, email templates
        oauth.js             — Google OAuth (arctic)
        engine.js            — recipe calculation engine
        stripe.js            — Stripe SDK singleton
        billing.js           — subscription management, requireSubscription(), requireEntitlement()
        plans.js             — plan definitions, subscription status resolution
        webauthn-config.js   — rpName, rpID, origin for WebAuthn
        mfa-login.js         — MFA pending cookie management
      components/
        ui/                  — shadcn-svelte components
        app-sidebar.svelte   — navigation, bakery switcher
        login-form.svelte    — login UI (password + OTP tabs + Google + passkey)
        signup-form.svelte   — registration UI
    routes/
      (auth)/                — public: login, signup, forgot/reset password, verify-email, mfa
      (app)/                 — authenticated: recipes, settings, bakery management, billing
      (setup)/               — auth-only: bakery creation/selection
      api/
        mfa/webauthn/        — 2FA endpoints (enroll, options, verify, credentials)
        passkey/             — passkey endpoints (login + register, options + verify)
        stripe/              — checkout + webhook endpoints
      health/                — health check
      terms/, privacy/       — legal pages
  data/
    recipe-engine.db         — SQLite database (WAL mode)
  tests/
    role-enforcement.test.js — 41 RBAC tests
```

---

## Related Documentation

- `passkey-auth.md` — full passkey implementation details, design decisions, testing checklist
- `multitenancy.md` — multi-tenancy architecture and invite flow
- `recipemanagement.md` — recipe engine spec (sections 1-12)
- `versioning.md` — recipe versioning spec
- `accompanied-recipes.md` — accompanied recipes spec
