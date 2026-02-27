# §16 Accompanied Recipes — Implementation Guide

> Comprehensive specification for adding accompanied recipe support to the Recipe Engine.
> This document supplements the foundation spec (`recipemanagement.md`) and serves as the development guide for Claude Code implementation.

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | **Done** | Non-PF companions (glazes, fillings, garnishes) with qty, BP%, versioning |
| Phase 2 | **Done** | Per-PF process steps with `PF_MIX`/`PF_FEED`/`PF_FERMENT` stages |
| Phase 3 | Planned | Reusable sub-recipe library |

## Table of Contents

1. [Context & Motivation](#1-context--motivation)
2. [Architecture Decision: §5 Stays, §16 Layers On Top](#2-architecture-decision-5-stays-16-layers-on-top)
3. [Phase 1 — Non-PF Companions (Glazes, Fillings, Garnishes)](#3-phase-1--non-pf-companions) — **Implemented**
4. [Phase 2 — Per-Stage Process Modeling](#4-phase-2--per-stage-process-modeling) — **Implemented**
5. [Phase 3 — Reusable Sub-Recipe Library](#5-phase-3--reusable-sub-recipe-library)
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
- On the production page, companion ingredient quantities are scaled proportionally based on the qty defined in the parent
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
- **Companion rows** show BP% as `companion.qty / total_formula_flour`
- Both are included in the table totals

### Production Timeline Integration (§9 — future)

When §9 is implemented, the PF process steps feed into the production timeline:

1. Walk the PF dependency DAG (already implicit in `preferment_bakers_pcts`)
2. For each PF, compute start time = main mix time − fermentation duration
3. PFs that don't depend on each other can be scheduled in parallel
4. PFs that depend on other PFs must be sequenced

---

## 5. Phase 3 — Reusable Sub-Recipe Library

### Goal

Allow bakers to define sub-recipes once and reference them from multiple parent recipes, rather than duplicating formulas inline.

### Problem

Currently, if Bakery X uses the same Italian Levain formula for Panettone, Pan d'Oro, and Sourdough Croissant, the levain is defined separately in each recipe. Updating the levain (e.g. changing hydration from 50% to 60%) requires editing 3 recipes individually.

### Approach

Introduce a "recipe template" or "sub-recipe library" concept:

```sql
CREATE TABLE IF NOT EXISTS recipe_templates (
  id TEXT PRIMARY KEY,
  bakery_id TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'preferment',
    -- 'preferment', 'filling', 'glaze', 'garnish', 'intermediate_dough'
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    -- points to a normal recipe that holds the formula
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recipe_templates_bakery ON recipe_templates(bakery_id);
```

### How It Works

1. **Create template**: Baker defines an "Italian Levain" template. This creates a normal recipe (with ingredients, PF settings, process steps) and registers it in `recipe_templates`.

2. **Reference from parent**: When the baker adds a PREFERMENT ingredient to a recipe and wants to use a library template:

   - Show a picker: "Use from library" vs "Define inline"
   - If library: link to the template. The PF's `preferment_bakers_pcts` and `preferment_settings` are copied from the template's recipe at link time.
   - The link is stored as metadata — enabling "pull updates" later.

3. **Update propagation**: When a template is updated:
   - Linked recipes are NOT auto-updated (breaking change risk)
   - Instead, a notification/badge shows: "Italian Levain template was updated — Review changes"
   - Baker can choose to pull the update or keep their local version
   - This mirrors how git submodules or package versions work — explicit opt-in updates

### Copy-on-Link vs Live Reference

**Recommended: Copy-on-link with update notification.**

- When a template is linked, its formula is copied into the parent recipe's PF ingredient
- The parent recipe stores a `source_template_id` reference for tracking
- Changes to the template don't automatically propagate
- Baker can "sync" to pull the latest template version

This avoids the complexity of live references (what happens if the template is deleted? what if the template changes break the parent recipe's ratios?).

### Data Model Addition

Add to `recipe_ingredients` or `preferment_settings`:

```sql
ALTER TABLE preferment_settings ADD COLUMN source_template_id TEXT
  REFERENCES recipe_templates(id) ON DELETE SET NULL;
ALTER TABLE preferment_settings ADD COLUMN source_version INTEGER;
  -- version of the template when it was last synced
```

Add to `recipe_companions`:

```sql
ALTER TABLE recipe_companions ADD COLUMN source_template_id TEXT
  REFERENCES recipe_templates(id) ON DELETE SET NULL;
ALTER TABLE recipe_companions ADD COLUMN source_version INTEGER;
```

### Constraints

- Templates are scoped to a bakery
- Deleting a template sets `source_template_id = NULL` on all linked recipes (they keep their local copy)
- Template versioning uses the same §12 system (recipe versions)
- A template can be of any type — PF, filling, glaze, etc.
- Templates appear in a dedicated library view, separate from the recipe list

### Phase 3 Prerequisites

- Phase 1 (companion links — for non-PF templates)
- §12 Versioning (for template version tracking)

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

### Phase 3 (planned — new table + alter existing)

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

### Phase 3: None (planned)

Templates are a UI/management layer. The calculation engine sees the same data as before.

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

### Phase 3: Template Library (Planned)

New route: `/(app)/recipes/templates/` — shared sub-recipe definitions reusable across parent recipes.

---

## 9. Cross-Section Impact Matrix

| Section               | Phase 1 (Done)                       | Phase 2 (Done)                                                    | Phase 3 (Planned)             |
| --------------------- | ------------------------------------ | ----------------------------------------------------------------- | ----------------------------- |
| §3 Data Model         | New `recipe_companions` table + qty  | Alter `process_steps`; alter `recipes` (base_ingredient_category) | New `recipe_templates` table  |
| §4 Calculation Engine | Companion BP% in ingredients table   | Engine uses `base_ingredient_category`; PF ratio as BP%           | None                          |
| §5 Pre-ferment System | None                                 | PF process step generation (`suggestPfProcessSteps`)              | Template source tracking      |
| §8 Autolyse           | None                                 | None                                                              | None                          |
| §9 Timeline (future)  | Companion production scheduling      | PF DAG critical path                                              | Template update notifications |
| §10 Process Steps     | None                                 | New PF stages, `preferment_ingredient_id` FK                      | None                          |
| §11 Loss/Waste        | Per-companion loss tracking           | None                                                              | None                          |
| §12 Versioning        | Companion links in snapshots + diffs | PF steps in snapshots; `base_ingredient_category` in diffs        | Track template source version |
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

**Phase 3 migrations (planned):**
- `recipe_templates` table + `source_template_id` columns

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
C8. ✅ Companion BP% computed relative to parent recipe's flour
C9. ✅ Companion qty included in ingredients table totals
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

### Phase 3 Tests (planned)

```
T1. Create template → appears in template library
T2. Link template to recipe PF → copies formula, sets source_template_id
T3. Update template → linked recipes NOT auto-updated
T4. Sync from template → pulls latest formula into PF
T5. Delete template → source_template_id set to NULL, local copy preserved
T6. Template scoped to bakery
T7. Template used-in count is accurate
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
