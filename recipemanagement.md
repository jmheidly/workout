# Recipe Engine — Foundation Specification v2.0

## Table of Contents

1. [Overview & Design Principles](#1-overview--design-principles)
2. [Recipe Builder Workflow (J/K Model)](#2-recipe-builder-workflow-jk-model)
3. [Data Model](#3-data-model)
4. [Core Calculation Engine](#4-core-calculation-engine)
5. [Pre-ferment System](#5-pre-ferment-system)
6. [Water Temperature Calculator](#6-water-temperature-calculator)
7. [Friction Factor System](#7-friction-factor-system)
8. [Autolyse System](#8-autolyse-system)
9. [Production Timeline & Fermentation Schedule](#9-production-timeline--fermentation-schedule)
10. [Process / Method Steps](#10-process--method-steps)
11. [Loss & Waste Factor](#11-loss--waste-factor)
12. [Recipe Versioning](#12-recipe-versioning)
13. [Complete Formula Reference](#13-complete-formula-reference)
14. [Seed Recipes](#14-seed-recipes)

---

## 1. Overview & Design Principles

This is the **universal foundation** for a recipe management engine. It handles any dough-based recipe — from a 4-ingredient baguette to a multi-stage Panettone with 4 pre-ferments. The architecture is extracted from a proven Google Sheets production calculator and extended with production-grade features.

### Core Principles

1. **J/K is the entry point.** The baker builds a recipe by naming ingredients (J) and setting quantities (K). Everything else derives from these two inputs plus pre-ferment Baker's percentages.
2. **K = Final Dough / Base Recipe quantity.** K represents what the baker puts into the final dough. Pre-ferments add mass on top — they do NOT redistribute from K. Total formula = K + pre-ferment contributions. This matches standard artisan bakery workflow where the baker thinks in terms of "my dough" and "my levain" as separate builds.
3. **Dynamic ingredient list.** No fixed row count. A recipe has as many ingredients as the baker adds — 4 for a lean dough, 25 for an enriched holiday bread.
4. **Dynamic pre-ferment count.** A recipe can have 0 to N pre-ferments. Each is just a PREFERMENT-category ingredient row — adding the row triggers the pre-ferment engine automatically.
5. **Category drives formula behavior.** Each ingredient is tagged with a category (FLOUR, LIQUID, ENRICHMENT, etc.) and the calculation engine uses the category to determine which formula variant to apply.
6. **Hydration = water only** (per *Advanced Bread and Pastry*).
7. **Baker's percentage = relative to total flour weight** (sum of all FLOUR-category ingredients).
8. **All units are grams and °C.**
9. **Zero-safe.** Every formula gracefully handles zero-quantity ingredients and disabled pre-ferments with no division-by-zero errors.
10. **Scaling is a view layer.** K values define the recipe. Production scaling (by pieces, total dough, or total flour) multiplies outputs without mutating K.

### What This Spec Covers

| Capability | Section |
|-----------|---------|
| Building any recipe from ingredients + quantities | §2 |
| Calculating all dough stages from Baker's % | §4 |
| Any number of pre-ferments with chained builds | §5 |
| DAG validation for pre-ferment dependencies | §5.5 |
| Production scaling (by pieces, dough weight, flour weight) | §4.12 |
| Water temperature targeting | §6 |
| Mixer friction compensation | §7 |
| Autolyse split-mix handling | §8 |
| Production scheduling (forward + reverse) | §9 |
| Step-by-step process method | §10 |
| Loss/waste scaling | §11 |
| Version history with UUID-based diff and rename detection | §12 |

---

## 2. Recipe Builder Workflow (J/K Model)

This section defines the baker's mental model and how the app should present the recipe-building experience.

### 2.1 The Two Primary Inputs

Every item in a recipe — flour, water, butter, levain, poolish — is added the same way:

| Column | What the baker enters | Example |
|--------|----------------------|---------|
| **J** | Ingredient name | "Bread flour", "Water", "Poolish" |
| **K** | Quantity in grams | 234, 322, 100 |

The baker also assigns a **category** to each row. The category determines how the engine treats the ingredient.

**Everything flows from J, K, and Category.** There is no separate workflow for adding pre-ferments. A pre-ferment is just a row with `category = PREFERMENT`.

### 2.2 How Pre-ferments Work in the J/K Model

When the baker adds a row with category `PREFERMENT`, the engine automatically:

1. Recognizes this row as a pre-ferment
2. Uses K as the pre-ferment's **total base quantity** (grams)
3. Calculates the **ratio** = `K / SUM(all FLOUR K values)` immediately
4. Creates a **Baker's % sub-column** for this pre-ferment — one Baker's % input per ingredient
5. Sets the pre-ferment to `enabled = true`

The baker then fills in Baker's % for the ingredients that go INTO that pre-ferment (e.g. flour = 1.0, water = 1.0, yeast = 0.001 for a Poolish). The engine calculates everything else.

**Multiple pre-ferments?** Add multiple PREFERMENT rows. Each one gets its own Baker's % sub-column. They all work independently.

### 2.3 Building a Recipe — Step by Step

```
Step 1: Name the recipe, set yield per piece (g) and DDT (°C)

Step 2: Add ingredients — every row is J (name) + K (grams) + Category
        Row:  "Bread flour"    234     FLOUR
        Row:  "Water"          322     LIQUID
        Row:  "Salt"           14      SEASONING
        Row:  "Butter"         357     ENRICHMENT
        Row:  "Levain"         2413    PREFERMENT    ← triggers pre-ferment engine
        → Baker's % auto-calculated for all rows
        → Pre-ferment ratio auto-calculated
        → Pre-ferment Baker's % sub-column appears

Step 3: For each PREFERMENT row, fill in Baker's % for its internal ingredients
        Levain Baker's %:
          Bread flour = 1.0
          Water = 0.55
          Butter = 0.24
          Sugar = 0.24
          ...
        → Engine immediately calculates all pre-ferment internal quantities
        → Final dough quantities update
        → Per-item and batch quantities update

Step 4: (Optional) Enable autolyse, set mixer, configure loss factors
Step 5: (Optional) Add process steps and fermentation schedule
Step 6: Everything is calculated — ready for production
```

### 2.4 Adding a Regular Ingredient

```
Action:  Baker adds row: J = "Honey", K = 54, Category = SWEETENER
Result:  → New ingredient appears in the recipe
         → Baker's % auto-calculated: 54 / SUM(flour K values)
         → All existing pre-ferment Baker's % for this ingredient default to null
           (meaning: Honey is not part of any pre-ferment yet)
         → If the baker wants Honey in the Levain, they set Levain BP for Honey
         → All calculated columns update
```

### 2.5 Adding a Pre-ferment

```
Action:  Baker adds row: J = "Poolish", K = 400, Category = PREFERMENT
Result:  → Engine detects PREFERMENT category
         → Pre-ferment structure auto-created:
             name = "Poolish"
             base_qty = 400
             ratio = 400 / SUM(flour K values)
             enabled = true
         → New Baker's % sub-column appears for "Poolish"
         → All ingredients get a Poolish Baker's % field (defaulting to null)
         → Baker fills in: flour = 1.0, water = 1.0, yeast = 0.001
         → Engine calculates Poolish internal quantities
         → Final dough and batch quantities recalculate
```

### 2.6 Removing an Ingredient

```
Action:  Baker deletes a regular ingredient row (e.g. "Honey")
Result:  → Ingredient removed from recipe
         → All pre-ferment Baker's % references to it removed
         → All totals recalculate

Action:  Baker deletes a PREFERMENT row (e.g. "Poolish")
Result:  → Pre-ferment structure removed
         → Baker's % sub-column for this pre-ferment disappears
         → All final dough quantities revert (no longer adjusted for this PF)
         → Full recalculation
```

### 2.7 Disabling vs. Deleting a Pre-ferment

Sometimes the baker wants to temporarily turn off a pre-ferment without losing its Baker's % configuration. The `enabled` toggle handles this:

```
Action:  Baker toggles Poolish to disabled (but keeps the row)
Result:  → K value remains (400g)
         → All Baker's % inputs preserved
         → But: ratio = 0, all quantities = 0
         → Final dough calculates as if Poolish doesn't exist
         → Baker can re-enable later without re-entering Baker's %
```

### 2.8 The Column Structure (Dynamic)

For a recipe with N ingredients (including P pre-ferment rows), the logical columns are:

| Column | Content | Type |
|--------|---------|------|
| **J** | Ingredient name | INPUT |
| **K** | Quantity (g) | INPUT |
| **Category** | FLOUR / LIQUID / PREFERMENT / etc. | INPUT (set once) |
| **D** | Overall Baker's % | CALCULATED: `TFQ[i] / SUM(TFQ_flours)` |
| For each PREFERMENT row p: | | |
| **BP_p** | Baker's % within pre-ferment p | INPUT (per ingredient) |
| **QTY_p** | Quantity within pre-ferment p | CALCULATED |
| **B** | % of total flour (total formula) | CALCULATED |
| **C** | Total formula quantity | CALCULATED |
| **F** | Final dough Baker's % | CALCULATED |
| **G** | Final dough quantity | CALCULATED |
| **H** | Per-item weight | CALCULATED |
| **I** | Batch quantity | CALCULATED |

The number of BP/QTY column pairs grows dynamically with each PREFERMENT row added.

---

## 3. Data Model

### 3.1 Recipe

```
Recipe {
  id: uuid
  name: string
  version: integer
  created_at: timestamp
  updated_at: timestamp
  parent_version_id: uuid | null
  change_notes: string | null

  // Global parameters
  yield_per_piece: number               // grams
  ddt: number                           // Desired Dough Temperature in °C
  autolyse: boolean
  autolyse_duration_min: number | null  // minutes, if enabled

  // Mixer
  mixer_profile_id: uuid | null
  mix_type: string                      // "Improved Mix", "Intensive Mix", "Short Mix"

  // Loss factors
  process_loss_pct: number              // e.g. 0.03 = 3%
  bake_loss_pct: number                 // e.g. 0.12 = 12%

  // Dynamic relationships
  ingredients: [RecipeIngredient]       // ordered list, any length
  preferments: [Preferment]             // ordered list, 0 to N
  process_steps: [ProcessStep]          // ordered list
  fermentation_stages: [FermentationStage]
}
```

### 3.2 RecipeIngredient

```
RecipeIngredient {
  id: uuid
  recipe_id: uuid
  name: string                          // The "J" column — e.g. "Bread flour"
  category: IngredientCategory          // determines formula behavior
  base_qty: number                      // The "K" column — grams
  sort_order: integer                   // display order

  // Pre-ferment Baker's percentages — dynamic, one entry per preferment
  preferment_bakers_pcts: {
    [preferment_id]: number | null      // null = not part of this pre-ferment
  }                                     // 0.0 = part of it but at zero

  // ---- ALL BELOW ARE CALCULATED (never stored) ----
  // overall_bakers_pct                 // TFQ[i] / SUM(TFQ_flours) — the "D" column
  // total_formula_qty                  // "C" column
  // pct_of_total_flour                 // "B" column
  // final_dough_bakers_pct             // "F" column
  // final_dough_qty                    // "G" column
  // per_item_weight                    // "H" column
  // batch_qty                          // "I" column
  // preferment_qtys: {[pf_id]: number} // "M", "O", "Q", "S" columns
}
```

### 3.3 Ingredient Categories

```
enum IngredientCategory {
  FLOUR           // Any flour: bread, WW, rye, semolina, rice, spelt, etc.
  LIQUID          // Water, milk, juice — contributes to hydration
  ENRICHMENT      // Butter, eggs, egg yolks, cream, oil
  LEAVENING       // Yeast (instant, active dry, fresh), baking powder
  SEASONING       // Salt
  SWEETENER       // Sugar, honey, malt syrup, molasses
  FLAVORING       // Malt powder, vanilla, orange water, spices, zest
  MIXIN           // Nuts, dried fruit, chocolate chips, seeds, candied peel
  PREFERMENT      // Auto-assigned: Levain, Poolish, Biga, PFD, Sponge, etc.
}
```

**Why categories matter:** The category determines which formula variant the engine uses for Column G (final dough quantity) and Column C (total formula quantity). See §4.

### 3.4 Preferment

A pre-ferment is **not a separate entity the baker creates** — it is auto-derived from any `RecipeIngredient` row where `category == PREFERMENT`. When the baker adds `J = "Poolish", K = 100, Category = PREFERMENT`, the engine auto-generates the pre-ferment structure.

```
Preferment (auto-derived from RecipeIngredient where category == PREFERMENT) {
  // Inherited directly from the ingredient row:
  name: string                          // = ingredient.name (J column)
  base_qty: number                      // = ingredient.base_qty (K column)
  ingredient_id: uuid                   // = ingredient.id

  // Managed by the engine:
  enabled: boolean                      // toggle on/off without deleting the row
  type: PrefermentType                  // auto-suggested from name, or baker overrides

  // Optional: for chained builds (e.g. First Feed → Levain)
  base_source_ingredient_id: uuid|null  // if set, base_qty is derived from another
                                        // pre-ferment's calculated output instead of K

  // Baker's % inputs for each ingredient within this pre-ferment
  // are stored on: RecipeIngredient.preferment_bakers_pcts[this.ingredient_id]

  // ---- ALL CALCULATED ----
  // ratio: number                      // base_qty / sum(K_flours)
  // total_bakers_pct: number           // sum of all its Baker's %
  // quantities: {[ingredient_name]: number}
}
```

**Auto-creation:** Adding a PREFERMENT-category row → engine creates Preferment, suggests type from name, exposes Baker's % sub-column.

**Auto-deletion:** Deleting the ingredient row → engine removes the Preferment, removes Baker's % sub-column, recalculates.

**Disabling:** Toggling `enabled = false` → preserves all Baker's % inputs but sets ratio and all quantities to 0. Baker can re-enable without re-entering data.

### 3.5 Pre-ferment Types

```
enum PrefermentType {
  POOLISH         // Equal parts flour and water by weight, small yeast, 100% hydration
  BIGA            // Stiff Italian pre-ferment, ~50-60% hydration
  LEVAIN          // Sourdough culture build — can be liquid or stiff
  PATE_FERMENTEE  // "Old dough" — a piece of previous day's dough
  SPONGE          // Enriched pre-ferment with sugar/dairy
  FIRST_FEED      // Starter maintenance/refresh build
  CUSTOM          // User-defined
}
```

**Important:** The `type` is informational metadata. It does NOT change the math. All pre-ferments use the same universal formula. The type helps the UI suggest sensible defaults (e.g. Poolish defaults to 100% hydration).

### 3.6 MixerProfile

```
MixerProfile {
  id: uuid
  name: string                          // "Caplain", "Hobart A200", "KitchenAid Pro"
  type: enum                            // SPIRAL, PLANETARY, FORK, HAND
  friction_factor: number               // °C added during mixing
  speed_settings: [
    { speed: string, typical_duration_min: number }
  ]
}
```

### 3.7 FermentationStage

```
FermentationStage {
  id: uuid
  recipe_id: uuid
  stage_name: string
  order: integer
  target_temp: number                   // °C
  target_humidity: number | null        // % RH
  duration_min: number                  // minimum minutes
  duration_max: number | null           // maximum minutes (range)
  visual_cue: string | null
  notes: string | null
}
```

### 3.8 ProcessStep

```
ProcessStep {
  id: uuid
  recipe_id: uuid
  stage: ProcessStage                   // see enum below
  order: integer
  title: string
  description: string
  duration_min: number | null
  temperature: number | null            // °C
  mixer_speed: string | null
  ingredients_added: [string] | null    // which ingredients go in at this step
  notes: string | null
}

enum ProcessStage {
  PREFERMENT_BUILD, AUTOLYSE, MIXING, BULK_FERMENT,
  FOLD, DIVIDE, PRESHAPE, REST, SHAPE, PROOF,
  RETARD, BAKE, COOL, FINISH
}
```

### 3.9 RecipeVersion

```
RecipeVersion {
  id: uuid
  recipe_id: uuid
  version_number: integer
  snapshot: JSON                         // full serialized Recipe
  change_notes: string
  created_at: timestamp
  created_by: string | null
}
```

---

## 4. Core Calculation Engine

### 4.1 Terminology

Throughout this section:

```
flour_ingredients    = all ingredients where category == FLOUR
base_flour_qty       = sum of K values for flour_ingredients     // "SUM(K_flours)"
sum_all_bakers_pct   = sum of D values for ALL ingredients       // "D31" — includes pre-ferments
yield_per_piece      = Recipe.yield_per_piece                    // "B3"
num_pieces           = total_recipe_weight / yield_per_piece     // "C3"
total_recipe_weight  = sum of K values for ALL ingredients       // "K31"
```

### 4.2 Overall Baker's Percentage (Column D)

Each ingredient's Total Formula Quantity as a percentage of Total Formula Flour. This matches the Excel reference Column B — it reflects the ingredient's true proportion across all dough stages, including decomposed pre-ferment self-references:

```python
def calc_overall_bakers_pct(ingredient, all_ingredients, all_preferments):
    tfq = calc_total_formula_qty(ingredient, all_ingredients, all_preferments)  # after decomposition
    total_formula_flour = sum(
        calc_total_formula_qty(i, all_ingredients, all_preferments)
        for i in all_ingredients
        if i.category == FLOUR
    )
    if total_formula_flour == 0:
        return 0
    return tfq / total_formula_flour
```

**Note:** For the original sheet, Column D was used specifically as the "Poolish Baker's %" — a manually-entered input rather than a calculated value. In the generalized engine, the overall Baker's % is always calculated from Total Formula Quantities (after PF self-reference decomposition), and each pre-ferment's Baker's % is a separate input stored in `preferment_bakers_pcts`.

### 4.3 Pre-ferment Ratios

Each pre-ferment's ratio to total flour:

```python
def calc_preferment_ratio(preferment, all_ingredients):
    flour_total = sum(i.base_qty for i in all_ingredients if i.category == FLOUR)
    if flour_total == 0 or not preferment.enabled:
        return 0
    return preferment.base_qty / flour_total
```

### 4.4 Pre-ferment Internal Quantities (Columns M, O, Q, S)

**Universal formula — same for every pre-ferment:**

```python
def calc_preferment_qty(preferment, ingredient, all_ingredients):
    """
    How much of `ingredient` goes into `preferment`.
    """
    if not preferment.enabled or preferment.base_qty == 0:
        return 0

    bp = ingredient.preferment_bakers_pcts.get(preferment.id)
    if bp is None or bp == 0:
        return 0

    ratio = calc_preferment_ratio(preferment, all_ingredients)
    flour_total = sum(i.base_qty for i in all_ingredients if i.category == FLOUR)

    # Sum of all Baker's % within this pre-ferment
    pf_total_bp = sum(
        i.preferment_bakers_pcts.get(preferment.id, 0) or 0
        for i in all_ingredients
    )
    if pf_total_bp == 0:
        return 0

    return ((ratio * flour_total) / pf_total_bp) * bp
```

**This one formula replaces what was columns M, O, Q, and S in the sheet.** It works for any pre-ferment — Poolish, Levain, Biga, Sponge, or any custom type.

**Special case — First Feed / Starter maintenance:**
The First Feed used `M27` (Levain's calculated quantity) as its base instead of a ratio. To handle this generically:

```python
def calc_preferment_qty_v2(preferment, ingredient, all_ingredients, all_preferments):
    """
    Extended version that supports pre-ferments whose base is
    another pre-ferment's calculated quantity.
    """
    if not preferment.enabled:
        return 0

    # Check if this pre-ferment's base is derived from another
    if preferment.base_source_preferment_id:
        parent_pf = find_preferment(all_preferments, preferment.base_source_preferment_id)
        base_value = calc_preferment_qty(parent_pf, parent_pf.ingredient_row, all_ingredients)
    else:
        base_value = preferment.base_qty

    bp = ingredient.preferment_bakers_pcts.get(preferment.id, 0) or 0
    if bp == 0 or base_value == 0:
        return 0

    pf_total_bp = sum(
        i.preferment_bakers_pcts.get(preferment.id, 0) or 0
        for i in all_ingredients
    )
    if pf_total_bp == 0:
        return 0

    return (base_value / pf_total_bp) * bp
```

### 4.5 Pre-ferment Breakdown

Each enabled pre-ferment is decomposed into its constituent ingredients. This replaces the breakdown tables in rows 33–59 of the sheet.

```python
def calc_preferment_breakdown(preferment, all_ingredients, all_preferments):
    """
    Returns a dict of {ingredient_name: quantity} for everything
    that goes into this pre-ferment.
    """
    if not preferment.enabled:
        return {}

    breakdown = {}
    for ing in all_ingredients:
        qty = calc_preferment_qty_v2(preferment, ing, all_ingredients, all_preferments)
        if qty > 0:
            breakdown[ing.name] = qty

    return breakdown
```

### 4.6 Final Dough Quantity (Column G)

This calculates what goes directly into the final mix — the base recipe MINUS what's already been allocated to pre-ferments.

```python
def calc_final_dough_qty(ingredient, all_ingredients, all_preferments):
    """
    The amount of this ingredient that goes into the final dough mix.

    General principle:
      final_dough = base_qty
                  - sum(what each pre-ferment already provides of this ingredient)
                  + adjustments for pre-ferment flour/water contributions
    """
    K = ingredient.base_qty

    # Sum of what all enabled pre-ferments contribute of this ingredient
    pf_contributions = sum(
        calc_preferment_qty_v2(pf, ingredient, all_ingredients, all_preferments)
        for pf in all_preferments
        if pf.enabled
    )

    if ingredient.category == PREFERMENT:
        # Pre-ferment rows: their "final dough qty" IS their base_qty
        # (the whole pre-ferment goes into the final dough as a lump)
        return K

    if ingredient.category == FLOUR:
        # Flour in final dough = base qty (K)
        # The pre-ferment flour is ADDITIONAL (comes from the pre-ferment's own K value)
        # The sheet's G column for flour uses a complex rebalancing formula,
        # but it effectively means: flour that goes into the mixer = K value
        # because the pre-ferment flour comes via the pre-ferment addition.
        #
        # For the primary flour (where pre-ferments contain flour),
        # the sheet uses:
        # G6 = K6 + (E30 × D_flour) / D_all - (E31 - E_ingredients × D_flour_enrichment) / D_all
        #
        # In practice, with inactive pre-ferments, this simplifies to K6.
        # With active pre-ferments, the rebalancing accounts for flour
        # that arrives via the pre-ferment mass.
        return K

    if ingredient.category in [ENRICHMENT] and pf_contributions > 0:
        # Enrichments like butter, eggs: if some goes into a pre-ferment,
        # subtract that from what goes into final dough
        # Sheet example: G12 (Butter) = C12 - M12
        return max(0, K + pf_contributions - pf_contributions)
        # Typically simplifies to K, unless the total formula is recalculated

    # For LIQUID, LEAVENING, SEASONING, SWEETENER, FLAVORING, MIXIN:
    # The sheet's correction terms cancel out for most ingredients.
    # Final dough qty = base qty
    return K
```

**Important note on the rebalancing formulas:**

The original sheet had complex formulas in Column G that added and subtracted Poolish contributions. For most ingredients, these terms algebraically cancel to zero, leaving `G[i] = K[i]`. The complexity only matters when:
- Multiple pre-ferments are active simultaneously
- An ingredient appears in BOTH the base recipe (K) AND a pre-ferment's Baker's %

For the app, the cleaner approach is:

```python
def calc_final_dough_qty_v2(ingredient, all_ingredients, all_preferments):
    """
    Simplified: Final dough = Total formula - sum of all pre-ferment contributions.

    Total formula for an ingredient =
      K[i] (base recipe)
      + sum of breakdown contributions from pre-ferments that contain this ingredient
    """
    total_formula = calc_total_formula_qty(ingredient, all_ingredients, all_preferments)

    # Subtract what's already in each pre-ferment
    in_preferments = 0
    for pf in all_preferments:
        if pf.enabled and ingredient.category != PREFERMENT:
            breakdown = calc_preferment_breakdown(pf, all_ingredients, all_preferments)
            in_preferments += breakdown.get(ingredient.name, 0)

    return max(0, total_formula - in_preferments)
```

### 4.7 Total Formula Quantity (Column C)

The overall amount of each ingredient across ALL dough stages. Computed in two phases:

**Phase 1 — Direct contributions:**

```python
def calc_total_formula_qty(ingredient, all_ingredients, all_preferments):
    """
    Total formula = base qty + sum of pre-ferment contributions.

    For regular ingredients:
      C[i] = K[i] + sum(pre-ferment contributions of this ingredient)

    For PREFERMENT-category ingredients:
      C[i] = 0 (pre-ferments don't count in total formula)
    """
    if ingredient.category == PREFERMENT:
        return 0

    total = ingredient.base_qty

    # Add contributions from all pre-ferment breakdowns
    for pf in all_preferments:
        if pf.enabled:
            breakdown = calc_preferment_breakdown(pf, all_ingredients, all_preferments)
            total += breakdown.get(ingredient.name, 0)

    return total
```

**Phase 2 — Pre-ferment self-reference decomposition:**

When a pre-ferment references itself (e.g. Levain contains 0.25 BP of "Levain" = old starter), the self-referencing quantity represents old starter that itself contains flour, water, etc. For the Total Formula to be accurate, this self-quantity must be decomposed back into its constituent ingredients proportionally:

```python
def decompose_pf_self_references(total_formula_qtys, all_ingredients, all_preferments, pf_breakdowns):
    """
    Mutates total_formula_qtys in place. Must run AFTER final dough quantities
    are computed (so production values use the pre-decomposition TFQ).
    """
    for pf in all_preferments:
        self_qty = pf_breakdowns[pf.id].get(pf.id, 0)
        if self_qty <= 0:
            continue

        # Collect non-self, non-PREFERMENT ingredients with a BP in this PF
        contributors = []
        for ing in all_ingredients:
            if ing.id == pf.id or ing.category == PREFERMENT:
                continue
            bp = ing.preferment_bakers_pcts.get(pf.id)
            if bp and bp > 0:
                contributors.append((ing.id, bp))

        non_self_bp_total = sum(bp for _, bp in contributors)
        if non_self_bp_total <= 0:
            continue

        # Distribute self-qty proportionally among contributors
        for ing_id, bp in contributors:
            total_formula_qtys[ing_id] += self_qty * (bp / non_self_bp_total)
```

**Ordering matters:** Final dough quantities must be computed from the Phase 1 TFQ values (before decomposition) so that production quantities are unaffected. The decomposition only affects analytical values: Overall Baker's %, % of Total Flour, Hydration, and Pre-fermented Flour %.

### 4.8 Percentage of Total Flour (Column B)

```python
def calc_pct_of_total_flour(ingredient, all_ingredients, all_preferments):
    flour_total_formula = sum(
        calc_total_formula_qty(i, all_ingredients, all_preferments)
        for i in all_ingredients
        if i.category == FLOUR
    )
    if flour_total_formula == 0:
        return 0
    return calc_total_formula_qty(ingredient, all_ingredients, all_preferments) / flour_total_formula
```

### 4.9 Final Dough Baker's Percentage (Column F)

```python
def calc_final_dough_bakers_pct(ingredient, all_ingredients, all_preferments):
    flour_final_dough = sum(
        calc_final_dough_qty_v2(i, all_ingredients, all_preferments)
        for i in all_ingredients
        if i.category == FLOUR
    )
    if flour_final_dough == 0:
        return 0
    if ingredient.category == FLOUR:
        return ingredient.base_qty / sum(i.base_qty for i in all_ingredients if i.category == FLOUR)
    return ingredient.base_qty / flour_final_dough
```

### 4.10 Per-Item Weight (Column H)

```python
def calc_per_item_weight(ingredient, all_ingredients, all_preferments, recipe):
    G_total = sum(
        calc_final_dough_qty_v2(i, all_ingredients, all_preferments)
        for i in all_ingredients
    )
    if G_total == 0:
        return 0
    G_i = calc_final_dough_qty_v2(ingredient, all_ingredients, all_preferments)
    return G_i * recipe.yield_per_piece / G_total
```

### 4.11 Batch Quantity (Column I)

```python
def calc_batch_qty(ingredient, all_ingredients, all_preferments, recipe):
    per_item = calc_per_item_weight(ingredient, all_ingredients, all_preferments, recipe)
    num_pieces = sum(i.base_qty for i in all_ingredients) / recipe.yield_per_piece
    return per_item * num_pieces
```

### 4.12 Scaling Modes

The core engine calculates based on the recipe as entered. Scaling modes let the baker re-target production without editing K values.

```
enum ScalingMode {
  BY_PIECES           // "I need 200 panettones"
  BY_TOTAL_DOUGH      // "I need 15kg of dough"
  BY_TOTAL_FLOUR      // "I have 5kg of flour to use"
}
```

```python
def calc_scale_factor(recipe, all_ingredients, mode, target_value):
    """
    Returns a multiplier to apply to ALL quantities.
    The base recipe (K values) is scale_factor = 1.0.
    """
    if mode == BY_PIECES:
        current_pieces = sum(i.base_qty for i in all_ingredients) / recipe.yield_per_piece
        return target_value / current_pieces

    elif mode == BY_TOTAL_DOUGH:
        current_total = sum(i.base_qty for i in all_ingredients)
        return target_value / current_total

    elif mode == BY_TOTAL_FLOUR:
        current_flour = sum(i.base_qty for i in all_ingredients if i.category == FLOUR)
        if current_flour == 0:
            return 1.0
        return target_value / current_flour

    return 1.0


def apply_scale(recipe, all_ingredients, scale_factor):
    """
    Apply scale factor to get production quantities.
    Does NOT modify K values — scaling is a view layer, not a data mutation.
    """
    production = {}
    for ing in all_ingredients:
        production[ing.name] = {
            "final_dough": calc_final_dough_qty_v2(ing, ...) * scale_factor,
            "per_item": calc_per_item_weight(ing, ...) * scale_factor,
            "batch": calc_batch_qty(ing, ...) * scale_factor,
        }
    for pf in get_active_preferments(all_ingredients):
        breakdown = calc_preferment_breakdown(pf, ...)
        production[pf.name] = {
            name: qty * scale_factor for name, qty in breakdown.items()
        }
    return production
```

**Important:** Scaling is a **view layer** — it multiplies outputs, it does not change K values. The recipe definition stays the same. This keeps versioning clean and Baker's % stable.

### 4.13 Pre-fermented Flour Percentage

A key quality metric — what fraction of total flour is pre-fermented:

```python
def calc_prefermented_flour_pct(preferment, all_ingredients, all_preferments):
    """Pre-fermented flour % for a single pre-ferment."""
    if not preferment.enabled:
        return 0

    breakdown = calc_preferment_breakdown(preferment, all_ingredients, all_preferments)
    pf_flour = sum(
        qty for name, qty in breakdown.items()
        if find_ingredient(all_ingredients, name).category == FLOUR
    )
    total_flour = sum(
        calc_total_formula_qty(i, all_ingredients, all_preferments)
        for i in all_ingredients
        if i.category == FLOUR
    )
    if total_flour == 0:
        return 0
    return pf_flour / total_flour

def calc_total_prefermented_flour_pct(all_ingredients, all_preferments):
    """Total pre-fermented flour % across all active pre-ferments."""
    return sum(
        calc_prefermented_flour_pct(pf, all_ingredients, all_preferments)
        for pf in all_preferments
    )
```

### 4.14 Hydration

```python
def calc_hydration(all_ingredients, all_preferments):
    """
    Hydration = total water / total flour (by weight).
    Water only — per Advanced Bread and Pastry.
    """
    total_water = sum(
        calc_total_formula_qty(i, all_ingredients, all_preferments)
        for i in all_ingredients
        if i.category == LIQUID
    )
    total_flour = sum(
        calc_total_formula_qty(i, all_ingredients, all_preferments)
        for i in all_ingredients
        if i.category == FLOUR
    )
    if total_flour == 0:
        return 0
    return total_water / total_flour
```

### 4.15 Zero-Safety Guards

Every calculation function must implement:

```python
def safe_divide(numerator, denominator, default=0):
    if denominator == 0:
        return default
    return numerator / denominator
```

Apply this to every division operation. Never let a disabled pre-ferment, empty flour list, or zero-quantity ingredient crash the engine.

---

## 5. Pre-ferment System

### 5.1 Universal Pre-ferment Formula

All pre-ferments — regardless of type — use the same calculation:

```
ingredient_qty = (ratio × flour_total / pf_total_bakers_pct) × ingredient_bakers_pct
```

Where:
- `ratio = pf_base_qty / flour_total`
- `flour_total = sum of all FLOUR base quantities`
- `pf_total_bakers_pct = sum of all Baker's % within this pre-ferment`
- `ingredient_bakers_pct = this ingredient's Baker's % within this pre-ferment`

### 5.2 Enabling / Disabling

Since a pre-ferment IS an ingredient row, disabling works at the ingredient level:

```python
def toggle_preferment(recipe, ingredient_id, enabled):
    """Toggle a PREFERMENT-category ingredient on/off."""
    ing = find_ingredient(recipe, ingredient_id)
    assert ing.category == PREFERMENT
    ing.preferment_enabled = enabled
    recalculate_all(recipe)
```

Rules:
- Disabled: ratio = 0, all quantities = 0, but row stays visible
- All Baker's % inputs preserved when disabled (not cleared)
- K value preserved when disabled
- Re-enabling instantly restores all calculations
- Deleting the row permanently removes the pre-ferment and its Baker's % column

### 5.3 Pre-ferment Defaults by Type

When the baker creates a new pre-ferment, suggest defaults based on type:

| Type | Default Flour BP | Default Water BP | Default Yeast BP | Notes |
|------|-----------------|-----------------|-----------------|-------|
| POOLISH | 1.0 | 1.0 | 0.001 | 100% hydration |
| BIGA | 1.0 | 0.5–0.6 | 0.001 | Stiff Italian |
| LEVAIN | 1.0 | 0.5–1.0 | — | Sourdough, no yeast |
| PATE_FERMENTEE | 1.0 | 0.6 | 0.001 | Mimics the main dough |
| SPONGE | 1.0 | 0.6 | 0.01 | Enriched, more yeast |
| FIRST_FEED | 1.0 | 0.5–1.0 | — | Starter refresh |

These are suggestions only — the baker can change any value.

### 5.4 Dependent Pre-ferments (Chained Builds)

Some recipes have pre-ferments that feed into other pre-ferments (e.g. First Feed → Levain → Dough). Since pre-ferments are just ingredient rows, this is expressed as:

```
Ingredient row "First Feed" (PREFERMENT, K = 244)
  → base_source_ingredient_id points to the "Levain" ingredient row
  → Instead of using K directly, the engine uses the Levain's calculated
    self-referencing quantity (M27 in the original sheet) as the base
```

### 5.5 DAG Validation (Required)

Pre-ferment dependencies form a directed graph. The engine **must** validate this graph before calculating.

```python
def resolve_preferment_order(all_ingredients):
    """
    Topological sort of pre-ferments to determine calculation order.
    Raises error if circular dependency detected.
    """
    pf_ingredients = [i for i in all_ingredients if i.category == PREFERMENT]

    # Build adjacency: if PF_A depends on PF_B, edge from B → A
    graph = {pf.id: [] for pf in pf_ingredients}
    in_degree = {pf.id: 0 for pf in pf_ingredients}

    for pf in pf_ingredients:
        if pf.base_source_ingredient_id:
            parent_id = pf.base_source_ingredient_id
            if parent_id in graph:
                graph[parent_id].append(pf.id)
                in_degree[pf.id] += 1

    # Kahn's algorithm — topological sort
    queue = [pf_id for pf_id, deg in in_degree.items() if deg == 0]
    sorted_order = []

    while queue:
        current = queue.pop(0)
        sorted_order.append(current)
        for dependent in graph[current]:
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)

    if len(sorted_order) != len(pf_ingredients):
        raise CircularDependencyError(
            "Circular pre-ferment dependency detected. "
            "Check your chained build configuration."
        )

    return sorted_order  # calculate in this order


def recalculate_all(recipe):
    """Master recalculation — processes pre-ferments in dependency order."""
    pf_order = resolve_preferment_order(recipe.ingredients)

    # Calculate pre-ferments in topological order
    for pf_id in pf_order:
        calc_preferment_quantities(pf_id, recipe)

    # Then calculate final dough, per-item, batch for all ingredients
    for ing in recipe.ingredients:
        calc_final_dough_qty_v2(ing, recipe)
        calc_per_item_weight(ing, recipe)
        calc_batch_qty(ing, recipe)
```

**Rules:**
- Engine runs topological sort on every recalculation
- If cycle detected → reject the save, show error to baker
- Independent pre-ferments (no `base_source_ingredient_id`) have in-degree 0 and calculate first
- Dependent pre-ferments calculate after their parent

---

## 6. Water Temperature Calculator

### 6.1 Standard Formula (3-factor)

```
water_temp = (DDT × 3) - flour_temp - room_temp - friction_factor
```

### 6.2 Extended Formula (4-factor, with pre-ferment)

```
water_temp = (DDT × 4) - flour_temp - room_temp - preferment_temp - friction_factor
```

### 6.3 Implementation

```python
def calc_water_temp(ddt, room_temp, flour_temp, preferment_temp=None, friction_factor=0):
    temps = [room_temp, flour_temp, friction_factor]
    if preferment_temp is not None:
        temps.append(preferment_temp)
    factor_count = len(temps)
    water_temp = (ddt * factor_count) - sum(temps)

    warning = None
    if water_temp < 1:
        warning = "Use ice water. Target unachievable with liquid water alone."
        water_temp = max(water_temp, 0)  # show actual calc even if impractical
    elif water_temp > 43:
        warning = "Water too hot — will kill yeast above 43°C."
    return water_temp, warning
```

### 6.4 With Autolyse Adjustment

When autolyse is enabled, the dough partially equilibrates to room temp during the rest period before the friction-generating final mix occurs:

```python
def calc_water_temp_with_autolyse(ddt, room_temp, flour_temp, friction_factor, autolyse_min):
    # Post-autolyse dough temp drifts toward room temp
    initial_mix_temp = (flour_temp + room_temp) / 2  # minimal friction in autolyse
    drift = min(autolyse_min / 60, 1.0)
    post_autolyse_temp = initial_mix_temp + (room_temp - initial_mix_temp) * drift

    # In final mix, the "flour temp" is effectively the post-autolyse dough temp
    water_temp = (ddt * 3) - post_autolyse_temp - room_temp - friction_factor
    return water_temp
```

---

## 7. Friction Factor System

### 7.1 Defaults by Mixer Type

| Mixer Type | Friction Factor (°C) |
|-----------|---------------------|
| Spiral | 11–17 |
| Planetary | 6–11 |
| Fork | 3–6 |
| Hand | 0–3 |

### 7.2 Mix-Type Multiplier

| Mix Type | Multiplier |
|----------|-----------|
| Short Mix | 0.7× |
| Improved Mix | 1.0× |
| Intensive Mix | 1.3× |

```python
def effective_friction(mixer_profile, mix_type):
    multipliers = {"Short Mix": 0.7, "Improved Mix": 1.0, "Intensive Mix": 1.3}
    return mixer_profile.friction_factor * multipliers.get(mix_type, 1.0)
```

### 7.3 Calibration Over Time

```python
def calibrate_friction(ddt, water_temp_used, flour_temp, room_temp, actual_dough_temp, preferment_temp=None):
    """After a mix, calculate what the actual friction factor was."""
    temps = [water_temp_used, flour_temp, room_temp]
    if preferment_temp is not None:
        temps.append(preferment_temp)
    factor_count = len(temps)
    measured_friction = (actual_dough_temp * factor_count) - sum(temps)
    return measured_friction
```

---

## 8. Autolyse System

### 8.1 When Enabled

Flour and water are mixed first and rested before adding other ingredients.

### 8.2 What Goes Into Autolyse

```python
def calc_autolyse_split(recipe, all_ingredients, all_preferments):
    if not recipe.autolyse:
        return None

    autolyse = {}
    remaining = {}

    for ing in all_ingredients:
        fdq = calc_final_dough_qty_v2(ing, all_ingredients, all_preferments)
        if fdq <= 0:
            continue

        if ing.category == FLOUR:
            autolyse[ing.name] = fdq        # all flour goes into autolyse
        elif ing.category == LIQUID:
            autolyse[ing.name] = fdq        # all water goes into autolyse
        else:
            remaining[ing.name] = fdq       # everything else waits

    return {
        "autolyse_ingredients": autolyse,
        "autolyse_duration_min": recipe.autolyse_duration_min or 20,
        "final_mix_ingredients": remaining,
    }
```

### 8.3 Impact on Process Steps

When autolyse is enabled, the engine auto-inserts process steps:

1. **Autolyse Mix** — flour + water, 1st speed, until just combined
2. **Autolyse Rest** — cover, rest for `autolyse_duration_min`
3. **Final Mix** — add all remaining ingredients, proceed normally

---

## 9. Production Timeline & Fermentation Schedule

### 9.1 Forward Timeline

```python
def calc_forward_timeline(recipe, start_time):
    timeline = []
    current = start_time
    for stage in sorted(recipe.fermentation_stages, key=lambda s: s.order):
        entry = {
            "stage": stage.stage_name,
            "start": current,
            "end_earliest": current + timedelta(minutes=stage.duration_min),
            "end_latest": current + timedelta(minutes=stage.duration_max or stage.duration_min),
            "temp": stage.target_temp,
            "humidity": stage.target_humidity,
            "visual_cue": stage.visual_cue,
        }
        timeline.append(entry)
        current = entry["end_earliest"]
    return timeline
```

### 9.2 Reverse Timeline

"I want bread ready Saturday 8am — when do I start?"

```python
def calc_reverse_timeline(recipe, finish_time):
    timeline = []
    current = finish_time
    for stage in sorted(recipe.fermentation_stages, key=lambda s: -s.order):
        entry = {
            "stage": stage.stage_name,
            "end": current,
            "start_latest": current - timedelta(minutes=stage.duration_min),
            "start_earliest": current - timedelta(minutes=stage.duration_max or stage.duration_min),
        }
        timeline.append(entry)
        current = entry["start_latest"]
    return list(reversed(timeline))
```

---

## 10. Process / Method Steps

Steps are recipe-specific. The data model supports any sequence. Steps are linked to recipes and ordered.

```python
# Example: adding a step
ProcessStep(
    stage=MIXING,
    order=4,
    title="Mix Final Dough",
    description="Combine ripe levain with remaining flour and water...",
    mixer_speed="1st speed → 2nd speed",
    ingredients_added=["Bread flour", "Water", "Yeast", "Salt"],
    notes="Check water temperature. DDT target: {recipe.ddt}°C.",
)
```

No hard-coded steps — each recipe defines its own sequence. Seed recipes (§14) provide templates.

---

## 11. Loss & Waste Factor

### 11.1 Calculation

```python
def calc_adjusted_yield(desired_finished_weight, process_loss_pct, bake_loss_pct):
    return desired_finished_weight / ((1 - process_loss_pct) * (1 - bake_loss_pct))

def calc_batch_with_loss(recipe):
    raw_yield = calc_adjusted_yield(recipe.yield_per_piece, recipe.process_loss_pct, recipe.bake_loss_pct)
    return {
        "raw_yield_per_piece": raw_yield,
        "finished_yield_per_piece": recipe.yield_per_piece,
        "scale_factor": raw_yield / recipe.yield_per_piece,
    }
```

### 11.2 Example

80g finished, 3% process loss, 12% bake loss:
```
raw = 80 / (0.97 × 0.88) = 93.7g per piece
```

### 11.3 Typical Ranges

| Product Type | Process Loss | Bake Loss |
|-------------|-------------|-----------|
| Lean bread (baguette, batard) | 2–3% | 12–18% |
| Enriched bread (brioche, Panettone) | 2–4% | 8–12% |
| Pastry (croissant) | 3–5% | 10–15% |
| Pizza | 1–2% | 8–12% |

---

## 12. Recipe Versioning

### 12.1 Save with Version

```python
def save_recipe(recipe, change_notes):
    recipe.version += 1
    recipe.updated_at = now()
    version = RecipeVersion(
        recipe_id=recipe.id,
        version_number=recipe.version,
        snapshot=serialize(recipe),
        change_notes=change_notes,
        created_at=now(),
    )
    db.save(recipe)
    db.save(version)
```

### 12.2 Diff Between Versions

**Critical: Match ingredients by UUID, not by name.** Name-based matching breaks when a baker renames "WW Flour" → "Whole Wheat Flour" — the system would incorrectly log a removal + addition instead of a rename.

```python
def diff_versions(version_a, version_b):
    a = deserialize(version_a.snapshot)
    b = deserialize(version_b.snapshot)
    changes = []

    # Build lookup by stable UUID
    a_by_id = {i.id: i for i in a.ingredients}
    b_by_id = {i.id: i for i in b.ingredients}

    a_ids = set(a_by_id.keys())
    b_ids = set(b_by_id.keys())

    # Truly new ingredients (UUID not in previous version)
    for uid in b_ids - a_ids:
        ing = b_by_id[uid]
        changes.append({"type": "added", "ingredient_id": uid, "name": ing.name})

    # Truly removed ingredients (UUID not in new version)
    for uid in a_ids - b_ids:
        ing = a_by_id[uid]
        changes.append({"type": "removed", "ingredient_id": uid, "name": ing.name})

    # Existing ingredients — check for modifications
    for uid in a_ids & b_ids:
        ing_a = a_by_id[uid]
        ing_b = b_by_id[uid]

        # Detect rename
        if ing_a.name != ing_b.name:
            changes.append({
                "type": "renamed", "ingredient_id": uid,
                "old_name": ing_a.name, "new_name": ing_b.name,
            })

        # Detect field changes
        for field in ["base_qty", "category", "sort_order"]:
            old_val = getattr(ing_a, field)
            new_val = getattr(ing_b, field)
            if old_val != new_val:
                changes.append({
                    "type": "modified", "ingredient_id": uid,
                    "name": ing_b.name, "field": field,
                    "old": old_val, "new": new_val,
                })

        # Compare pre-ferment Baker's % changes
        all_pf_ids = set(
            list(ing_a.preferment_bakers_pcts.keys()) +
            list(ing_b.preferment_bakers_pcts.keys())
        )
        for pf_id in all_pf_ids:
            old_val = ing_a.preferment_bakers_pcts.get(pf_id)
            new_val = ing_b.preferment_bakers_pcts.get(pf_id)
            if old_val != new_val:
                changes.append({
                    "type": "modified", "ingredient_id": uid,
                    "name": ing_b.name,
                    "field": f"preferment_{pf_id}_bakers_pct",
                    "old": old_val, "new": new_val,
                })

    # Global params
    for field in ["yield_per_piece", "ddt", "autolyse", "autolyse_duration_min",
                   "process_loss_pct", "bake_loss_pct", "mix_type", "mixer_profile_id"]:
        old_val = getattr(a, field, None)
        new_val = getattr(b, field, None)
        if old_val != new_val:
            changes.append({
                "type": "param_changed", "field": field,
                "old": old_val, "new": new_val,
            })

    return changes
```

**Key rules:**
- Ingredient identity = UUID, assigned at creation, never changes
- Renaming an ingredient does NOT change its UUID
- Diff detects renames as a distinct change type ("renamed"), not remove + add
- Pre-ferment Baker's % changes tracked per-ingredient per-pre-ferment

---

## 13. Complete Formula Reference

Quick-reference: every output the engine produces.

| Output | What | Formula | Depends On |
|--------|------|---------|------------|
| Overall Baker's % | TFQ[i] / SUM(TFQ_flours) | §4.2 | Total formula (after decomposition) |
| Pre-ferment ratio | PF_base_qty / SUM(K_flours) | §4.3 | K, PF.base_qty |
| Pre-ferment qty | (ratio × flour / PF_total_BP) × BP[i] | §4.4 | K, PF Baker's % |
| Total formula qty | K[i] + sum(PF breakdowns for i) + PF self-ref decomposition | §4.7 | K, PF breakdowns |
| Final dough qty | Total formula - sum(PF contributions) | §4.6 | K, all PF qtys |
| % of total flour | Total_formula[i] / SUM(Total_formula_flours) | §4.8 | Total formula |
| Final dough Baker's % | K[i] / SUM(Final_dough_flours) | §4.9 | K, final dough |
| Per-item weight | Final_dough[i] × yield / G_total | §4.10 | Final dough, yield |
| Batch qty | Per_item[i] × num_pieces | §4.11 | Per-item, num_pieces |
| Scale factor | target / current (by mode) | §4.12 | Scaling mode, target |
| Pre-fermented flour % | PF_flour / Total_flour | §4.13 | PF breakdown, total |
| Hydration | Total_water / Total_flour | §4.14 | Total formula |
| Water temp | (DDT × N) - temps - friction | §6 | DDT, env, mixer |
| Adjusted yield | yield / ((1-process_loss)(1-bake_loss)) | §11 | yield, loss % |

**The K model (decided):** K = final dough / base recipe quantity. Pre-ferments add mass on top. Total formula ≥ K. This matches the original spreadsheet behavior and the baker's mental model.

**All inputs reduce to:**
- **J** — ingredient names
- **K** — ingredient quantities in grams (final dough amounts)
- **Category** — per ingredient (set once)
- **Pre-ferment Baker's %** — per ingredient per pre-ferment (only when PREFERMENT rows exist)
- **Recipe settings** — yield per piece, DDT, autolyse, loss factors, mixer profile

---

## 14. Seed Recipes

### 14.1 Panettone (verified against production spreadsheet)

```json
{
  "name": "Panettone",
  "yield_per_piece": 80,
  "ddt": 24,
  "autolyse": false,
  "mix_type": "Improved Mix",
  "process_loss_pct": 0.03,
  "bake_loss_pct": 0.12,
  "ingredients": [
    {"name": "Bread flour",         "category": "FLOUR",       "K": 234  },
    {"name": "Butter",              "category": "ENRICHMENT",  "K": 357  },
    {"name": "Water",               "category": "LIQUID",      "K": 322  },
    {"name": "Salt",                "category": "SEASONING",   "K": 14   },
    {"name": "Honey",               "category": "SWEETENER",   "K": 54   },
    {"name": "Sugar",               "category": "SWEETENER",   "K": 234  },
    {"name": "Egg Yolks",           "category": "ENRICHMENT",  "K": 70   },
    {"name": "Candied lemon peel",  "category": "MIXIN",       "K": 124  },
    {"name": "Candied orange peel", "category": "MIXIN",       "K": 357  },
    {"name": "Raisins",             "category": "MIXIN",       "K": 357  },
    {"name": "Vanilla Bean",        "category": "FLAVORING",   "K": 2.5  },
    {"name": "Orange Peel",         "category": "FLAVORING",   "K": 1.5  }
  ],
  "preferments": [
    {
      "name": "Levain",
      "type": "LEVAIN",
      "enabled": true,
      "base_qty": 2413,
      "bakers_pcts": {
        "Bread flour": 1.0,
        "Butter": 0.24,
        "Water": 0.55,
        "Yeast": 0.003,
        "Malt": 0.02,
        "Sugar": 0.24,
        "Egg Yolks": 0.16,
        "Levain": 0.25
      }
    },
    {
      "name": "First Feed",
      "type": "FIRST_FEED",
      "enabled": true,
      "base_source": "Levain",
      "bakers_pcts": {
        "Bread flour": 1.0,
        "Water": 0.5,
        "Levain": 1.0
      }
    }
  ]
}
```

### 14.2 French Baguette (simple lean dough)

```json
{
  "name": "French Baguette",
  "yield_per_piece": 350,
  "ddt": 24,
  "autolyse": true,
  "autolyse_duration_min": 20,
  "mix_type": "Short Mix",
  "process_loss_pct": 0.02,
  "bake_loss_pct": 0.15,
  "ingredients": [
    {"name": "Bread flour",  "category": "FLOUR",      "K": 1000 },
    {"name": "Water",        "category": "LIQUID",      "K": 700  },
    {"name": "Salt",         "category": "SEASONING",   "K": 20   },
    {"name": "Yeast",        "category": "LEAVENING",   "K": 3    }
  ],
  "preferments": [
    {
      "name": "Poolish",
      "type": "POOLISH",
      "enabled": true,
      "base_qty": 400,
      "bakers_pcts": {
        "Bread flour": 1.0,
        "Water": 1.0,
        "Yeast": 0.001
      }
    }
  ]
}
```

### 14.3 Country Sourdough (two flours, one levain)

```json
{
  "name": "Country Sourdough Batard",
  "yield_per_piece": 800,
  "ddt": 24,
  "autolyse": true,
  "autolyse_duration_min": 30,
  "mix_type": "Short Mix",
  "process_loss_pct": 0.02,
  "bake_loss_pct": 0.16,
  "ingredients": [
    {"name": "Bread flour",    "category": "FLOUR",      "K": 850  },
    {"name": "WW Flour",       "category": "FLOUR",      "K": 150  },
    {"name": "Water",          "category": "LIQUID",      "K": 750  },
    {"name": "Salt",           "category": "SEASONING",   "K": 20   }
  ],
  "preferments": [
    {
      "name": "Liquid Levain",
      "type": "LEVAIN",
      "enabled": true,
      "base_qty": 200,
      "bakers_pcts": {
        "Bread flour": 1.0,
        "Water": 1.0,
        "Liquid Levain": 0.2
      }
    }
  ]
}
```

### 14.4 Brioche (enriched, sponge method)

```json
{
  "name": "Brioche",
  "yield_per_piece": 60,
  "ddt": 22,
  "autolyse": false,
  "mix_type": "Intensive Mix",
  "process_loss_pct": 0.03,
  "bake_loss_pct": 0.10,
  "ingredients": [
    {"name": "Bread flour",  "category": "FLOUR",       "K": 1000 },
    {"name": "Eggs",         "category": "ENRICHMENT",   "K": 500  },
    {"name": "Butter",       "category": "ENRICHMENT",   "K": 500  },
    {"name": "Sugar",        "category": "SWEETENER",    "K": 120  },
    {"name": "Salt",         "category": "SEASONING",    "K": 20   },
    {"name": "Yeast",        "category": "LEAVENING",    "K": 30   },
    {"name": "Milk",         "category": "LIQUID",        "K": 50   }
  ],
  "preferments": [
    {
      "name": "Sponge",
      "type": "SPONGE",
      "enabled": true,
      "base_qty": 400,
      "bakers_pcts": {
        "Bread flour": 1.0,
        "Milk": 0.5,
        "Yeast": 0.03,
        "Sugar": 0.1
      }
    }
  ]
}
```

These seed recipes demonstrate that the same engine handles lean, enriched, sourdough, and multi-stage doughs with zero code changes — only data changes.