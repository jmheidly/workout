# Passkey Authentication

Last updated: 2026-02-28

---

## Overview

Passkeys enable passwordless sign-in via Touch ID, Face ID, or hardware security keys. The app already had WebAuthn for 2FA (`kind='mfa_key'`). This adds passkeys as a **primary auth method** (`kind='passkey'`) — one tap, no password needed.

Passkey login bypasses MFA entirely because WebAuthn with user verification is inherently multi-factor (device possession + biometric/PIN).

---

## Database

### Schema (no changes)

Uses the existing `webauthn_credentials` table. The `kind` column distinguishes credential types:

- `'mfa_key'` — second-factor credential, managed in the 2FA settings section
- `'passkey'` — primary auth credential, managed in the Passkeys settings section

```sql
CREATE TABLE webauthn_credentials (
  id TEXT PRIMARY KEY,        -- base64url credential ID from @simplewebauthn/server
  user_id TEXT NOT NULL,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,            -- JSON array, e.g. '["internal","hybrid"]'
  kind TEXT NOT NULL,          -- 'mfa_key' or 'passkey'
  created_at INTEGER NOT NULL, -- epoch ms
  last_used_at INTEGER         -- epoch ms, updated on each successful auth
);

CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,      -- user ID or '__passkey_login__' sentinel for login
  purpose TEXT NOT NULL,       -- 'enroll', 'passkey_register', or 'passkey_login'
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL  -- epoch ms, 5 min TTL
);
```

### Helpers added to `src/lib/server/db.js`

| Function | Description |
|----------|-------------|
| `getUserPasskeys(userId)` | Returns `id, created_at, last_used_at` for `kind='passkey'` credentials |
| `countUserPasskeys(userId)` | Returns count of passkey credentials for a user |

---

## API Endpoints

All endpoints are under `/api/passkey/`. Login endpoints are **public** (no session required). Registration endpoints require an **authenticated session**.

### Login Flow (public)

#### `POST /api/passkey/login/options`

Generates discoverable authentication options.

- Cleans up expired challenges
- Calls `generateAuthenticationOptions()` with `allowCredentials: []` (discoverable)
- Stores challenge in `webauthn_challenges` with `userId: '__passkey_login__'` sentinel (satisfies NOT NULL constraint; lookup is by challenge PK, not user)
- Returns `{ challengeId, options }`

**File:** `src/routes/api/passkey/login/options/+server.js`

#### `POST /api/passkey/login/verify`

Verifies the authentication assertion and creates a session.

- Parses `{ challengeId, assertionResponse }` from request body
- Rate limits by challengeId (in-memory Map, max 5 attempts)
- Validates challenge exists, has purpose `'passkey_login'`, not expired
- Looks up credential by `assertionResponse.id` — accepts **any kind** (see "Kind Check Removed" below)
- Calls `verifyAuthenticationResponse()` with stored public key, expected challenge/origin/rpID
- On success: updates counter + last_used_at, deletes challenge, creates session directly
- Determines redirect: checks `active_bakery_id` → `/recipes` if member, else `/bakeries`
- Returns `{ ok: true, next }`

**File:** `src/routes/api/passkey/login/verify/+server.js`

### Registration Flow (authenticated)

#### `POST /api/passkey/register/options`

Generates registration options for a discoverable credential.

- Same pattern as MFA enroll options but with `residentKey: 'required'` (makes credential discoverable)
- Excludes only existing passkeys (`kind='passkey'`), not MFA keys
- Challenge purpose: `'passkey_register'`
- Returns `{ challengeId, options }`

**File:** `src/routes/api/passkey/register/options/+server.js`

#### `POST /api/passkey/register/verify`

Verifies registration and stores the credential.

- Same pattern as MFA enroll verify but stores with `kind: 'passkey'`
- Does **not** call `setUserMfaEnabled()` — passkeys are independent of the MFA toggle
- Returns `{ ok: true }`

**File:** `src/routes/api/passkey/register/verify/+server.js`

---

## Hooks (`src/hooks.server.js`)

Added `'/api/passkey'` to `VERIFY_BYPASS_PATHS` so passkey login endpoints work before any session exists (alongside `/mfa` and `/api/mfa`).

---

## Login Form (`src/lib/components/login-form.svelte`)

Restructured to: primary form on top, alternatives below the OR separator.

```
Card
  Header: "Welcome back"
  Content:
    ButtonGroup: Password | Email Code
    [error display]
    [form for active tab — email, password/OTP, submit]
    ─────────── OR ───────────
    [Sign in with Google]       (outline button)
    [Sign in with passkey]      (outline button, conditional)
    Don't have an account? Sign up
    Terms · Privacy
```

### Passkey button behavior

