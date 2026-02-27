# SaaS Readiness Guide

Last updated: 2026-02-28

---

## Current Status Summary

The recipe engine has a solid foundation: multi-tenancy with RBAC, four auth methods (password, passwordless OTP, Google OAuth, email code login), email verification, email infrastructure, legal pages, and account management. The primary gaps are infrastructure/ops (billing, backups, CI/CD, monitoring).

| Category | Status |
|----------|--------|
| Authentication (password + passwordless + OTP + Google OAuth) | Done |
| Password reset (token + OTP) | Done |
| Passwordless signup + OTP login | Done |
| Email service (Resend) | Done |
| Multi-tenancy (bakery scoping, roles, invites) | Done |
| Invitation emails | Done |
| Terms of Service + Privacy Policy | Done |
| Health check endpoint | Done |
| User settings (profile, password, delete) | Done |
| Data export (JSON) | Done |
| Account deletion (cascading) | Done |
| .env secured / .gitignore correct | Done |
| Billing / Stripe | Not started |
| Email verification on signup | Done |
| Error monitoring (Sentry) | Not started |
| SQLite backup strategy | Not started |
| Docker + CI/CD | Not started |
| Rate limiter persistence | Not started |

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

### 1. Billing / Stripe — NOT STARTED

**What's needed:**
- Stripe integration (checkout, customer portal, webhooks)
- Plan tiers (free, pro, team — or similar)
- Feature gating based on plan
- Pricing page
- Webhook handler for subscription events

**Key decisions:**
- Per-bakery or per-user billing?
- What features are gated? (recipe count, member count, templates, export)
- Free tier limits?

**Files to create:**
- `src/lib/server/stripe.js` — Stripe client, webhook handler
- `src/routes/pricing/` — public pricing page
- `src/routes/api/webhooks/stripe/` — webhook endpoint
- `src/routes/(app)/bakeries/settings/billing/` — billing management UI
- DB: `subscriptions` table, `bakeries.plan` column

### 2. Email verification on signup — DONE

- `users.email_verified_at` column (NULL = unverified, timestamp = verified)
- `hooks.server.js` gates unverified users → redirect to `/verify-email`
- Bypass paths: `/verify-email`, `/login`, `/logout`, `/signup`, `/health`, `/terms`, `/privacy`
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
- Data export button
- Account deletion with confirmation
- Shows auth methods (password, Google)
- File: `src/routes/(app)/settings/+page.svelte`

### 5. Error monitoring — NOT STARTED

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

### 6. SQLite backup strategy — NOT STARTED

**What's needed:**
- Litestream for continuous WAL-based replication to S3/R2
- Scheduled backup verification (restore test)
- Point-in-time recovery capability

**Recommended:** Litestream replicating to Cloudflare R2 or S3. Runs as a sidecar process alongside the Node server.

**Files to create:**
- `litestream.yml` — replication config
- `Dockerfile` — run Litestream as init process, Node as subprocess
- Deployment docs with restore procedures

### 7. Docker + CI/CD — NOT STARTED

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

### 8. Rate limiter persistence — NOT STARTED

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

### 2. SQLite performance pragmas — PARTIALLY DONE

**Current:** `journal_mode = WAL`, `foreign_keys = ON`

**Add to `getDb()`:**
```js
_db.pragma('busy_timeout = 5000')        // wait 5s on lock instead of failing
_db.pragma('synchronous = NORMAL')       // safe with WAL, 2x faster writes
_db.pragma('cache_size = -64000')        // 64MB page cache
_db.pragma('mmap_size = 268435456')      // 256MB memory-mapped I/O
_db.pragma('temp_store = MEMORY')        // temp tables in memory
```

**File:** `src/lib/server/db.js` lines 14-18

### 3. N+1 on recipe list — NOT OPTIMIZED

**Current:** `getRecipesByBakery()` returns list, then `getRecipe()` + `calculateRecipe()` called per recipe in the load function.

**Options:**
- Batch load: single query joining recipes + ingredients + preferments
- Denormalize: store computed summary fields (total weight, hydration) on the recipe row
- Lazy calculate: only calculate on recipe detail page, show stored summaries on list

**File:** `src/routes/(app)/recipes/+page.server.js`

### 4. Usage limits tied to billing — NOT STARTED

Depends on Stripe integration (P1.1). Define limits per plan:

| Limit | Free | Pro | Team |
|-------|------|-----|------|
| Recipes | 5 | Unlimited | Unlimited |
| Bakery members | 1 | 5 | 25 |
| Templates | 3 | Unlimited | Unlimited |
| Data export | No | Yes | Yes |

Enforce in `requireRole()` or a new `requirePlan()` middleware.

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
- **Auth**: Scrypt hashing (N=2^14), SHA256 session tokens, 30-day auto-extending sessions, Google OAuth with PKCE, passwordless OTP login + passwordless signup (no password required), email verification on signup
- **Security headers**: X-Frame-Options DENY, X-Content-Type-Options nosniff, HSTS (production), Referrer-Policy
- **CSRF protection**: SvelteKit form actions with built-in CSRF
- **SQL injection prevention**: Parameterized queries throughout
- **Testing**: 41 role enforcement tests covering all protected routes
- **Invite system**: Token-based with email delivery, passthrough across OAuth flow

---

## Recommended Implementation Order

### Phase 1: Infrastructure (before any public users)
1. SQLite performance pragmas (30 min)
2. Litestream backup + Dockerfile (half day)
3. GitHub Actions CI (lint + test + build) (2-3 hours)
4. Rate limiter to SQLite (1-2 hours)

### Phase 2: Security hardening
5. ~~Email verification on signup~~ — DONE
6. Sentry integration (1-2 hours)
7. Cross-tenant isolation tests (2-3 hours)

### Phase 3: Monetization
8. Stripe integration + plan tiers (2-3 days)
9. Usage limits enforcement (half day)
10. Pricing page (half day)

### Phase 4: Growth
11. Analytics (Plausible) (30 min)
12. Onboarding flow (half day)
13. N+1 recipe list optimization (2-3 hours)
14. Migration version tracking (2-3 hours)

---

## Architecture Reference

```
recipe-engine/
  src/
    hooks.server.js          — session resolution, bakery context, security headers
    lib/
      server/
        db.js                — SQLite schema, CRUD, multi-tenancy (1945 lines)
        auth.js              — sessions, password hashing, requireRole()
        email.js             — Resend integration, email templates
        oauth.js             — Google OAuth (arctic)
        engine.js            — recipe calculation engine
      components/
        ui/                  — shadcn-svelte components
        app-sidebar.svelte   — navigation, bakery switcher
        login-form.svelte    — login UI (password + OTP tabs)
        signup-form.svelte   — registration UI
    routes/
      (auth)/                — public: login, signup, forgot/reset password, verify-email
      (app)/                 — authenticated: recipes, settings, bakery management
      (setup)/               — auth-only: bakery creation/selection
      health/                — health check
      terms/, privacy/       — legal pages
  data/
    recipe-engine.db         — SQLite database (WAL mode)
  tests/
    role-enforcement.test.js — 41 RBAC tests
```
