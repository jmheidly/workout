# §16 Accompanied Recipes — Implementation Guide

> Comprehensive specification for adding accompanied recipe support to the Recipe Engine.
> This document supplements the foundation spec (`recipemanagement.md`) and serves as the development guide for Claude Code implementation.

## Table of Contents

1. [Context & Motivation](#1-context--motivation)
2. [Architecture Decision: §5 Stays, §16 Layers On Top](#2-architecture-decision-5-stays-16-layers-on-top)
3. [Phase 1 — Non-PF Companions (Glazes, Fillings, Garnishes)](#3-phase-1--non-pf-companions)
4. [Phase 2 — Per-Stage Process Modeling](#4-phase-2--per-stage-process-modeling)
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

| Category | Examples | Relationship to Main Dough |
|---|---|---|
| **Finishing components** | Sticky Bun Glaze, Hazelnut Glaze, flat icing, fondant, powdered sugar dust | Applied after baking. No calculation relationship to the dough formula. |
| **Filling components** | Cinnamon Sugar, pastry cream, frangipane, almond paste | Incorporated during makeup. No calculation relationship to the dough formula. |
| **Multi-stage dough builds** | Italian Levain → First Dough → Final Dough | PREFERMENT ingredients in the engine. §5 already handles the calculation chain. |

The first two categories have no existing support. The third is already handled by §5's preferment system — but lacks richer process modeling (per-stage steps, parallel scheduling, reuse).

### Source Material

All examples sourced from Suas, *Advanced Bread and Pastry*, Chapter 9: Viennoiserie.

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

| Gap | Description |
|---|---|
| **Non-PF companions** | Glazes, fillings, and garnishes don't contribute to total formula flour or hydration. They are separate preparations that need to be produced alongside the main recipe, scaled proportionally. |
| **Per-stage process steps** | §5 stores `preferment_settings` (type, DDT, fermentation duration) but doesn't model a full process sequence per preferment. An Italian Levain's "feed every 4 hours at 29°C" or a First Dough's "mix 1st speed only, ferment 2h at 29°C" need multi-step processes. |
| **Production scheduling** | §9's timeline would need to walk the PF dependency DAG to find the critical path. First Dough and Second Dough can run in parallel, but Third Dough blocks on both. |
| **Independent reuse** | PFs are currently embedded inline per recipe. The same Italian Levain formula used in both Panettone and Pan d'Oro is duplicated — there's no shared reference. |

### Decision

**§5 stays for calculation.** §16 adds:
- Phase 1: Non-PF companions (glazes, fillings)
- Phase 2: Per-stage process modeling for PFs
- Phase 3: Reusable sub-recipe library

Each phase is independently shippable.

---

## 3. Phase 1 — Non-PF Companions

### Goal

Allow a recipe to link to companion preparations (glazes, fillings, garnishes) that are produced alongside the main dough but don't participate in the dough calculation (§4/§5).

### Scope

- Baker can create companion recipes linked to a parent recipe
- Each companion has its own ingredients, baker's %, and process steps
- Companions are normal recipes — same `recipes` table, same structure, same bakery scoping
- Companions scale proportionally when the parent recipe's batch size changes
- Companions appear in the recipe builder UI and on the production page

### Data Model

New table:

```sql
CREATE TABLE IF NOT EXISTS recipe_companions (
  id TEXT PRIMARY KEY,
  parent_recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  companion_recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'other',  -- 'filling', 'glaze', 'garnish', 'other'
  scaling_ratio REAL NOT NULL DEFAULT 1.0,
    -- companion_batch = parent_batch_pieces × scaling_ratio
    -- e.g. glaze is 0.05 = 50g glaze per 1000g dough piece
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE(parent_recipe_id, companion_recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_companions_parent ON recipe_companions(parent_recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_companions_companion ON recipe_companions(companion_recipe_id);
```

### Scaling Semantics

Each companion is its own formula with its own baker's %. Scaling works as follows:

1. The companion recipe defines a **base yield** (e.g. Sticky Bun Glaze yields 500g)
2. The `scaling_ratio` on the link defines how much companion is needed per unit of parent production
3. When the baker scales the parent recipe (e.g. 2× batch), the companion scales proportionally
4. Internal ratios within the companion stay fixed — only the total quantity changes

Example: Sweet Roll Dough makes 24 rolls. Sticky Bun Glaze base recipe yields enough for 24 rolls. If the baker doubles to 48 rolls, the glaze recipe also doubles.

### Companion Roles

| Role | Description | Applied When |
|---|---|---|
| `filling` | Incorporated during makeup (inside the dough) | Shaping stage |
| `glaze` | Applied before or after baking | Finishing stage |
| `garnish` | Decorative topping (pearl sugar, powdered sugar, etc.) | Finishing stage |
| `other` | Catch-all for unusual companions | Varies |

### API / CRUD

Extend `db.js`:

```
createCompanionLink(parentId, companionId, { role, scalingRatio, notes })
removeCompanionLink(parentId, companionId)
getCompanionsForRecipe(recipeId) → [{ companion: Recipe, role, scalingRatio }]
getParentsForRecipe(recipeId) → [{ parent: Recipe, role }]
```

The `getRecipe()` function should optionally include companions (to avoid N+1 on recipe list views):

```
getRecipe(id, bakeryId, { includeCompanions: false })
```

### Constraints

- A companion cannot be its own parent (no self-links)
- A recipe can be a companion to multiple parents (e.g. same Cinnamon Sugar used by multiple recipes)
- A recipe can have multiple companions
- Deleting a parent recipe cascades to delete the links (not the companion recipe itself)
- Companions are scoped to the same bakery as the parent

### What This Phase Does NOT Include

- Companions don't participate in §4/§5 calculations (no contribution to total formula, hydration, or baker's %)
- No per-companion process steps in the parent's process flow (that's Phase 2)
- No shared library / deduplication (that's Phase 3)

---

## 4. Phase 2 — Per-Stage Process Modeling

### Goal

Enable richer process documentation for preferments and multi-stage builds — full process step sequences per PF, not just DDT and fermentation duration.

### Context

Currently `preferment_settings` stores:

| Field | Type |
|---|---|
| `ingredient_id` | TEXT (FK to recipe_ingredients) |
| `enabled` | INTEGER |
| `type` | TEXT (POOLISH, BIGA, LEVAIN, etc.) |
| `ddt` | REAL |
| `fermentation_duration_min` | INTEGER |

This is sufficient for simple PFs (poolish, biga) but inadequate for:

- **Italian Levain**: "Mix all ingredients until well incorporated with a DDT of 85°F. Feed every 4 hours, or once mature." — This is a 2-step process with repeated feedings.
- **Pan d'Oro First Dough**: "Mix only until incorporated in first speed only. Ferment 2 hours at 85°F." — Specific mixing instructions.
- **Columba di Pasqua**: 8-step detailed mixing process for the final dough involving staged addition of sugar and egg yolks as gluten develops.

### Approach

**Reuse the existing `process_steps` table.** Process steps are already keyed by `recipe_id`. But PF-specific steps need to be associated with a specific preferment ingredient, not just the recipe.

Option A — Add a nullable FK to process_steps:

```sql
ALTER TABLE process_steps ADD COLUMN preferment_ingredient_id TEXT
  REFERENCES recipe_ingredients(id) ON DELETE CASCADE;
```

- `preferment_ingredient_id = NULL` → step belongs to the main recipe (current behavior)
- `preferment_ingredient_id = 'xyz'` → step belongs to that PF's build process

Option B — Companion recipes for PFs (unify with Phase 1):

Each PF that needs a full process sequence becomes a companion recipe (role = `preferment_build`). The PF ingredient in the parent still drives §5 calculations, but the companion recipe holds the detailed process steps.

**Recommended: Option A** for simplicity. It keeps PF process steps co-located with the parent recipe while allowing fine-grained per-PF step sequences. Option B creates indirection that complicates the recipe builder UI.

### New Process Stages

Add PF-specific stages to `PROCESS_STAGES`:

```js
'PF_MIX'        // Mixing the preferment build
'PF_FEED'       // Feeding cycle (levain refreshment)
'PF_FERMENT'    // Preferment fermentation rest
```

These are optional — existing PFs continue to work with just the `preferment_settings` fields. The new stages are for bakers who want detailed process documentation.

### PF Process Step Suggestion

Extend `suggestProcessSteps()` to optionally generate PF-specific steps:

```js
// For a LEVAIN PF:
[
  { stage: 'PF_MIX', title: 'Mix Levain Build', description: 'Combine flour, water, and starter...', preferment_ingredient_id: 'xyz' },
  { stage: 'PF_FEED', title: 'Feed Levain', description: 'Feed every 4 hours at 29°C until mature.', preferment_ingredient_id: 'xyz' },
  { stage: 'PF_FERMENT', title: 'Levain Fermentation', duration_min: 480, temperature: 29, preferment_ingredient_id: 'xyz' },
]

// For a SPONGE PF:
[
  { stage: 'PF_MIX', title: 'Mix Sponge', description: 'Combine flour, water, and yeast...', preferment_ingredient_id: 'abc' },
  { stage: 'PF_FERMENT', title: 'Sponge Fermentation', duration_min: 720, temperature: 21, preferment_ingredient_id: 'abc' },
]
```

### Production Timeline Integration (§9 prerequisite)

When §9 is implemented, the PF process steps feed into the production timeline:

1. Walk the PF dependency DAG (already implicit in `preferment_bakers_pcts`)
2. For each PF, compute start time = main mix time − fermentation duration (existing logic in §5.5)
3. PFs that don't depend on each other can be scheduled in parallel
4. PFs that depend on other PFs must be sequenced

**Pan d'Oro critical path:**

```
T-24h: Start Italian Levain (feed cycle)
T-8h:  Mix First Dough (depends on Levain)
T-8h:  Mix Second Dough (independent — parallel with First Dough)
T-6h:  First Dough fermentation complete
T-6.5h: Second Dough fermentation complete
T-5h:  Mix Third Dough (depends on both First + Second)
T-2h:  Third Dough fermentation complete
T-0:   Mix Final Dough
```

### Constraints

- Existing recipes with simple PFs continue to work unchanged
- PF process steps are optional — the baker can use just `preferment_settings` as before
- Version snapshots (§12) must include PF process steps

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

### Phase 1 (new table)

```sql
CREATE TABLE IF NOT EXISTS recipe_companions (
  id TEXT PRIMARY KEY,
  parent_recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  companion_recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'other',
  scaling_ratio REAL NOT NULL DEFAULT 1.0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE(parent_recipe_id, companion_recipe_id)
);
```

### Phase 2 (alter existing table)

```sql
ALTER TABLE process_steps ADD COLUMN preferment_ingredient_id TEXT
  REFERENCES recipe_ingredients(id) ON DELETE CASCADE;
```

New PROCESS_STAGES: `PF_MIX`, `PF_FEED`, `PF_FERMENT`

### Phase 3 (new table + alter existing)

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

### Phase 1: None

Companion recipes don't participate in §4/§5. They have their own independent calculation — same engine, separate recipe instance.

### Phase 2: Minimal

PF process steps are documentation only — they don't affect quantities. The only engine change is extending `suggestProcessSteps()` to generate PF-specific steps with the `preferment_ingredient_id` field.

### Phase 3: None

Templates are a UI/management layer. The calculation engine sees the same data as before — ingredients, PF baker's %, PF settings. Whether those values came from a template or were entered inline is invisible to the engine.

### Total Formula Resolution (existing — no change needed)

§5's topological sort already resolves multi-stage builds:

```
Pan d'Oro in the engine:
- Final Dough has ingredient "Third Dough" (PREFERMENT)
- Third Dough has ingredients "First Dough" (PREFERMENT) + "Second Dough" (PREFERMENT)
- First Dough has ingredient "Levain" (PREFERMENT)
- Each PF's contributions decompose into total formula via preferment_bakers_pcts
```

The engine doesn't need to know about the DAG structure — it processes PFs in dependency order (topological sort) and the math works out.

---

## 8. UI Changes

### Phase 1: Recipe Builder

Add an "Accompanied Recipes" section below the ingredients table:

```
┌─ Accompanied Recipes ──────────────────────────────────┐
│                                                         │
│  Cinnamon Sugar (filling)              [Edit] [Remove]  │
│  Sticky Bun Glaze (glaze)             [Edit] [Remove]  │
│                                                         │
│  [+ Add Companion]  [Link Existing Recipe]              │
└─────────────────────────────────────────────────────────┘
```

- **Add Companion**: Creates a new recipe in the same bakery and links it
- **Link Existing Recipe**: Picker to select from bakery's recipe list
- **Edit**: Navigates to the companion recipe's builder page
- **Remove**: Removes the link (not the recipe itself)

### Phase 1: Recipe List

Show companion count or badges:

```
Rustic Baguette                              0 companions
Sweet Roll Dough                             2 companions (filling, glaze)
  └ Cinnamon Sugar                           ← shown indented or as sub-row
  └ Sticky Bun Glaze
```

### Phase 1: Production Page

When producing a recipe with companions, show companion quantities alongside:

```
Sweet Roll Dough — 48 pieces
  Main Dough: 12,000g
  Companions:
    Cinnamon Sugar: 800g (filling)
    Sticky Bun Glaze: 1,200g (glaze)
```

### Phase 2: PF Process Steps in Recipe Builder

Within the preferment expandable section (already exists for PF settings), add an optional process steps sub-section:

```
┌─ Levain (LEVAIN) ──────────────────────────────────────┐
│  DDT: 29°C   Fermentation: 8h   Enabled: ✓            │
│                                                         │
│  ▼ Process Steps (optional)                             │
│  1. PF_MIX: Mix Levain Build                           │
│  2. PF_FEED: Feed every 4h at 29°C                     │
│  3. PF_FERMENT: Ferment 8h                             │
│  [+ Add Step]  [Suggest Steps]                          │
└─────────────────────────────────────────────────────────┘
```

### Phase 3: Template Library

New route: `/(app)/recipes/templates/`

```
┌─ Sub-Recipe Library ───────────────────────────────────┐
│                                                         │
│  Italian Levain (preferment)       Used in 3 recipes    │
│  Pastry Cream (filling)            Used in 5 recipes    │
│  Cinnamon Sugar (filling)          Used in 2 recipes    │
│  Sticky Bun Glaze (glaze)          Used in 1 recipe     │
│                                                         │
│  [+ Create Template]                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Cross-Section Impact Matrix

| Section | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| §3 Data Model | New `recipe_companions` table | Alter `process_steps` | New `recipe_templates` table |
| §4 Calculation Engine | None | None | None |
| §5 Pre-ferment System | None | PF process step generation | Template source tracking |
| §8 Autolyse | None | None | None |
| §9 Timeline (future) | Companion production scheduling | PF DAG critical path | Template update notifications |
| §10 Process Steps | None | New PF stages, `preferment_ingredient_id` FK | None |
| §11 Loss/Waste | Per-companion loss tracking | None | None |
| §12 Versioning | Include companion links in snapshots | Include PF steps in snapshots | Track template source version |
| §15 Dough Type | None | None | None |
| Multi-tenancy (§8) | Companions scoped to bakery | None | Templates scoped to bakery |

---

## 10. Migration Strategy

All phases use the existing migration pattern in `db.js`:

```js
const migrations = [
  // ... existing migrations ...

  // Phase 1
  `CREATE TABLE IF NOT EXISTS recipe_companions (
    id TEXT PRIMARY KEY,
    parent_recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    companion_recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'other',
    scaling_ratio REAL NOT NULL DEFAULT 1.0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    UNIQUE(parent_recipe_id, companion_recipe_id)
  )`,

  // Phase 2
  'ALTER TABLE process_steps ADD COLUMN preferment_ingredient_id TEXT REFERENCES recipe_ingredients(id) ON DELETE CASCADE',

  // Phase 3
  // ... recipe_templates table, source_template_id columns ...
]
```

**Zero breaking changes.** All additions are additive:
- New tables (no existing data affected)
- New nullable columns (existing rows get NULL)
- New process stages (existing steps keep their current stages)
- Existing PFs continue to work with just `preferment_settings`

---

## 11. Test Plan

### Phase 1 Tests

```
C1. Create companion link → appears in getCompanionsForRecipe()
C2. Delete parent recipe → companion link deleted, companion recipe survives
C3. Delete companion recipe → link deleted, parent recipe unaffected
C4. Same companion linked to 2 parents → both parents see it
C5. Scaling: parent batch 2× → companion scales proportionally
C6. Self-link prevention → error
C7. Companion scoped to same bakery as parent
C8. Recipe list includes companion count
C9. Version snapshot includes companion links
```

### Phase 2 Tests

```
P1. Process step with preferment_ingredient_id → associated with correct PF
P2. Process step with NULL preferment_ingredient_id → main recipe (backward compat)
P3. Delete PF ingredient → cascades to delete PF-specific steps
P4. suggestProcessSteps() generates PF-specific steps for LEVAIN
P5. suggestProcessSteps() generates PF-specific steps for SPONGE
P6. PF process steps included in version snapshot
P7. New PF stages (PF_MIX, PF_FEED, PF_FERMENT) accepted by validation
```

### Phase 3 Tests

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

| Stage | Key Ingredients (BP) | Process |
|---|---|---|
| Italian Levain | Flour (100%), Water (50%), Starter (140%) | Mix DDT 29°C, feed every 4h |
| First Dough | Flour (100%), Water (50%), Eggs (40%), Sugar (25%), Levain (145%) | Mix 1st speed only, ferment 2h at 29°C |
| Second Dough | Flour (100%), Eggs (65%), Sugar (20%), Osmotolerant yeast (2%) | Mix 1st speed only, ferment 1.5h at 29°C |
| Third Dough | Flour (100%), Eggs (44%), Sugar (20%), Butter (5.55%), First Dough (400%), Second Dough (128%) | Mix 1st speed only, ferment 3h at 29°C |
| Final Dough | Flour (100%), Eggs (75.75%), Salt (2.4%), Sugar (48.48%), Honey (4.5%), Butter (75.75%), Cocoa butter (4.5%), Third Dough (190%) | Intensive mix (8-step staged process), DDT 25-29°C, proof 14h at 22°C, bake 35 min at 203°C |

This is the most complex test case — validates multi-stage PF chains, parallel scheduling, per-stage process steps, and (in Phase 3) template reuse of the Italian Levain.
