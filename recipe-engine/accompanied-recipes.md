# §16 Accompanied Recipes — Implementation Guide

> Comprehensive specification for adding accompanied recipe support to the Recipe Engine.
> This document supplements the foundation spec (`recipemanagement.md`) and serves as the development guide for Claude Code implementation.

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | **Done** | Non-PF companions (glazes, fillings, garnishes) with qty, BP%, versioning |
| Phase 2 | **Done** | Per-PF process steps with `PF_MIX`/`PF_FEED`/`PF_FERMENT` stages |
| Phase 3 | **Done** | Reusable sub-recipe library with template linking, stale detection, pull/acknowledge |

## Table of Contents

1. [Context & Motivation](#1-context--motivation)
2. [Architecture Decision: §5 Stays, §16 Layers On Top](#2-architecture-decision-5-stays-16-layers-on-top)
3. [Phase 1 — Non-PF Companions (Glazes, Fillings, Garnishes)](#3-phase-1--non-pf-companions) — **Implemented**
4. [Phase 2 — Per-Stage Process Modeling](#4-phase-2--per-stage-process-modeling) — **Implemented**
5. [Phase 3 — Reusable Sub-Recipe Library](#5-phase-3--reusable-sub-recipe-library) — **Implemented**
6. [Data Model Changes](#6-data-model-changes)
7. [Calculation Engine Impact](#7-calculation-engine-impact)
8. [UI Changes](#8-ui-changes)
9. [Cross-Section Impact Matrix](#9-cross-section-impact-matrix)
10. [Migration Strategy](#10-migration-strategy)
11. [Test Plan](#11-test-plan)
12. [Reference Formulas](#12-reference-formulas)

---

## 1. Context & Motivation

Real-world bakery formulas are rarely a single recipe. A Pan d'Oro has 5 formulas (Italian Levain, First Dough, Second Dough, Third Dough, Final Dough). A batch of sweet rolls requires Cinnamon Sugar and Sticky Bun Glaze alongside the dough. A Columba di Pasqua needs an Italian Levain, a staged First Dough build, and a Hazelnut Glaze.

These "accompanied recipes" fall into three categories:

| Category                     | Examples                                                                   | Relationship to Main Dough                                                      |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Finishing components**     | Sticky Bun Glaze, Hazelnut Glaze, flat icing, fondant, powdered sugar dust | Applied after baking. No calculation relationship to the dough formula.         |
| **Filling components**       | Cinnamon Sugar, pastry cream, frangipane, almond paste                     | Incorporated during makeup. No calculation relationship to the dough formula.   |
| **Multi-stage dough builds** | Italian Levain → First Dough → Final Dough                                 | PREFERMENT ingredients in the engine. §5 already handles the calculation chain. |

The first two categories have no existing support. The third is already handled by §5's preferment system — but lacks richer process modeling (per-stage steps, parallel scheduling, reuse).

### Source Material

All examples sourced from Suas, _Advanced Bread and Pastry_, Chapter 9: Viennoiserie.

---

## 2. Architecture Decision: §5 Stays, §16 Layers On Top

### What §5 Already Handles

Multi-stage dough builds (Italian Levain, First Dough, Second Dough, etc.) are **already preferments** from the calculation engine's perspective:

- They are added as PREFERMENT-category ingredients in the final dough
- Their contributions decompose into the total formula via `preferment_bakers_pcts`
- §5's topological sort resolves PF → PF → final dough dependency chains
- A "First Dough" with eggs, sugar, and butter works exactly like a simple poolish — the engine doesn't care how complex the preferment's internal formula is

**The calculation engine does not need to change.**

### What §5 Doesn't Handle

| Gap                         | Description                                                                                                                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Non-PF companions**       | Glazes, fillings, and garnishes don't contribute to total formula flour or hydration. They are separate preparations that need to be produced alongside the main recipe, scaled proportionally.                                                                      |
| **Per-stage process steps** | §5 stores `preferment_settings` (type, DDT, fermentation duration) but doesn't model a full process sequence per preferment. An Italian Levain's "feed every 4 hours at 29°C" or a First Dough's "mix 1st speed only, ferment 2h at 29°C" need multi-step processes. |
| **Production scheduling**   | §9's timeline would need to walk the PF dependency DAG to find the critical path. First Dough and Second Dough can run in parallel, but Third Dough blocks on both.                                                                                                  |
| **Independent reuse**       | PFs are currently embedded inline per recipe. The same Italian Levain formula used in both Panettone and Pan d'Oro is duplicated — there's no shared reference.                                                                                                      |

### Decision

**§5 stays for calculation.** §16 adds:

- Phase 1: Non-PF companions (glazes, fillings)
- Phase 2: Per-stage process modeling for PFs
- Phase 3: Reusable sub-recipe library

Each phase is independently shippable.

---

## 3. Phase 1 — Non-PF Companions (Implemented)

### Goal

Allow a recipe to link to companion preparations (glazes, fillings, garnishes) that are produced alongside the main dough but don't participate in the dough calculation (§4/§5).

### What Was Built

- Baker links existing bakery recipes as companions with a role and qty (grams)
- Companions are managed in the **Accompanied Recipes card** — separate from the Ingredients table, per BBGA convention (companions are not dough ingredients and don't participate in the dough formula's baker's percentages)
- Each companion row has: name (linked), editable qty (grams), role selector, notes, remove button
- The companion's internal formula is shown as an inline summary (ingredient names, qty, internal BP%, total weight)
- The Ingredients table contains only dough ingredients — its totals reflect the dough formula only
- On the production page, companion ingredient quantities are scaled proportionally based on the qty defined in the parent, with loss adjustment applied from the companion recipe's own `process_loss_pct` and `bake_loss_pct` (raw qty and loss factors shown inline when non-zero)
- Companion links are tracked in version snapshots; the versions comparison UI shows adds/removes/modifications

### Data Model (as implemented)

```sql
CREATE TABLE IF NOT EXISTS recipe_companions (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  companion_recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'other',  -- 'filling', 'glaze', 'garnish', 'other'
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  qty REAL NOT NULL DEFAULT 0,         -- grams of companion needed for this recipe
  UNIQUE(recipe_id, companion_recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_companions_recipe ON recipe_companions(recipe_id);
```

**Key difference from original spec:** Instead of a `scaling_ratio`, companions use a flat `qty` in grams — the baker says "I need 150g of Cinnamon Sugar" directly, similar to how preferment quantities work. This is simpler and matches the baker's mental model.

### Companion Roles

| Role      | Description                                            | Applied When    |
| --------- | ------------------------------------------------------ | --------------- |
| `filling` | Incorporated during makeup (inside the dough)          | Shaping stage   |
| `glaze`   | Applied before or after baking                         | Finishing stage |
| `garnish` | Decorative topping (pearl sugar, powdered sugar, etc.) | Finishing stage |
| `other`   | Catch-all for unusual companions                       | Varies          |

### Implementation Details

**Server (`+page.server.js`):**
- `load()` fetches `companionDetails` for each companion — loads the full recipe and runs `calculateRecipe()` to get ingredient breakdown for the inline summary
- `save` action persists companions via delete+reinsert pattern (same as process steps)
- Companion recipes must belong to the same bakery (enforced on save)

**Recipe builder UI (`+page.svelte`):**
- Accompanied Recipes card: each companion has name (linked), editable qty (grams), role selector, notes, remove button, plus inline ingredient summary from the companion's own formula
- Companions do NOT appear in the Ingredients table (per BBGA convention — they are separate preparations, not dough ingredients)
- Add companion via dropdown of bakery recipes (excludes self and already-linked)
- `buildRecipeData()` serializes companions with `qty`

**Versioning (`versions/+page.svelte`):**
- Companion changes shown with colored badges: green (added), red (removed), outline (modified)
- Side-by-side comparison highlights companion differences

### Constraints

- No self-links (enforced in `updateRecipe()`)
- Companion must belong to the same bakery (verified on save)
- Deleting a parent cascades to delete links (not the companion recipe)
- A recipe can be a companion to multiple parents

---

## 4. Phase 2 — Per-Stage Process Modeling (Implemented)

### Goal

Enable richer process documentation for preferments and multi-stage builds — full process step sequences per PF, not just DDT and fermentation duration.

### What Was Built

**Option A was chosen** — a nullable FK on the existing `process_steps` table:

```sql
ALTER TABLE process_steps ADD COLUMN preferment_ingredient_id TEXT
  REFERENCES recipe_ingredients(id) ON DELETE CASCADE;
```

- `preferment_ingredient_id = NULL` → step belongs to the main recipe
- `preferment_ingredient_id = 'xyz'` → step belongs to that PF's build process
- Deleting a PF ingredient cascades to delete its process steps

### New Process Stages

Added to `PROCESS_STAGES` in `src/lib/process-steps.js`:

```js
'PF_MIX'     // Mixing the preferment build
'PF_FEED'    // Feeding cycle (levain refreshment)
'PF_FERMENT' // Preferment fermentation rest
```

### PF Process Step Suggestion

New export `suggestPfProcessSteps(pfType, pfName, pfIngredientId)` generates type-appropriate steps:

| PF Type        | Suggested Steps                                                |
| -------------- | -------------------------------------------------------------- |
| POOLISH        | PF_MIX → PF_FERMENT (12–16h, 21°C)                           |
| BIGA           | PF_MIX → PF_FERMENT (12–16h, 18°C)                           |
| LEVAIN         | PF_MIX → PF_FEED (every 4h, 29°C) → PF_FERMENT (8–12h, 29°C) |
| PATE_FERMENTEE | PF_MIX → PF_FERMENT (1–4h, 21°C)                             |
| SPONGE         | PF_MIX → PF_FERMENT (12–16h, 21°C)                           |
| CUSTOM         | PF_MIX → PF_FERMENT                                           |

### Recipe Builder UI

- PF steps appear inside each PF card (after PF settings, before card close)
- Compact step list: stage select, title, description, duration, temperature, remove button
- "Suggest Steps" button calls `suggestPfProcessSteps()` and appends to `processSteps`
- "Add Step" button adds an empty step with `preferment_ingredient_id` set
- Main Process Steps section filters to `!preferment_ingredient_id` only

### Production Page

- PF steps are grouped under PF name + type badge headers
- Shown in a "Pre-ferment Build Steps" card before the main Process Steps card
- Only rendered if any PF steps exist

### Versioning

- `preferment_ingredient_id` included in step snapshots via `buildRecipeSnapshot()`
- Step diffs track changes to `preferment_ingredient_id`

### Also Implemented: Base Ingredient Category

The engine previously hardcoded `FLOUR` as the baker's % denominator. Non-flour recipes (Cinnamon Sugar, glazes) got 0% for everything. Added `base_ingredient_category` to solve this:

- **Database**: `recipes.base_ingredient_category TEXT NOT NULL DEFAULT 'FLOUR'`
- **Engine**: Uses `recipe.base_ingredient_category` for all base/BP% calculations
- **UI**: Auto-detect warning when no ingredient matches current base; dropdown to override
- **Versioning**: Included in snapshots and diffs
- **Backward compatible**: Defaults to `FLOUR`

### Also Implemented: Ingredients Table BP% Improvements

- **PREFERMENT rows** now show their ratio (`pf.base_qty / total_base_flour`) as BP% instead of the always-zero `overall_bakers_pct`

### Production Timeline Integration (§9 — future)

When §9 is implemented, the PF process steps feed into the production timeline:

1. Walk the PF dependency DAG (already implicit in `preferment_bakers_pcts`)
2. For each PF, compute start time = main mix time − fermentation duration
3. PFs that don't depend on each other can be scheduled in parallel
4. PFs that depend on other PFs must be sequenced

---

## 5. Phase 3 — Reusable Sub-Recipe Library (Implemented)

### Goal

Allow bakers to define sub-recipes once and reference them from multiple parent recipes, rather than duplicating formulas inline.

### Problem

If Bakery X uses the same Italian Levain formula for Panettone, Pan d'Oro, and Sourdough Croissant, the levain is defined separately in each recipe. Updating the levain (e.g. changing hydration from 50% to 60%) requires editing 3 recipes individually.

### What Was Built

A **template library** where bakers define formulas once and link them from multiple parent recipes. Templates use **copy-on-link** with explicit update pull — no auto-propagation.

A template is a thin metadata row (`recipe_templates`) pointing to a normal recipe that holds the formula. The backing recipe is edited via the existing `/recipes/[id]` builder — no new recipe editor needed.

### Data Model

```sql
CREATE TABLE IF NOT EXISTS recipe_templates (
  id TEXT PRIMARY KEY,
  bakery_id TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'preferment',
    -- 'preferment', 'intermediate_dough', 'filling', 'glaze', 'garnish', 'other'
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recipe_templates_bakery ON recipe_templates(bakery_id);
CREATE INDEX IF NOT EXISTS idx_recipe_templates_recipe ON recipe_templates(recipe_id);

ALTER TABLE preferment_settings ADD COLUMN source_template_id TEXT
  REFERENCES recipe_templates(id) ON DELETE SET NULL;
ALTER TABLE preferment_settings ADD COLUMN source_version INTEGER;

ALTER TABLE recipe_companions ADD COLUMN source_template_id TEXT
  REFERENCES recipe_templates(id) ON DELETE SET NULL;
ALTER TABLE recipe_companions ADD COLUMN source_version INTEGER;
```

### Template Types

| Type | Use Case | Links As |
|------|----------|----------|
| `preferment` | Poolish, Levain, Biga, Pate Fermentee | PF ingredient (formula copied) |
| `intermediate_dough` | First Dough, Detrempe | PF ingredient (formula copied) |
| `filling` | Pastry Cream, Frangipane | Companion (recipe linked) |
| `glaze` | Apricot Glaze, Egg Wash | Companion (recipe linked) |
| `garnish` | Streusel, Pearl Sugar | Companion (recipe linked) |
| `other` | Catch-all | Companion (recipe linked) |

### How Linking Works

**PF templates (copy-on-link):**
1. Baker opens a recipe, selects "From Library..." on a PF ingredient card
2. Template's backing recipe is loaded; its ingredient composition is copied into the PF's `preferment_bakers_pcts`, its `preferment_settings` (type, DDT, fermentation duration) and PF process steps are copied
3. `source_template_id` and `source_version` are set on the PF's `preferment_settings`
4. A "From: Italian Levain" badge appears on the PF card

**Companion templates (link with tracking):**
1. Baker opens the companion add dropdown — template library items appear in a separate "Template Library" section
2. Selecting a template links the backing recipe as a companion, with `source_template_id` and `source_version` set
3. A "From: Pastry Cream" badge appears on the companion row

### Stale Detection & Update Pull

Uses §12 versioning. When a template's backing recipe version exceeds the `source_version` stored on the link, the link is "stale."

**Detection:** `getStaleTemplateLinks(recipeId, bakeryId)` joins `preferment_settings`/`recipe_companions` against `recipe_templates` and `recipes` to find links where `recipe.version > source_version`.

**UI — prominent amber alert banners** (not subtle badges):
- Warning triangle icon + message: *"{Template Name} has been updated (v1 → v2)"*
- **"Review changes"** link → opens the template recipe's version comparison page (`/recipes/{id}/versions?compare={source_version},{current_version}`) so the baker can see exactly what changed
- **PF links:** "Pull update" button — fetches the latest template formula via `pullTemplate` action and re-copies it into the PF ingredient (baker's pcts, settings, process steps), bumping `source_version`
- **Companion links:** "Acknowledge" button — bumps `source_version` client-side to mark the link as current. Since the companion is a live link to the recipe, the baker already sees the latest formula; acknowledge just clears the stale indicator after reviewing

### Template Library UI

**Route: `/(app)/templates/`**
- Search input, card grid with empty state
- Each card: template name, type badge (color-coded), "Used in X recipes" count, "Edit formula" link → `/recipes/{template.recipe_id}`, version number, updated date
- Delete overlay with confirmation (ON DELETE SET NULL cleans FKs; linked recipes keep local copies and show "Local copy" badge)

**Route: `/(app)/templates/new/`**
- Two modes: "Create new" (name + type → creates a new recipe + template, redirects to recipe builder) and "Promote existing" (pick a recipe + type → creates template pointing to it)

**Recipe list page:** Recipes that back a template show a blue "Template" badge on the card.

**Sidebar:** "Templates" nav item with layers icon between Recipes and Inventory.

### DB Functions

| Function | Purpose |
|----------|---------|
| `createTemplate(bakeryId, name, templateType, recipeId)` | Insert template row, return id |
| `getTemplatesByBakery(bakeryId)` | List with recipe name, version, used-in counts (PF + companion) |
| `getTemplate(templateId, bakeryId)` | Single template with bakery scoping |
| `updateTemplate(templateId, bakeryId, {name?, template_type?})` | Update metadata only |
| `deleteTemplate(templateId, bakeryId)` | Delete template row (ON DELETE SET NULL cleans FKs) |
| `promoteRecipeToTemplate(bakeryId, recipeId, templateType)` | Create template from existing recipe |
| `getTemplateUsages(templateId)` | All recipes referencing this template (PF + companion links) |
| `getPfTemplates(bakeryId)` | Templates with type `preferment` or `intermediate_dough` |
| `getCompanionTemplates(bakeryId)` | Templates with type `filling`, `glaze`, `garnish`, `other` |
| `getStaleTemplateLinks(recipeId, bakeryId)` | PF/companion links where template recipe version > source_version |
| `getTemplateForRecipe(recipeId)` | Check if a recipe backs a template |

### Extended Existing Functions

- **`updateRecipe()`**: persists `source_template_id` and `source_version` on both `preferment_settings` INSERT and `recipe_companions` INSERT during the delete+reinsert cycle
- **`getRecipe()`**: already uses `SELECT ps.*` and `SELECT rc.*` — new columns included automatically
- **`deleteRecipe()`**: also deletes from `recipe_templates WHERE recipe_id = ?` (backing recipe deleted = template deleted)
- **`deleteBakery()`**: explicit template deletion for safety (CASCADE from bakeries FK exists but belt-and-suspenders)
- **`buildRecipeSnapshot()`**: includes `source_template_id` and `source_version` in both PF settings and companion snapshots

### Versioning Integration

`src/lib/version-diff.js` extended:
- PF settings diff fields include `source_template_id`, `source_version`
- Companion diff fields include `source_template_id`, `source_version`
- `summarizeChanges()` generates human-readable lines for template link/unlink/sync events (e.g. "Linked Poolish to template", "Synced Poolish from template v2", "Unlinked Poolish from template")

### Constraints

- Templates are scoped to a bakery — other bakeries cannot see them
- Deleting a template sets `source_template_id = NULL` on all linked recipes (they keep their local copy, shown with "Local copy" badge)
- Template versioning uses §12 (recipe versions on the backing recipe)
- Viewer role cannot create/edit/delete templates (`requireRole()` enforced)
- A recipe can only back one template (enforced by unique `recipe_id` in `recipe_templates`)

### Implementation Files

| File | Role |
|------|------|
| `src/lib/server/db.js` | Schema, migrations, template CRUD, stale detection, extended updateRecipe/deleteRecipe/buildRecipeSnapshot |
| `src/routes/(app)/templates/+page.server.js` | Template list load + delete action |
| `src/routes/(app)/templates/+page.svelte` | Template library list UI |
| `src/routes/(app)/templates/new/+page.server.js` | Create/promote server actions |
| `src/routes/(app)/templates/new/+page.svelte` | Create template form |
| `src/routes/(app)/recipes/[id]/+page.server.js` | Load pfTemplates, companionTemplates, staleLinks; pullTemplate action |
| `src/routes/(app)/recipes/[id]/+page.svelte` | "From Library" picker, stale banners, pull/acknowledge, source tracking in buildRecipeData |
| `src/lib/version-diff.js` | Template source tracking in diffs and change summaries |
| `src/lib/components/app-sidebar.svelte` | Templates nav item with layers icon |
| `src/routes/(app)/+layout.svelte` | Templates breadcrumb label |
| `src/routes/(app)/recipes/+page.svelte` | "Template" badge on recipe cards |
| `src/routes/(app)/recipes/+page.server.js` | Template flag lookup for recipe list |

---

## 6. Data Model Changes — Summary

### Phase 1 (implemented — new table)

```sql
CREATE TABLE IF NOT EXISTS recipe_companions (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  companion_recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'other',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  qty REAL NOT NULL DEFAULT 0,
  UNIQUE(recipe_id, companion_recipe_id)
);
```

Migration for `qty` column: `ALTER TABLE recipe_companions ADD COLUMN qty REAL NOT NULL DEFAULT 0`

### Phase 2 (implemented — alter existing tables)

```sql
ALTER TABLE process_steps ADD COLUMN preferment_ingredient_id TEXT
  REFERENCES recipe_ingredients(id) ON DELETE CASCADE;

ALTER TABLE recipes ADD COLUMN base_ingredient_category TEXT NOT NULL DEFAULT 'FLOUR';
```

New PROCESS_STAGES: `PF_MIX`, `PF_FEED`, `PF_FERMENT`

### Phase 3 (implemented — new table + alter existing)

```sql
CREATE TABLE IF NOT EXISTS recipe_templates (
  id TEXT PRIMARY KEY,
  bakery_id TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'preferment',
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recipe_templates_bakery ON recipe_templates(bakery_id);
CREATE INDEX IF NOT EXISTS idx_recipe_templates_recipe ON recipe_templates(recipe_id);

ALTER TABLE preferment_settings ADD COLUMN source_template_id TEXT
  REFERENCES recipe_templates(id) ON DELETE SET NULL;
ALTER TABLE preferment_settings ADD COLUMN source_version INTEGER;

ALTER TABLE recipe_companions ADD COLUMN source_template_id TEXT
  REFERENCES recipe_templates(id) ON DELETE SET NULL;
ALTER TABLE recipe_companions ADD COLUMN source_version INTEGER;
```

All schema changes use the existing migration pattern in `db.js` (try/catch ALTER TABLE).

---

## 7. Calculation Engine Impact

### Phase 1: Minimal

Companion recipes don't participate in §4/§5 calculations. They have their own independent calculation — same engine, separate recipe instance. The parent recipe's `+page.server.js` loads each companion's calculated data for the inline summary display.

**Change made:** `engine.js` now uses `recipe.base_ingredient_category` (defaulting to `'FLOUR'`) instead of hardcoded `'FLOUR'` for all baker's % denominators, hydration, and PF ratio calculations. This allows non-flour recipes (toppings, glazes) to compute meaningful percentages.

### Phase 2: Minimal

PF process steps are documentation only — they don't affect quantities. The only change is `suggestPfProcessSteps()` in `process-steps.js` which generates PF-specific steps.

### Phase 3: None

Templates are a UI/management layer. The calculation engine sees the same data as before — `source_template_id` and `source_version` are metadata that don't affect calculations.

### Total Formula Resolution (existing — no change needed)

§5's topological sort already resolves multi-stage builds. The engine processes PFs in dependency order and the math works out.

---

## 8. UI Changes

### Phase 1: Recipe Builder (Implemented)

**Accompanied Recipes card** — dedicated section for companion management (separate from Ingredients table per BBGA convention):
- Each companion row: name (linked), editable qty (grams), role selector, notes, remove button
- Inline ingredient summary from the companion's own formula (name, qty, internal BP%, total weight)
- Add companion via dropdown of bakery recipes (excludes self and already-linked)
- Companions do NOT appear in the Ingredients table — the dough formula stays pure

**Versioning** — versions comparison page shows:
- Companion additions (green badge), removals (red badge), modifications (outline badge with field diff)
- Side-by-side comparison with change highlighting

**Dough type selector** — shadcn Select with grouped headings (Bread / Pastry / Component). Confirm dialog when changing type with existing process steps.

### Phase 2: PF Process Steps in Recipe Builder (Implemented)

PF steps appear inside each PF card after the settings row:
- Compact step list: stage select, title, description, duration, temperature, remove
- "Suggest Steps" and "Add Step" buttons
- Main Process Steps section shows only `!preferment_ingredient_id` steps

Production page groups PF steps under PF name + type badge headers.

### Phase 3: Template Library & Linking (Implemented)

**Template Library (`/(app)/templates/`):**
- Card grid with search, type badges (color-coded), used-in counts, "Edit formula" links
- Create new or promote existing recipe via `/(app)/templates/new/`
- Delete with confirmation overlay

**Recipe Builder — PF Template Linking:**
- "From Library..." dropdown on each PF ingredient card lists available PF/intermediate dough templates
- Selecting a template copies the formula (baker's pcts, settings, process steps) and sets source tracking
- "From: {name}" blue badge on linked PFs
- Amber alert banner when stale: warning icon, version range, "Review changes" link to version comparison, "Pull update" button

**Recipe Builder — Companion Template Linking:**
- Companion add dropdown has "Template Library" optgroup above "Bakery Recipes"
- Selecting a template links the backing recipe with source tracking
- "From: {name}" blue badge on linked companions
- Amber alert banner when stale: warning icon, version range, "Review changes" link to version comparison, "Acknowledge" button

**Recipe List:** Blue "Template" badge on recipe cards that back a template.

**Sidebar:** "Templates" nav item with layers icon.

---

## 9. Cross-Section Impact Matrix

| Section               | Phase 1 (Done)                       | Phase 2 (Done)                                                    | Phase 3 (Done)                |
| --------------------- | ------------------------------------ | ----------------------------------------------------------------- | ----------------------------- |
| §3 Data Model         | New `recipe_companions` table + qty  | Alter `process_steps`; alter `recipes` (base_ingredient_category) | New `recipe_templates` table + source tracking columns |
| §4 Calculation Engine | None (companions are separate)       | Engine uses `base_ingredient_category`; PF ratio as BP%           | None                          |
| §5 Pre-ferment System | None                                 | PF process step generation (`suggestPfProcessSteps`)              | Template source tracking on PF settings |
| §8 Autolyse           | None                                 | None                                                              | None                          |
| §9 Timeline (future)  | Companion production scheduling      | PF DAG critical path                                              | Template update notifications |
| §10 Process Steps     | None                                 | New PF stages, `preferment_ingredient_id` FK                      | PF steps copied on template link |
| §11 Loss/Waste        | Per-companion loss tracking (done)    | None                                                              | None                          |
| §12 Versioning        | Companion links in snapshots + diffs | PF steps in snapshots; `base_ingredient_category` in diffs        | Template source version in snapshots + diffs; stale detection |
| §15 Dough Type        | None                                 | Component types (TOPPING, GLAZE, FILLING, SAUCE); shadcn Select   | None                          |
| Multi-tenancy         | Companions scoped to bakery          | None                                                              | Templates scoped to bakery    |

---

## 10. Migration Strategy

All phases use the existing migration pattern in `db.js` (try/catch ALTER TABLE, CREATE TABLE IF NOT EXISTS):

**Phase 1 migrations (applied):**
- `recipe_companions` table created in schema init
- `ALTER TABLE recipe_companions ADD COLUMN qty REAL NOT NULL DEFAULT 0`

**Phase 2 migrations (applied):**
- `ALTER TABLE process_steps ADD COLUMN preferment_ingredient_id TEXT REFERENCES recipe_ingredients(id) ON DELETE CASCADE`
- `ALTER TABLE recipes ADD COLUMN base_ingredient_category TEXT NOT NULL DEFAULT 'FLOUR'`

**Phase 3 migrations (applied):**
- `recipe_templates` table created in schema init (with indexes)
- `ALTER TABLE preferment_settings ADD COLUMN source_template_id TEXT REFERENCES recipe_templates(id) ON DELETE SET NULL`
- `ALTER TABLE preferment_settings ADD COLUMN source_version INTEGER`
- `ALTER TABLE recipe_companions ADD COLUMN source_template_id TEXT REFERENCES recipe_templates(id) ON DELETE SET NULL`
- `ALTER TABLE recipe_companions ADD COLUMN source_version INTEGER`

**Zero breaking changes.** All additions are additive — new tables, nullable columns, default values. Existing recipes work unchanged.

---

## 11. Test Plan

### Phase 1 Tests (verified)

```
C1. ✅ Create companion link → appears in recipe's companions array
C2. ✅ Delete parent recipe → companion link deleted (CASCADE), companion recipe survives
C3. ✅ Delete companion recipe → link deleted (CASCADE), parent recipe unaffected
C4. ✅ Same companion linked to 2 parents → both parents see it
C5. ✅ Self-link prevention → skipped on save (defense in depth)
C6. ✅ Companion scoped to same bakery → verified on save
C7. ✅ Version snapshot includes companion links with qty
C8. ✅ Companion qty editable in Accompanied Recipes card
C9. ✅ Production page scales companion ingredients based on qty
C10. ✅ Versions comparison shows companion add/remove/modify
```

### Phase 2 Tests (verified)

```
P1. ✅ Process step with preferment_ingredient_id → associated with correct PF
P2. ✅ Process step with NULL preferment_ingredient_id → main recipe (backward compat)
P3. ✅ Delete PF ingredient → cascades to delete PF-specific steps
P4. ✅ suggestPfProcessSteps() generates steps for LEVAIN (MIX + FEED + FERMENT)
P5. ✅ suggestPfProcessSteps() generates steps for all PF types
P6. ✅ PF process steps included in version snapshot
P7. ✅ base_ingredient_category defaults to FLOUR, overridable
P8. ✅ Non-flour recipes (SWEETENER base) compute meaningful BP%
P9. ✅ PF rows show ratio as BP% instead of 0
P10. ✅ Build passes, existing tests pass
```

### Phase 3 Tests (verified)

```
T1. ✅ Create template from new recipe → appears in library
T2. ✅ Promote existing recipe to template → appears in library, recipe intact
T3. ✅ Template list shows type badges, used-in count, edit formula link
T4. ✅ Delete template → source_template_id becomes NULL, local copies preserved
T5. ✅ Link PF from template → formula copied, "From: X" badge shown
T6. ✅ Link companion from template → source tracking persisted
T7. ✅ Edit template backing recipe → stale amber banner appears on linked parent recipes
T8. ✅ "Review changes" link → opens version comparison for the template recipe
T9. ✅ PF "Pull update" → formula re-copied, source_version bumped
T10. ✅ Companion "Acknowledge" → source_version bumped, stale banner cleared
T11. ✅ Version history shows template link/unlink/sync events
T12. ✅ Template scoped to bakery — other bakeries cannot see it
T13. ✅ Viewer role cannot create/edit/delete templates
T14. ✅ Production page still works with template-linked companions
T15. ✅ yarn build passes clean
```

---

## 12. Reference Formulas

These real-world formulas from Suas Ch. 9 serve as validation test cases for the accompanied recipe system.

### Sweet Roll Dough (Phase 1 test case)

Main recipe + 2 non-PF companions:

- **Main**: Sweet Roll Dough — bread flour (80%), cake flour (20%), water (40%), milk powder (5%), eggs (15%), sugar (20%), salt (2%), osmotolerant yeast (2%), butter (30%). Intensive mix, DDT 22-25°C.
- **Companion 1**: Cinnamon Sugar (filling) — sugar + cinnamon blend
- **Companion 2**: Sticky Bun Glaze (glaze) — sugar + butter + corn syrup + honey

Inference: fatBP 30% > 12% + hasYeast → **RICH**

### Laminated Brioche (Phase 1 + Phase 2 test case)

Main recipe + PF + non-PF companions:

- **Main**: Laminated Brioche — bread flour (100%), water (4.6%), eggs (67%), sugar (15.6%), salt (2.5%), osmotolerant yeast (1.6%), butter (20%), sponge PF (40%), roll-in butter (25%). Intensive mix, DDT 22-25°C.
- **PF**: Sponge — bread flour (100%), water (62%), yeast (0.1%). DDT 21°C, ferment 12-16h.
- **Companion**: Pastry cream or frangipane (filling)

Inference: fatBP 20% > 12% + hasYeast → **RICH**

### Columba di Pasqua (Phase 1 + Phase 2 test case)

Main recipe + PF + staged build + glaze:

- **Main**: Final Dough (see recipemanagement.md §16.3 for full formula)
- **PF**: Italian Levain (LEVAIN type, 140% starter, multi-feed process)
- **Staged build**: First Dough (PF in engine, but needs detailed process steps)
- **Companion**: Hazelnut Glaze (glaze)

Inference: hasLevain → **SOURDOUGH** (if levain is present in the final stage's ingredients)

### Pan d'Oro (Phase 2 + Phase 3 test case)

5-formula, 4-stage build with DAG dependencies:

```
Levain → First Dough ─┐
                       ├→ Third Dough → Final Dough
Second Dough ─────────┘
```

| Stage          | Key Ingredients (BP)                                                                                                             | Process                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Italian Levain | Flour (100%), Water (50%), Starter (140%)                                                                                        | Mix DDT 29°C, feed every 4h                                                                 |
| First Dough    | Flour (100%), Water (50%), Eggs (40%), Sugar (25%), Levain (145%)                                                                | Mix 1st speed only, ferment 2h at 29°C                                                      |
| Second Dough   | Flour (100%), Eggs (65%), Sugar (20%), Osmotolerant yeast (2%)                                                                   | Mix 1st speed only, ferment 1.5h at 29°C                                                    |
| Third Dough    | Flour (100%), Eggs (44%), Sugar (20%), Butter (5.55%), First Dough (400%), Second Dough (128%)                                   | Mix 1st speed only, ferment 3h at 29°C                                                      |
| Final Dough    | Flour (100%), Eggs (75.75%), Salt (2.4%), Sugar (48.48%), Honey (4.5%), Butter (75.75%), Cocoa butter (4.5%), Third Dough (190%) | Intensive mix (8-step staged process), DDT 25-29°C, proof 14h at 22°C, bake 35 min at 203°C |

This is the most complex test case — validates multi-stage PF chains, parallel scheduling, per-stage process steps, and (in Phase 3) template reuse of the Italian Levain.
