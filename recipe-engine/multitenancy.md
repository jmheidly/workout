# Multi-Tenancy Specification — Bakery Management System

## Table of Contents

1. [Overview & Design Principles](#1-overview--design-principles)
2. [Tenant Model](#2-tenant-model)
3. [Data Model](#3-data-model)
4. [Bakery Lifecycle](#4-bakery-lifecycle)
5. [Membership & Roles](#5-membership--roles)
6. [Invitation System](#6-invitation-system)
7. [Auth Flow Integration](#7-auth-flow-integration)
8. [Bakery Context Resolution](#8-bakery-context-resolution)
9. [Data Scoping & Isolation](#9-data-scoping--isolation)
10. [Route Architecture](#10-route-architecture)
11. [Seed Data](#11-seed-data)

---

## 1. Overview & Design Principles

The recipe engine uses **bakery-level multi-tenancy**. A bakery is the tenant — all domain data (recipes, mixer profiles, ingredient library) is scoped to a bakery, not to individual users. Users belong to one or more bakeries and switch between them.

### Core Principles

1. **Bakery is the tenant.** All domain data belongs to a bakery, not a user. This enables team collaboration within a bakery.
2. **Users can belong to multiple bakeries.** A baker who works at two shops can switch between them. Each bakery has its own isolated data.
3. **One active bakery at a time.** The user's `active_bakery_id` determines which bakery they're working in. All queries use this context.
4. **Roles control access.** Four roles — owner, admin, member, viewer — determine what a user can do within a bakery.
5. **Invite-based membership.** New members join via invite links. No self-service join.
6. **Every mutation is bakery-scoped.** All UPDATE and DELETE queries include `AND bakery_id = ?` to prevent cross-tenant data access, even if an attacker knows a record ID.
7. **Attribution preserved.** Domain records store both `user_id` (who created/modified) and `bakery_id` (which tenant owns it). user_id is for audit trail; bakery_id is for access control.

---

## 2. Tenant Model

```
┌──────────────┐
│    Bakery     │  ← Tenant. Owns all domain data.
│  (bakeries)  │
└──────┬───────┘
       │ 1:N
┌──────┴───────┐
│ BakeryMember │  ← Join table. Links users to bakeries with a role.
│(bakery_members)│
└──────┬───────┘
       │ N:1
┌──────┴───────┐
│     User     │  ← Has active_bakery_id pointing to current bakery.
│   (users)    │
└──────────────┘

Domain data owned by bakery:
  - recipes (bakery_id)
  - mixer_profiles (bakery_id)
  - ingredient_library (bakery_id)
```

### 2.1 Bakery Auto-Creation

Every user must belong to at least one bakery. Bakeries are created automatically on:

- **Email signup** — a personal bakery named `"{name}'s Bakery"` with slug derived from email prefix
- **Google OAuth signup (new user)** — same pattern, using Google profile name
- **Accepting an invitation** — user joins an existing bakery (no auto-creation)

### 2.2 Active Bakery

The `active_bakery_id` column on the users table tracks the user's current working bakery. It is set:

- On signup (to the auto-created personal bakery)
- On invite acceptance (switches to the inviting bakery)
- On explicit bakery switch via `/bakeries` page

If `active_bakery_id` is null or the user is no longer a member, the app redirects to `/bakeries` for selection.

---

## 3. Data Model

### 3.1 New Tables

```sql
CREATE TABLE bakeries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE bakery_members (
  id TEXT PRIMARY KEY,
  bakery_id TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',  -- owner | admin | member | viewer
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(bakery_id, user_id)
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  bakery_id TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by TEXT NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  UNIQUE(bakery_id, email)
);
```

### 3.2 Modified Columns

| Table | Added Column | Purpose |
|-------|-------------|---------|
| `users` | `active_bakery_id TEXT REFERENCES bakeries(id)` | Current working bakery |
| `recipes` | `bakery_id TEXT REFERENCES bakeries(id)` | Tenant scope |
| `recipes` | `version INTEGER NOT NULL DEFAULT 1` | Auto-incremented on save |
| `mixer_profiles` | `bakery_id TEXT REFERENCES bakeries(id)` | Tenant scope |
| `ingredient_library` | `bakery_id TEXT REFERENCES bakeries(id)` | Tenant scope |

### 3.3 Modified Constraints

`ingredient_library` UNIQUE constraint changed from `UNIQUE(user_id, name COLLATE NOCASE)` to `UNIQUE(bakery_id, name COLLATE NOCASE)`. This means ingredient names are unique per bakery, not per user.

### 3.4 Indexes

```sql
CREATE INDEX idx_bakery_members_user ON bakery_members(user_id);
CREATE INDEX idx_bakery_members_bakery ON bakery_members(bakery_id);
CREATE INDEX idx_recipes_bakery ON recipes(bakery_id);
CREATE INDEX idx_mixer_profiles_bakery ON mixer_profiles(bakery_id);
CREATE INDEX idx_ingredient_library_bakery ON ingredient_library(bakery_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);
```

### 3.5 Data Migration

On first boot with the new schema, `migrateToMultiTenant()` runs if the `bakeries` table is empty but users exist. For each existing user:

1. Create a personal bakery with name `"{name}'s Bakery"` and slug from email prefix
2. Create a `bakery_members` row with `role = 'owner'`
3. Update all user's recipes, mixers, and ingredients with the new `bakery_id`
4. Set `active_bakery_id` on the user
5. Migrate ingredient_library UNIQUE constraint from user-scoped to bakery-scoped

All wrapped in a single transaction.

---

## 4. Bakery Lifecycle

### 4.1 Creation

Bakeries are created via:
- Auto-creation on signup (see §2.1)
- Manual creation at `/bakeries/new`

Required fields: `name` (display name), `slug` (URL-safe identifier, unique). The creating user is automatically added as `owner`.

### 4.2 Settings

Owners and admins can update bakery name and slug at `/bakeries/settings`. Slug uniqueness is enforced.

### 4.3 Deletion

Only owners can delete a bakery. Deletion CASCADE-removes all bakery_members, invitations, and (via the bakery_id foreign key) domain data. This is destructive and requires confirmation.

---

## 5. Membership & Roles

### 5.1 Role Hierarchy

| Role | View data | Create/Edit | Delete | Manage members | Bakery settings | Delete bakery |
|------|-----------|-------------|--------|----------------|-----------------|---------------|
| **owner** | Yes | Yes | Yes | Yes (all) | Yes | Yes |
| **admin** | Yes | Yes | Yes | Yes (members/viewers only) | Yes | No |
| **member** | Yes | Yes | Yes | No | No | No |
| **viewer** | Yes | No | No | No | No | No |

### 5.2 Role Change Rules

- Only owners can promote to owner or admin, or demote owners/admins
- Admins can invite/remove members and viewers
- The last owner cannot be demoted or removed (prevents orphaned bakery)

### 5.3 Enforcement

Role checks use `requireRole(locals, ...allowedRoles)` from `auth.js`. This throws:
- `redirect(303, '/bakeries')` if no bakery context
- `error(403, 'Insufficient permissions')` if role is insufficient

---

## 6. Invitation System

### 6.1 Creating Invitations

Owners and admins create invitations at `/bakeries/settings/members`. An invitation specifies:
- **email** — the invitee's email address
- **role** — the role to assign on acceptance (member or admin; owner promotion is manual)
- **token** — a UUID v4, used as the invite link identifier
- **expires_at** — 7 days from creation

Constraint: `UNIQUE(bakery_id, email)` prevents duplicate invitations.

### 6.2 Invitation Link

Format: `/invite/{token}`

The link is displayed after creation for copy-paste sharing. Email delivery is not built in.

### 6.3 Acceptance Flow

```
User clicks /invite/{token}
  ├─ Not logged in → redirect to /login?invite={token}
  │   ├─ Existing user logs in → redirect back to /invite/{token}
  │   └─ New user signs up → redirect back to /invite/{token}
  ├─ Invitation expired → show "expired" message
  ├─ Already accepted → show "already accepted" message
  ├─ Already a member → show "already a member" message
  └─ Valid + logged in → show bakery name, role, "Accept" button
      └─ Accept → add as member, set active_bakery_id, redirect to /recipes
```

### 6.4 Auto-Accept on Signup

If a new user signs up with an email that has a pending invitation (and no `?invite` token in the URL), the invitation is automatically accepted. The user joins the inviting bakery instead of creating a personal one.

---

## 7. Auth Flow Integration

### 7.1 Invite Token Passthrough

The `?invite={token}` query parameter is preserved through the entire auth flow:

| Step | Mechanism |
|------|-----------|
| Login page → signup link | `signup-form.svelte` appends `?invite=` to `/signup` href |
| Signup page → login link | `login-form.svelte` appends `?invite=` to `/login` href |
| Login/signup → Google OAuth | `login-form.svelte` / `signup-form.svelte` append `?invite=` to `/login/google` href |
| Google OAuth start → callback | Stored in `oauth_invite_token` cookie (10-min expiry) |
| Post-auth redirect | All auth endpoints check for invite token and redirect to `/invite/{token}` if present |

### 7.2 Post-Auth Bakery Resolution

After successful authentication (email or OAuth), the flow is:

```
1. Check for ?invite token → redirect to /invite/{token}
2. (Signup only) Check for pending invitations by email → auto-accept
3. (Signup only) No invite → create personal bakery
4. (Login only) Check active_bakery_id → if valid member, go to /recipes
5. (Login only) No active bakery → redirect to /bakeries
```

---

## 8. Bakery Context Resolution

### 8.1 Middleware (`hooks.server.js`)

After session validation, the hook resolves bakery context:

```
1. Get user's active_bakery_id from DB
2. Verify user is still a member of that bakery (getBakeryMember)
3. Get bakery details (getBakery)
4. Set event.locals.bakery = { id, name, slug, role }
```

If any step fails, `locals.bakery` remains unset.

### 8.2 Layout Guards

| Layout Group | Auth Required | Bakery Required | Use Case |
|-------------|--------------|----------------|----------|
| `(auth)` | No | No | Login, signup |
| `(setup)` | Yes | No | Bakery selection, creation |
| `(app)` | Yes | Yes | All app functionality |

The `(app)` layout redirects to `/login` if no user, and to `/bakeries` if no bakery context.

---

## 9. Data Scoping & Isolation

### 9.1 Query Pattern

All domain data queries use `bakery_id` from `locals.bakery.id`:

| Operation | Scoping |
|-----------|---------|
| List recipes | `WHERE bakery_id = ?` |
| Get recipe | `WHERE id = ? AND bakery_id = ?` |
| Create recipe | `INSERT ... bakery_id = ?` |
| Update recipe | `WHERE id = ? AND bakery_id = ?` |
| Delete recipe | `WHERE id = ? AND bakery_id = ?` |

Same pattern applies to mixer_profiles and ingredient_library.

### 9.2 Defense in Depth

Even though routes are guarded by session + bakery context, the DB functions themselves enforce bakery scoping:

- `getRecipe(id, bakeryId)` returns null if the recipe doesn't belong to the bakery
- `updateRecipe(id, bakeryId, data)` includes `AND bakery_id = ?` in the WHERE clause
- `deleteRecipe(id, bakeryId)` includes `AND bakery_id = ?` in the WHERE clause
- Same for `updateMixerProfile`, `deleteMixerProfile`, `updateIngredientLibraryEntry`, `deleteIngredientLibraryEntry`

This means even if an attacker obtains a valid record ID from another bakery, mutations silently no-op.

### 9.3 Attribution vs Scoping

| Column | Purpose | Used for queries? |
|--------|---------|-------------------|
| `user_id` | Who created the record (audit trail) | No — for attribution only |
| `bakery_id` | Which bakery owns the record (tenant scope) | Yes — all reads/writes |

---

## 10. Route Architecture

### 10.1 New Routes

| Route | Layout | Purpose |
|-------|--------|---------|
| `/bakeries` | `(setup)` | List user's bakeries, switch active |
| `/bakeries/new` | `(setup)` | Create a new bakery |
| `/bakeries/settings` | `(app)` | Update bakery name/slug, delete bakery |
| `/bakeries/settings/members` | `(app)` | Manage members, create/cancel invitations |
| `/invite/[token]` | none | Invitation acceptance (standalone page) |

### 10.2 Modified Routes

All existing `(app)` routes changed from `locals.user.id` to `locals.bakery.id` for data queries:

| Route | Change |
|-------|--------|
| `recipes/+page.server.js` | `getRecipesByBakery(bakeryId)`, `deleteRecipe(id, bakeryId)` |
| `recipes/new/+page.server.js` | `createRecipe(userId, bakeryId, data)`, `getMixerProfiles(bakeryId)` |
| `recipes/[id]/+page.server.js` | `getRecipe(id, bakeryId)`, `updateRecipe(id, bakeryId, data)`, `syncIngredientLibrary(userId, bakeryId, ...)` |
| `recipes/[id]/production/+page.server.js` | `getRecipe(id, bakeryId)` |
| `mixers/+page.server.js` | `getMixerProfiles(bakeryId)`, `createMixerProfile(userId, bakeryId, data)`, `updateMixerProfile(id, bakeryId, data)`, `deleteMixerProfile(id, bakeryId)` |
| `inventory/+page.server.js` | `getIngredientLibrary(bakeryId)`, `createIngredientLibraryEntry(userId, bakeryId, ...)`, `updateIngredientLibraryEntry(id, bakeryId, ...)`, `deleteIngredientLibraryEntry(id, bakeryId)` |

### 10.3 Sidebar

The app sidebar shows the active bakery name in the header. The header links to `/bakeries` for switching. The settings nav item links to `/bakeries/settings`.

---

## 11. Seed Data

The seed script (`scripts/seed.mjs`) creates:

| Entity | Details |
|--------|---------|
| Demo user | `demo@example.com` / `demo123`, name "Demo Baker" |
| Demo bakery | name "Demo Bakery", slug "demo", created_by demo user |
| Bakery member | demo user as owner of Demo Bakery |
| Mixer profiles | 3 profiles (Caplain, Haussler, Bhk) scoped to Demo Bakery |
| Recipes | 4 recipes (Panettone, French Baguette, Country Sourdough Batard, Brioche) scoped to Demo Bakery |

Run: `node scripts/seed.mjs`

---

## Key Files

| File | Description |
|------|-------------|
| `src/lib/server/db.js` | Schema, migrations, data migration, all CRUD functions |
| `src/lib/server/auth.js` | Session management, `requireRole()` helper |
| `src/hooks.server.js` | Session validation + bakery context resolution |
| `src/routes/(setup)/` | Bakery selection and creation (auth-only, no bakery required) |
| `src/routes/(app)/bakeries/settings/` | Bakery settings and member management |
| `src/routes/invite/[token]/` | Invitation acceptance flow |
| `scripts/seed.mjs` | Demo data seeding with bakery support |
