# Recipe Versioning Specification

Complete specification for the recipe versioning system. Every save creates an immutable snapshot of the recipe state. The system provides a diff engine for comparing any two versions, a timeline UI with change summaries, side-by-side comparison, and server-side pagination.

## Table of Contents

1. [Snapshot System](#1-snapshot-system)
2. [Diff Engine](#2-diff-engine)
3. [Change Summaries](#3-change-summaries)
4. [Pagination](#4-pagination)
5. [Version History UI](#5-version-history-ui)
6. [Side-by-Side Comparison](#6-side-by-side-comparison)
7. [Version Restore](#7-version-restore)

---

## 1. Snapshot System

### 1.1 When Snapshots Are Created

A snapshot is created **before** every recipe update, inside the same database transaction. The sequence:

1. Read current recipe state from `recipes` table
2. Serialize to snapshot JSON via `buildRecipeSnapshot()`
3. Insert into `recipe_versions` with current `version_number`
4. Increment `recipe.version` and overwrite the recipe

This means version N's snapshot captures the state **before** the Nth edit was applied. The current (unsaved) state lives in the `recipes` table.

### 1.2 Database Schema

```sql
CREATE TABLE recipe_versions (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot TEXT NOT NULL,        -- JSON blob
  change_notes TEXT,             -- optional baker-provided note
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(recipe_id, version_number)
);
CREATE INDEX idx_recipe_versions_recipe ON recipe_versions(recipe_id);
```

### 1.3 Snapshot Shape

`buildRecipeSnapshot()` captures all mutable recipe inputs needed to reconstruct the recipe via `calculateRecipe()`:

```json
{
  "name": "Baguette Tradition",
  "yield_per_piece": 350,
  "ddt": 24,
  "dough_type": "LEAN",
  "base_ingredient_category": "FLOUR",
  "autolyse": true,
  "autolyse_duration_min": 20,
  "autolyse_overrides": { "<ingredient-uuid>": "autolyse" },
  "mix_type": "Improved Mix",
  "mixer_profile_id": null,
  "process_loss_pct": 0.03,
  "bake_loss_pct": 0.12,
  "ingredients": [
    {
      "id": "<uuid>",
      "name": "Bread Flour",
      "category": "FLOUR",
      "base_qty": 1000,
      "sort_order": 0,
      "preferment_bakers_pcts": { "<pf-uuid>": 0.5 },
      "preferment_settings": {
        "enabled": true,
        "type": "POOLISH",
        "ddt": 22,
        "fermentation_duration_min": 720
      }
    }
  ],
  "process_steps": [
    {
      "id": "<uuid>",
      "stage": "MIXING",
      "sort_order": 0,
      "title": "Mix Final Dough",
      "description": "Combine all ingredients...",
      "duration_min": 12,
      "temperature": 24,
      "mixer_speed": "1st → 2nd",
      "notes": null,
      "preferment_ingredient_id": null
    }
  ],
  "companions": [
    {
      "companion_recipe_id": "<uuid>",
      "companion_name": "Cinnamon Sugar",
      "role": "topping",
      "sort_order": 0,
      "notes": null,
      "qty": 150
    }
  ]
}
```

### 1.4 Idempotency

Before inserting a snapshot, the system checks if a version with the same `(recipe_id, version_number)` already exists. If so, the insert is skipped. This prevents duplicate snapshots on request retries.

### 1.5 Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `buildRecipeSnapshot(recipe)` | `db.js` | Serialize recipe → snapshot object |
| `snapshotBeforeUpdate(recipeId, userId, changeNotes)` | `db.js` | Create snapshot inside update transaction |
| `getRecipeVersions(recipeId, {limit, offset})` | `db.js` | Paginated version metadata (no snapshot blobs) |
| `getRecipeVersionCount(recipeId)` | `db.js` | Efficient count for pagination |
| `getRecipeVersion(recipeId, versionNumber)` | `db.js` | Full version record including snapshot |

---

## 2. Diff Engine

File: `src/lib/version-diff.js`

### 2.1 Core Principle: UUID-Based Matching

All entities (ingredients, process steps, companions) are matched by their stable UUID, never by name. This correctly handles renames — "WW Flour" → "Whole Wheat Flour" is detected as a rename, not a removal + addition.

### 2.2 `diffVersions(snapshotA, snapshotB)`

Accepts two parsed snapshot objects (older A, newer B). Returns an array of change objects.

#### Recipe-Level Parameter Changes

Compared fields:

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Recipe name |
| `yield_per_piece` | number | Grams |
| `ddt` | number | °C |
| `dough_type` | string | LEAN, ENRICHED, etc. |
| `autolyse` | boolean | |
| `autolyse_duration_min` | number | Minutes |
| `process_loss_pct` | number | 0–1 |
| `bake_loss_pct` | number | 0–1 |
| `mix_type` | string | Improved Mix, Short Mix, etc. |
| `mixer_profile_id` | string/null | UUID |
| `base_ingredient_category` | string | FLOUR, LIQUID, etc. |

Simple `!==` comparison. Produces `{ type: 'param_changed', field, old, new }`.

**`autolyse_overrides`** is compared separately via `JSON.stringify()` since it's an object (sparse map of ingredient overrides). Reference equality (`!==`) would always show a diff.

#### Ingredient Changes

Matched by `ingredient.id` (UUID).

| Change Type | Detection |
|-------------|-----------|
| `ingredient_added` | UUID in B but not A |
| `ingredient_removed` | UUID in A but not B |
| `ingredient_renamed` | Same UUID, different `name` |
| `ingredient_modified` | Same UUID, field value changed |

Modified fields tracked per-ingredient:

- `base_qty` — grams
- `category` — FLOUR, LIQUID, etc.
- `sort_order` — display position
- `preferment_pct_<pfId>` — Baker's % for a specific pre-ferment (from `preferment_bakers_pcts` map)
- `pf_type` — pre-ferment type (POOLISH, LEVAIN, etc.)
- `pf_ddt` — pre-ferment DDT
- `pf_fermentation_duration_min` — pre-ferment fermentation time

#### Process Step Changes

Matched by `step.id` (UUID).

| Change Type | Detection |
|-------------|-----------|
| `step_added` | UUID in B but not A |
| `step_removed` | UUID in A but not B |
| `step_modified` | Same UUID, field value changed |

Modified fields: `title`, `stage`, `duration_min`, `temperature`, `sort_order`, `preferment_ingredient_id`.

#### Companion Changes

Matched by `companion_recipe_id`.

| Change Type | Detection |
|-------------|-----------|
| `companion_added` | ID in B but not A |
| `companion_removed` | ID in A but not B |
| `companion_modified` | Same ID, field value changed |

Modified fields: `role`, `qty`, `sort_order`, `notes`.

### 2.3 Change Object Shapes

```js
// Recipe param
{ type: 'param_changed', field: 'ddt', old: 24, new: 26 }

// Ingredient added
{ type: 'ingredient_added', ingredient_id: '<uuid>', name: 'Salt', category: 'SEASONING', base_qty: 20 }

// Ingredient removed
{ type: 'ingredient_removed', ingredient_id: '<uuid>', name: 'Salt', category: 'SEASONING', base_qty: 20 }

// Ingredient renamed
{ type: 'ingredient_renamed', ingredient_id: '<uuid>', old_name: 'WW Flour', new_name: 'Whole Wheat Flour' }

// Ingredient modified
{ type: 'ingredient_modified', ingredient_id: '<uuid>', name: 'Bread Flour', field: 'base_qty', old: 1000, new: 1200 }

// PF baker's % changed
{ type: 'ingredient_modified', ingredient_id: '<uuid>', name: 'Bread Flour', field: 'preferment_pct_<pfId>', old: 0.5, new: 0.6 }

// PF settings changed
{ type: 'ingredient_modified', ingredient_id: '<uuid>', name: 'Poolish', field: 'pf_type', old: 'CUSTOM', new: 'POOLISH' }

// Step added/removed/modified
{ type: 'step_added', step_id: '<uuid>', name: 'Mix Final Dough' }
{ type: 'step_modified', step_id: '<uuid>', name: 'Mix Final Dough', field: 'duration_min', old: 10, new: 12 }

// Companion added/removed/modified
{ type: 'companion_added', companion_recipe_id: '<uuid>', name: 'Glaze', role: 'topping' }
{ type: 'companion_modified', companion_recipe_id: '<uuid>', name: 'Glaze', field: 'qty', old: 100, new: 150 }
```

---

## 3. Change Summaries

`summarizeChanges(changes)` converts a change list into a human-readable one-liner for the version timeline.

**Priority order** (first match wins for each group):

1. Recipe name rename: `Renamed "Old" → "New"`
2. Recipe params: `DDT 24°C → 26°C`, `Yield 350g → 400g`, `Enabled autolyse`, etc.
3. Ingredients added/removed: `Added Salt`, `Removed Malt`
4. Ingredient renames: `Renamed WW Flour → Whole Wheat Flour`
5. Quantity changes: `Bread Flour: 1000g → 1200g`
6. PF settings: `Poolish type: CUSTOM → POOLISH`, `Poolish DDT: inherit°C → 22°C`
7. Step changes: `Added step: Mix Final Dough`, `Removed step: Fold`, `Updated step: Autolyse Rest`
8. Companion changes: `Added companion: Glaze`, `Updated companion: Glaze`
9. Fallback (PF% or sort_order only): `Updated pre-ferment percentages`, `Reordered ingredients`
10. Empty fallback: `Minor changes`

Parts are joined with `;`.

**Mixer UUID resolution:** The server wraps `summarizeChanges` in `resolveChangeSummary()` which replaces mixer UUIDs with human-readable mixer names before generating the summary.

---

## 4. Pagination

Server-side pagination using SQLite `LIMIT ? OFFSET ?`.

| Setting | Value |
|---------|-------|
| Page size | 10 versions per page |
| URL param | `?page=N` (default: 1) |
| Sort order | Newest first (`ORDER BY version_number DESC`) |

### Change Summary Computation Per-Page

The server computes change summaries for each version on the current page:

1. **Page 1, current version:** Diff `newest_snapshot` → `current_recipe` (from `recipes` table)
2. **Adjacent versions on page:** Diff `versions[i+1]` → `versions[i]` (older → newer)
3. **Oldest version on page:** If `version_number > 1`, fetch `version_number - 1` from DB and diff against it

This ensures every version on every page has a meaningful change summary, even at page boundaries.

### Data Returned

```js
{
  recipe,              // current recipe from recipes table
  versions,            // array of version metadata (no snapshots)
  changeSummaries,     // { [version_number]: "summary string" }
  pagination: {
    page,              // current page (1-based)
    pageSize,          // 10
    totalCount,        // total versions across all pages
    totalPages,        // ceil(totalCount / pageSize)
  }
}
```

---

## 5. Version History UI

File: `src/routes/(app)/recipes/[id]/versions/+page.svelte`

### Timeline View

A vertical timeline with version cards:

- **Current version** (page 1 only): Primary-colored circle, "Latest" badge, last save timestamp, change summary
- **Historical versions**: Bordered circle, version number, creator name, timestamp, optional change notes (italic), change summary
- **Empty state**: Clock icon with "No version history yet" message

Each version card has a **Compare** button for side-by-side selection.

### Compare Selection Flow

1. Click "Compare" on first version → button shows "Selected"
2. Click "Compare" on second version → navigates to `?compare=A,B` (A < B)
3. Dashed prompt bar shown between selections: "Select a second version to compare"

### Pagination Controls

Shown when `totalPages > 1`:

- **Newer** button (← chevron) — navigates to `?page={page - 1}`
- **Page X of Y** — center text
- **Older** button (→ chevron) — navigates to `?page={page + 1}`

---

## 6. Side-by-Side Comparison

Activated by `?compare=A,B` URL parameter.

### Layout

Two-column grid (stacks on mobile):

**Each column shows:**

1. **Recipe params** — grid of label/value pairs, yellow highlight on changed values
2. **Ingredients** — list with colored category dots, qty in grams, yellow bg for modified, red bg + strikethrough for removed
3. **Process steps** (if any) — sorted by sort_order, stage badge + title, duration + temperature, same highlighting
4. **Companions** (if any) — name, qty, role, same highlighting

**Above the columns:**

- Change summary card showing all detected changes with semantic badges:
  - Green "Added" / Red "Removed" / Yellow "Renamed" badges for ingredients
  - "Recipe" badge for param changes
  - "Step" badge for process step changes
  - "Companion" badge for companion changes
  - Red strikethrough for old values, green for new values

### Comparing Current vs Historical

The current recipe state (from `recipes` table) can be compared against any historical version. It's serialized on-the-fly via `buildRecipeSnapshot()` and treated as version N with `isCurrent: true`.

### Param Rows Displayed

| Field | Shown When |
|-------|------------|
| yield_per_piece | Always |
| ddt | Always |
| dough_type | Either version has one |
| mix_type | Always |
| mixer_profile_id | Either version has one |
| process_loss_pct | Either version has one |
| bake_loss_pct | Either version has one |
| autolyse | Either version has autolyse enabled |
| autolyse_duration_min | Either version has autolyse enabled |
| autolyse_overrides | Autolyse enabled AND overrides exist in either |

Object values (autolyse_overrides) use `JSON.stringify()` for change detection, not reference equality.

---

## 7. Version Restore

Restore reverts a recipe to a previous version's state. It is **non-destructive** — it creates a new version rather than deleting history.

### 7.1 How It Works

1. Load the target version's snapshot from `recipe_versions`
2. Pass the parsed snapshot to `updateRecipe()` — the same save pipeline used by the recipe builder
3. `updateRecipe()` automatically snapshots the current state before overwriting (preserving history) and increments the version counter
4. An auto-generated change note is saved: `"Restored to v{N}"`
5. After restore, the user is redirected to the recipe builder (`/recipes/{id}`)

### 7.2 Server Action

The `restore` form action lives in `versions/+page.server.js`. It accepts a `version_number` from form data, loads the snapshot, and calls `updateRecipe()`. Version limits from the billing tier are respected (same pattern as the recipe save action).

### 7.3 Permissions

- Requires `owner`, `admin`, or `member` role (enforced via `requireRole()`)
- `viewer` role cannot see the Restore button

### 7.4 UI

- Each historical version card shows a **Restore** button (next to Compare)
- Clicking Restore shows an inline confirmation: "Restore this version?" with **Confirm** / **Cancel** buttons
- The Confirm button submits a form to `?/restore` with `use:enhance` for progressive enhancement
- During submission, the button shows "Restoring..." and is disabled

### 7.5 History After Restore

If a recipe is at v5 and the user restores v2:

1. Current v5 state is snapshotted as v5 in `recipe_versions`
2. v2's snapshot overwrites the recipe in the `recipes` table
3. Recipe version becomes v6 with change note "Restored to v2"
4. All versions v1–v5 remain intact in history

---

## Implementation Files

| File | Role |
|------|------|
| `src/lib/server/db.js` | Schema, snapshot creation, version CRUD, pagination queries |
| `src/lib/version-diff.js` | `diffVersions()`, `summarizeChanges()` |
| `src/routes/(app)/recipes/[id]/versions/+page.server.js` | Server load: pagination, change summaries, comparison data |
| `src/routes/(app)/recipes/[id]/versions/+page.svelte` | Timeline UI, comparison UI, pagination controls |
| `src/routes/(app)/recipes/[id]/+page.svelte` | Version badge display, save triggers versioning |
| `src/routes/(app)/recipes/[id]/+page.server.js` | Save action calls `updateRecipe()` which snapshots |