- Only rendered when `browserSupportsWebAuthn()` returns true (checked in `onMount`)
- `signInWithPasskey()`: POST options → `startAuthentication({ optionsJSON })` → POST verify → `window.location.href = result.next`
- `NotAllowedError` (user cancelled the picker) is handled silently — no error shown
- Other errors display in the error banner

---

## Settings Page

### Server (`src/routes/(app)/settings/+page.server.js`)

- `load()` now returns `passkeys` array (mapped to `{ id, createdAt, lastUsedAt }`)
- Added `removePasskey` action: validates credential exists, belongs to user, `kind === 'passkey'`, then deletes

### UI (`src/routes/(app)/settings/+page.svelte`)

Added a **Passkeys** section between Password and Two-Factor Authentication, using the same two-column grid layout:

- Lists registered passkeys with lock icon, created date, last used date
- Each passkey has a "Remove" button (form action `?/removePasskey`)
- "Add passkey" button triggers: fetch register options → `startRegistration()` → fetch register verify → `invalidateAll()`
- Empty state with dashed border: "No passkeys — Add a passkey for fast, passwordless sign-in."

---

## Key Design Decisions

### Kind check removed from login verify

The original plan checked `credential.kind === 'passkey'` during login verification. This was removed because **platform authenticators (Touch ID, Windows Hello) create discoverable credentials even when `residentKey: 'discouraged'` was requested** during MFA enrollment. This means:

1. User enrolls an MFA key (`kind='mfa_key'`) with `residentKey: 'discouraged'`
2. Touch ID ignores the hint and creates a discoverable credential anyway
3. User clicks "Sign in with passkey" — browser shows the MFA key in the picker
4. User selects it, but verify rejects it because `kind !== 'passkey'`

The fix: accept **any** WebAuthn credential during passkey login. The `kind` field remains useful for the management UI (separate sections in settings) but is not an auth gate. User verification is always required, so any credential is inherently multi-factor regardless of its `kind`.

### Passkey login bypasses MFA

Passkeys are inherently multi-factor (device possession + biometric/PIN). No MFA redirect or `mfa_pending` flow is triggered — the session is created directly.

### `__passkey_login__` sentinel

The `webauthn_challenges.user_id` column is NOT NULL. For passkey login, the user isn't known yet (discoverable flow). The sentinel value `'__passkey_login__'` satisfies the constraint. Challenge lookup is always by PK (`id`), never by `user_id`, so this doesn't affect queries.

### Passkeys vs MFA keys — independent management

| | Passkeys | MFA Keys |
|---|---|---|
| Purpose | Primary auth (replaces password) | Second factor after password |
| `kind` value | `'passkey'` | `'mfa_key'` |
| `residentKey` | `'required'` (discoverable) | `'discouraged'` (but platform auths may ignore) |
| Settings section | "Passkeys" | "Two-factor authentication" |
| Affects `mfa_enabled`? | No | Yes |
| Login flow | Direct session creation | Requires password first, then MFA challenge |

---

## Files Summary

### New (4)

| File | Purpose |
|------|---------|
| `src/routes/api/passkey/login/options/+server.js` | Discoverable auth options (public) |
| `src/routes/api/passkey/login/verify/+server.js` | Verify assertion, create session (public) |
| `src/routes/api/passkey/register/options/+server.js` | Registration options (authenticated) |
| `src/routes/api/passkey/register/verify/+server.js` | Verify registration (authenticated) |

### Modified (5)

| File | Changes |
|------|---------|
| `src/lib/server/db.js` | Added `getUserPasskeys()`, `countUserPasskeys()` |
| `src/lib/components/login-form.svelte` | Restructured: form on top, Google + passkey below OR separator |
| `src/routes/(app)/settings/+page.svelte` | Added Passkeys section with add/remove |
| `src/routes/(app)/settings/+page.server.js` | Load passkeys, added `removePasskey` action |
| `src/hooks.server.js` | Added `/api/passkey` to verify bypass paths |

---

## Dependencies

Uses the existing `@simplewebauthn/server` (server-side) and `@simplewebauthn/browser` (client-side) packages — no new dependencies added.

Shared config from `src/lib/server/webauthn-config.js`: `rpName`, `rpID`, `origin`.

---

## Testing Checklist

1. Register passkey in Settings → "Add passkey" → Touch ID prompt → passkey appears in list
2. Log out → login page shows "Sign in with passkey" below OR separator
3. Click it → browser shows passkey picker → tap Touch ID → redirected to `/recipes`
4. Verify: session cookie set directly, no MFA redirect
5. Password login with MFA enabled still works independently
6. Remove passkey in Settings → passkey disappears from list
7. MFA keys (registered via 2FA section) also work with "Sign in with passkey" (kind check removed)
8. `yarn build` succeeds
