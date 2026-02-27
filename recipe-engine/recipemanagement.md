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
| Any number of pre-ferments with self-reference decomposition | §5 |
| Pre-ferment calculation ordering | §5.4 |
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

Step 4: (Optional) Enable autolyse, configure loss factors
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
  autolyse_overrides: object            // sparse map { ingredient_id: 'autolyse' | 'final' }
                                        // only stores non-default positions; empty {} = all defaults

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
  ddt: number | null                    // per-PF DDT in °C; null = inherit recipe DDT
  fermentation_duration_min: integer | null  // fermentation time in minutes; null = use type default

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
  CUSTOM          // User-defined
}
```

**Important:** The `type` is informational metadata. It does NOT change the math. All pre-ferments use the same universal formula. The type helps the UI suggest sensible defaults (e.g. Poolish defaults to 100% hydration).

### 3.6 MixerProfile

```
MixerProfile {
  id: uuid
  user_id: uuid
  name: string                          // "Caplain", "Haussler", "Bhk"
  type: enum                            // SPIRAL, PLANETARY, OBLIQUE, FORK, HAND
  friction_factor: number               // base °C added during mixing
  first_speed_rpm: number               // 1st speed RPM
  second_speed_rpm: number              // 2nd speed RPM
  calibrations: [MixerCalibration]      // per mix-type 1st speed rounds
}
```

### 3.6.1 MixerCalibration

```
MixerCalibration {
  id: uuid
  mixer_id: uuid
  mix_type: string                      // "Improved Mix", "Intensive Mix", "Short Improved"
  first_speed_rounds: number            // revolutions at 1st speed for this mix type
  // UNIQUE(mixer_id, mix_type)
}
```

### 3.6.2 MixType (System Constants)

| Mix Type | Target Rounds | Friction Mult | Has 2nd Speed |
|----------|--------------|---------------|---------------|
| Short Mix | 600 | 0.7× | No |
| Improved Mix | 1000 | 1.0× | Yes |
| Intensive Mix | 1600 | 1.3× | Yes |
| Short Improved | 400 | 0.5× | Yes |

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
  PREFERMENT_BUILD, AUTOLYSE, FERMENTOLYSE, MIXING,
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

Each ingredient's **total formula quantity** as a percentage of total formula flour. This uses TFQ (not K), so pre-ferment contributions are included and PREFERMENT-category rows show 0%:

```python
def calc_overall_bakers_pct(ingredient, all_ingredients, all_preferments):
    total_formula_flour = sum(
        calc_total_formula_qty(i, all_ingredients, all_preferments)
        for i in all_ingredients
        if i.category == FLOUR
    )
    if total_formula_flour == 0:
        return 0
    tfq = calc_total_formula_qty(ingredient, all_ingredients, all_preferments)
    return tfq / total_formula_flour
```

**Note:** This matches the spreadsheet's Column C behavior. PREFERMENT rows have TFQ = 0, so their Overall BP = 0%. Water shows true hydration (e.g. 75% for a baguette). Each pre-ferment's Baker's % is a separate input stored in `preferment_bakers_pcts`.

### 4.3 Pre-ferment Ratio

The ratio of a pre-ferment's total weight (K) to the recipe's total flour weight. Tells the baker what proportion of their flour base the pre-ferment represents — a quick sanity check that the PF size is appropriate for the formula.

```python
def calc_preferment_ratio(preferment, all_ingredients):
    flour_total = sum(i.base_qty for i in all_ingredients if i.category == FLOUR)
    if flour_total == 0 or not preferment.enabled:
        return 0
    return preferment.base_qty / flour_total
```

**Example:** French Baguette — Poolish K = 400g, Bread flour K = 1000g → ratio = 40%. This means the poolish weighs 40% of the total flour, which is typical for a poolish-based baguette.

**Display:** Stored as a decimal (0.40), displayed as a percentage (40.00%) in the UI for consistency with other Baker's % values.

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

The overall amount of each ingredient across ALL dough stages:

```python
def calc_total_formula_qty(ingredient, all_ingredients, all_preferments):
    """
    Total formula = what's in final dough + what's in all pre-ferments.

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

**Self-reference decomposition (§4.7.1):** When a pre-ferment references itself (e.g. Levain contains 0.25 BP of "Levain" = old starter seed), the self-referencing quantity is decomposed proportionally among the non-self, non-PF contributors based on their Baker's % within that pre-ferment. This ensures accurate analytical values (hydration, % of total flour, pre-fermented flour %). Production values (final dough, per-item, batch) are computed from pre-decomposition TFQ and are unaffected.

```python
# Self-reference decomposition — runs after TFQ and finalDoughQtys,
# before totalFormulaFlour calculation
for pf in preferment_ingredients:
    self_qty = pf_breakdowns[pf.id].get(pf.id, 0)
    if self_qty <= 0:
        continue

    non_self_bp_total = 0
    contributors = []
    for ing in all_ingredients:
        if ing.id == pf.id or ing.category == PREFERMENT:
            continue
        bp = ing.preferment_bakers_pcts.get(pf.id, 0)
        if bp > 0:
            contributors.append((ing.id, bp))
            non_self_bp_total += bp

    if non_self_bp_total <= 0:
        continue

    for (ing_id, bp) in contributors:
        total_formula_qtys[ing_id] += self_qty * (bp / non_self_bp_total)
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

These are suggestions only — the baker can change any value.

#### Auto-seeding on Creation

When the baker adds a PREFERMENT ingredient and selects its type, the UI auto-seeds existing recipe ingredients into the pre-ferment breakdown:

1. Scan the recipe for the first ingredient matching each required category:
   - Yeast-based types (POOLISH, BIGA, PATE_FERMENTEE, SPONGE): FLOUR, LIQUID, LEAVENING
   - LEVAIN: FLOUR, LIQUID (no leavening — sourdough culture is the PF itself)
   - CUSTOM: nothing seeded
2. For each matched ingredient, set its Baker's % for this PF to the default from the table above
3. When the baker enters the PF's total grams (`base_qty`), distribute grams proportionally:
   ```
   total_bp = sum of all Baker's % for this PF
   grams[i] = (bp[i] / total_bp) × base_qty
   ```
   Rounding drift is absorbed by the flour ingredient.

Only existing recipe ingredients are seeded — the system never auto-creates ingredients.

### 5.4 Pre-ferment Calculation Order

All pre-ferments are independent — they each use their own `base_qty` (K column) as the base value. The engine calculates them in ingredient order.

```python
def resolve_preferment_order(all_ingredients):
    """Returns pre-ferment IDs in ingredient order."""
    return [i.id for i in all_ingredients if i.category == PREFERMENT]

def recalculate_all(recipe):
    """Master recalculation — processes all pre-ferments then derives everything else."""
    pf_order = resolve_preferment_order(recipe.ingredients)

    for pf_id in pf_order:
        calc_preferment_quantities(pf_id, recipe)

    for ing in recipe.ingredients:
        calc_final_dough_qty_v2(ing, recipe)
        calc_per_item_weight(ing, recipe)
        calc_batch_qty(ing, recipe)
```

### 5.5 Per-Preferment DDT & Fermentation Duration

Each pre-ferment can have its own **DDT** and **fermentation duration**, stored in `preferment_settings`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ddt` | `REAL \| null` | `null` (inherit recipe DDT) | Target dough temperature for this PF build |
| `fermentation_duration_min` | `INTEGER \| null` | `null` (use type default) | How long this PF ferments before the main mix |

**Fermentation duration defaults by type:**

| Type | Default Duration |
|------|-----------------|
| POOLISH | 12h (720 min) |
| BIGA | 16h (960 min) |
| LEVAIN | 8h (480 min) |
| PATE_FERMENTEE | 12h (720 min) |
| SPONGE | 4h (240 min) |
| CUSTOM | 8h (480 min) |

**Inheritance rules:**
- `ddt = null` → uses the recipe-level DDT
- `fermentation_duration_min = null` → uses the type default from the table above
- Explicit values override the defaults

**Production page usage:** The production page uses these values to compute:
1. **Water temperature** for each PF (2-factor: `water = DDT × 2 − flour_temp − room_temp`, since PFs are hand-mixed with no friction)
2. **Start time** = `target_mix_time − fermentation_duration`

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

## 7. Mixing & Friction System (Rounds-Based)

**Mix type is a recipe-level design decision** — it defines the target gluten development and determines the friction multiplier. The recipe author selects a mix type (Short Mix, Improved Mix, Intensive Mix, Short Improved) when creating or editing the formula; it is stored in the `recipes.mix_type` column (default: Improved Mix).

**Mixer selection is a production-time decision.** The same recipe may be mixed on different mixers depending on batch size, equipment availability, or baker preference. The baker selects a mixer on the **Production page** when preparing to mix — the engine then combines the recipe's mix type with the selected mixer's calibration data to compute friction, water temperature adjustment, and mixing durations for that session.

### 7.1 Friction Factor Defaults by Mixer Type

| Mixer Type | Friction (°C) | 1st RPM | 2nd RPM | Notes |
|-----------|--------------|---------|---------|-------|
| SPIRAL | 14 | 105 | 204 | Most common bakery mixer |
| OBLIQUE | 8 | 40 | 80 | Gentle action, long mix times |
| PLANETARY | 8 | 80 | 160 | Varies widely by model/size (see note) |
| FORK | 5 | 40 | 80 | Low-speed, gentle |
| HAND | 2 | 0 | 0 | No timer computation |

**Note on planetary mixers:** RPMs vary significantly by model and bowl size. A 20-qt Hobart runs ~107/198 RPM while a 60-qt runs ~70/124 RPM. The defaults above are mid-range starting points — bakers should check their mixer's technical manual and enter actual RPMs.

### 7.2 Mix Types, Target Rounds & Friction Multipliers

| Mix Type | Target Rounds (2nd) | Friction Mult | Has 2nd Speed |
|----------|--------------------|---------------|---------------|
| Short Mix | 600 | 0.7× | No — 1st speed only |
| Improved Mix | 1000 | 1.0× | Yes |
| Intensive Mix | 1600 | 1.3× | Yes |
| Short Improved | 400 | 0.5× | Yes |

```javascript
effective_friction = friction_factor × friction_mult
```

### 7.2.1 Mix Type Characteristics (Reference)

Each mix type produces different bread characteristics due to the interplay between gluten development, oxidation, and fermentation time. This table summarizes the textbook guidelines for a standard lean dough:

| Characteristic | Short Mix | Improved Mix | Intensive Mix |
|---------------|-----------|-------------|--------------|
| Gluten development | Underdeveloped | Partial | Full |
| Typical hydration | 70% | 67% | 65% |
| Typical yeast (fresh) | 0.5% | 1.5% | 2.0% |
| 1st fermentation | 3.5 hours | 1.5 hours | 20 minutes |
| Folds during bulk | 3 | 0–1 | 0 |
| Final proof | 45–60 min | 60–90 min | 90–120 min |
| Crumb color | Cream (carotenoids preserved) | Light cream | White (oxidized) |
| Flavor | Complex (long fermentation) | Good | Mild (limited fermentation) |
| Shelf life | Best (acidity development) | Good | Shortest |

Notes:
- Higher hydration in Short/Improved compensates for the extensibility needed during folds.
- Lower yeast in Short Mix prevents over-fermentation during the long bulk.
- Water temperature decreases from Short → Intensive to compensate for increasing mixing friction.
- These are guidelines for lean dough. Enriched dough (brioche, panettone) follows different rules.

### 7.3 Rounds-Based Mixing Timer

Each mixer profile stores calibrated **1st-speed rounds** per mix type. The engine computes durations:

**For Improved Mix, Intensive Mix, Short Improved:**
```
1st_speed_min = calibration[mix_type].first_speed_rounds / first_speed_rpm
2nd_speed_min = MIX_TYPES[mix_type].target_rounds / second_speed_rpm
```

**For Short Mix (1st speed only):**
```
1st_speed_min = (calibration['Improved Mix'].first_speed_rounds + 600) / first_speed_rpm
2nd_speed_min = 0
```

**Verification table (Caplain: rpm1=105, rpm2=204):**

| Mix Type | 1st Rounds | 1st Min | 2nd Rounds | 2nd Min | Total |
|----------|-----------|---------|-----------|---------|-------|
| Short Mix | 420+600=1020 | 9.7 | 0 | 0.0 | 9.7 |
| Improved Mix | 420 | 4.0 | 1000 | 4.9 | 8.9 |
| Intensive Mix | 525 | 5.0 | 1600 | 7.8 | 12.8 |
| Short Improved | 525 | 5.0 | 400 | 2.0 | 7.0 |

#### 7.3.1 Clarification — Incorporation vs. Development

The target rounds (600, 1000, 1600) represent gluten development only. Every mix also requires a separate incorporation phase in 1st speed where ingredients are hydrated and gluten begins to form. This incorporation phase is what the calibrated `first_speed_rounds` per mix type represents.

The textbook standard for incorporation is 4–5 minutes at 1st speed (roughly 400–500 rounds on a spiral at 100 RPM). Our per-mixer calibrations capture this precisely — e.g., the Caplain uses 420 rounds (4.0 min) for Improved Mix incorporation and 525 rounds (5.0 min) for Intensive Mix.

**Verification against textbook (Suas, Ch. 3) — spiral mixer at 100/200 RPM:**

| Mix Type | Textbook | Our Formula | Match |
|----------|---------|------------|-------|
| Short Mix | 4–5 min incorp + 6 min dev = 10–11 min (all 1st) | (450+600)/100 = 10.5 min | ✓ |
| Improved | 4–5 min incorp (1st) + 1000/200 = 5 min (2nd) | 450/100=4.5 + 1000/200=5.0 | ✓ |
| Intensive | 4–5 min incorp (1st) + 1600/200 = 8 min (2nd) | 500/100=5.0 + 1600/200=8.0 | ✓ |

**Cross-mixer verification — oblique at 40/80 RPM:**

| Mix Type | Textbook | Computed | Match |
|----------|---------|---------|-------|
| Short Mix | 4–5 min incorp + 600/40 = 15 min dev = 19–20 min (all 1st) | (180+600)/40 = 19.5 min | ✓ |
| Improved | 4–5 min incorp (1st) + 1000/80 = 12.5 min (2nd) | 180/40=4.5 + 1000/80=12.5 | ✓ |
| Intensive | 4–5 min incorp (1st) + 1600/80 = 20 min (2nd) | 180/40=4.5 + 1600/80=20.0 | ✓ |

### 7.4 Calibration Over Time

After a mix, back-calculate the actual friction factor from measured temperatures:

```javascript
actual_friction = (actual_dough_temp × factor_count) - sum(water, flour, room [, preferment])
```

Compare with the mixer profile's `friction_factor × friction_mult` — track drift over time.

### 7.5 Adding a Mixer — User Flow

1. Name the mixer (e.g. "Caplain Spiral")
2. Choose type → pre-fills defaults from §7.1
3. Adjust friction factor, RPMs if needed
4. Enter calibrated 1st-speed rounds for Improved, Intensive, Short Improved
5. Short Mix is auto-derived (Improved rounds + 600)

### 7.6 Seed Mixer Profiles

| Mixer | Type | Friction | RPM1 | RPM2 | Improved 1st | Intensive 1st | Short Improved 1st |
|-------|------|---------|------|------|-------------|--------------|-------------------|
| Caplain | SPIRAL | 12 | 105 | 204 | 420 | 525 | 525 |
| Haussler | SPIRAL | 14 | 130 | 180 | 455 | 455 | 520 |
| Bhk | SPIRAL | 10 | 150 | 300 | 420 | 450 | 525 |

### 7.8 Double Hydration Technique

For super-hydrated doughs (ciabatta, pugliese, francese — typically >80% hydration), water can be incorporated in two phases:

1. **Phase 1:** Add enough water at the start to make a medium-soft dough (~65–68% hydration). Mix normally through 1st speed incorporation.
2. **Development:** Develop gluten to approximately two-thirds of target development in 2nd speed.
3. **Phase 2:** With the mixer running in 1st speed, slowly add the remaining water in small additions until fully absorbed.

This technique produces very soft dough with sufficient strength for machine handling. It is not currently modeled in the engine's mixing timer — the baker manages it through process steps (§10). A future enhancement could add a `double_hydration` flag to the recipe that splits the LIQUID quantities into two phases and adjusts the mixing timer accordingly.

---

## 8. Autolyse System

### 8.1 When Enabled

Autolyse is a technique developed by Professor Raymond Calvel in which flour and water are mixed briefly and rested before adding other ingredients. During the rest, flour proteins hydrate more fully (improving gluten structure) and protease enzymes naturally present in the flour degrade some gluten bonds, making the dough more extensible and easier to work. A minimum of 15–20 minutes is required for enzyme activation; rests can extend to 60 minutes for bulk dough.

Salt and yeast are excluded from the autolyse by default because both counter its effects: salt slows protease activity, while yeast-driven fermentation creates acidity that increases dough strength and reduces extensibility.

### 8.2 What Goes Into Autolyse

**Defaults:** FLOUR and LIQUID go into autolyse. Enabled PREFERMENT ingredients are initially classified by consistency: liquid PFs (Poolish, Levain) default to autolyse, stiff PFs (Biga, Pâte Fermentée, Sponge, Custom) default to final mix. A post-pass then refines liquid PF placement — Poolish uses a water-ratio threshold, Levain uses the sourdough decision matrix (§8.4). Everything else goes into the final mix. Disabled preferments are excluded entirely.

**Overrides:** The baker can drag any ingredient — including preferments — between the Autolyse Mix and Final Mix lists in the UI. Overrides are stored as a sparse map on the recipe (`autolyse_overrides`). Only non-default positions are stored — moving an ingredient back to its default list deletes the override entry. This means an empty `{}` = all engine defaults.

**Precedence rules:**
1. PREFERMENT with `enabled !== true` → skip (not active)
2. `overrides[ing.id] === 'autolyse'` → autolyse list
3. `overrides[ing.id] === 'final'` → final mix list
4. `ing.category === FLOUR or LIQUID` → autolyse list (engine default)
5. `ing.category === PREFERMENT` and liquid type (POOLISH, LEVAIN) → autolyse list (engine default)
6. `ing.category === PREFERMENT` and stiff type (BIGA, PATE_FERMENTEE, SPONGE, CUSTOM) → final mix list (engine default)
7. else → final mix list (engine default)

```python
LIQUID_PF_TYPES = {'POOLISH', 'LEVAIN'}

def calc_autolyse_split(recipe, all_ingredients, all_preferments, overrides={}):
    if not recipe.autolyse:
        return None

    autolyse = []
    remaining = []

    for ing in all_ingredients:
        fdq = calc_final_dough_qty_v2(ing, all_ingredients, all_preferments)
        if fdq <= 0:
            continue

        # Skip disabled preferments
        if ing.category == PREFERMENT:
            if not ing.preferment_settings.get('enabled'):
                continue

        item = { "id": ing.id, "name": ing.name, "qty": fdq }

        if overrides.get(ing.id) == 'autolyse':
            autolyse.append(item)
        elif overrides.get(ing.id) == 'final':
            remaining.append(item)
        elif ing.category in (FLOUR, LIQUID):
            autolyse.append(item)
        elif ing.category == PREFERMENT:
            # §8.4: liquid PFs → autolyse, stiff PFs → final mix
            if ing.preferment_settings.get('type') in LIQUID_PF_TYPES:
                autolyse.append(item)
            else:
                remaining.append(item)
        else:
            remaining.append(item)

    return {
        "autolyse_ingredients": autolyse,           # array of { id, name, qty }
        "autolyse_duration_min": recipe.autolyse_duration_min or 20,
        "final_mix_ingredients": remaining,          # array of { id, name, qty }
    }
```

### 8.3 Impact on Process Steps

When autolyse is enabled, the engine auto-inserts process steps. The stage and labels depend on whether a preferment ends up in the autolyse group (see §8.5 Fermentolyse):

**Pure autolyse** (no preferment in autolyse group):
1. **Autolyse Mix** (stage: `AUTOLYSE`) — flour, water, 1st speed, until just combined
2. **Autolyse Rest** (stage: `AUTOLYSE`) — cover, rest for `autolyse_duration_min`
3. **Final Mix** (stage: `MIXING`) — add salt, yeast, preferments, and all remaining ingredients

**Fermentolyse** (a preferment is in the autolyse group):
1. **Fermentolyse Mix** (stage: `FERMENTOLYSE`) — flour, water, and levain/poolish, 1st speed, until just combined
2. **Fermentolyse Rest** (stage: `FERMENTOLYSE`) — cover and rest; fermentation begins during rest
3. **Final Mix** (stage: `MIXING`) — add remaining ingredients

The baker can customize these steps via the Process Steps editor (§10). The auto-generated steps serve as a starting template based on the textbook-standard sequence.

### 8.4 Preferment Handling During Autolyse

The autolyse split (§8.2) includes enabled preferments in the ingredient lists. After initial per-ingredient classification places all liquid PFs (Poolish, Levain) into AUTOLYSE, a post-pass refines the placement based on PF type:

**Stiff PFs** (Biga, Pâte Fermentée, Sponge, Custom) are classified as INCORPORATION in the initial pass (rule 9) — no post-pass needed.

**Poolish:** Uses a water-ratio threshold. If the poolish contributes < 15% of total formula water, it is demoted to INCORPORATION (too little hydration benefit to justify inclusion). Otherwise it stays in AUTOLYSE.

**Levain — Sourdough Decision Matrix:** Levain classification depends on inoculation %, levain hydration, flour composition, and total dough hydration — not just water contribution. A large levain (30% inoculation) is structurally part of the dough and should be mixed in early (fermentolyse). A small levain (10%) should be added after the rest (pure autolyse). Stiff levains concentrate acidity and tighten gluten — always excluded.

The matrix evaluates in order (first match wins):

| # | Condition | Result | Rationale |
|---|-----------|--------|-----------|
| 0 | No BP data (totalPfBp = 0) | keep AUTOLYSE | No data to evaluate — keep default |
| 1 | Levain hydration < 65% | INCORPORATION | Stiff levain — concentrated acidity, tightens gluten |
| 2 | Whole wheat > 40% of total flour | INCORPORATION | WW benefits from clean enzyme activation without acid |
| 3 | Inoculation >= 25% | AUTOLYSE (fermentolyse) | Levain IS the dough structure |
| 4 | Inoculation < 15% AND waterRatio < 20% | INCORPORATION | Low inoculation + low water — clean autolyse preferred |
| 5 | Inoculation 15–25% AND total hydration >= 75% | AUTOLYSE (fermentolyse) | High hydration gray zone — extensible dough benefits |
| 6 | Inoculation 15–25% AND total hydration < 75% | INCORPORATION | Low hydration gray zone — exclude levain |
| 7 | Fallback | AUTOLYSE | Shouldn't reach here |

Metrics used by the matrix (all ratio denominators are TFQ-based — K + PF contributions — not K alone):
- **inoculationPct** = PF flour / total formula flour (TFQ: sum of flour K values + flour inside all enabled PFs)
- **hydration** = PF water / PF flour (null if flour = 0)
- **waterRatio** = PF water / total formula water (TFQ: sum of liquid K values + water inside all enabled PFs)
- **totalHydration** = total formula water / total formula flour (used by rules 5/6 for gray-zone decisions)
- **wholeWheatPct** = whole wheat TFQ / total formula flour (name heuristic: `/\bwhole\s*wheat\b|\bWW\b|\bwheatmeal\b/i`)
- **ryePct** = rye TFQ / total formula flour (name heuristic: `/\brye\b/i`; used for rye autolyse warning)

When a levain stays in AUTOLYSE (rules 3, 5), the mixing steps use the FERMENTOLYSE stage instead of AUTOLYSE (see §8.5).

**Rye autolyse warning:** When rye flour exceeds 30% of total flour and there are ingredients classified as AUTOLYSE, the engine emits a warning: *"Rye flour is >30% of total flour. Autolyse is typically not beneficial for high-rye doughs — rye lacks the gluten proteins that autolyse develops. Consider disabling autolyse."* Displayed as an amber banner on the autolyse split card.

The baker can override any decision by dragging PFs between lists, just like any other ingredient. The override system (§8.2) applies uniformly.

**Edge case — instant dry yeast:** Unlike fresh or active dry yeast, instant dry yeast has low cell moisture and benefits from early hydration. The baker can drag it into the Autolyse list via the override system (§8.2). The engine default remains LEAVENING → final mix, since most bakeries use fresh yeast.

### 8.5 Fermentolyse

When autolyse is enabled and a PREFERMENT ingredient ends up in the AUTOLYSE group (via the sourdough matrix or baker override), the technique is more accurately called **fermentolyse** — flour, water, and levain are combined and rested together, allowing fermentation to begin during the rest period alongside the enzymatic activity of a traditional autolyse.

The engine detects this automatically:
```
isFermentolyse = autolyseGroup.some(i => i.category === 'PREFERMENT')
```

When fermentolyse is detected:
- **Stage:** `FERMENTOLYSE` (not `AUTOLYSE`)
- **Step titles:** "Fermentolyse Mix" / "Fermentolyse Rest" (not "Autolyse Mix" / "Autolyse Rest")
- **Rest description:** "Cover and rest. Fermentation begins during rest — enzymatic activity and early acid development occur simultaneously."

When no preferment is in the autolyse group (pure autolyse), the existing AUTOLYSE stage and labels are used unchanged.

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

### 10.2 Ingredient Incorporation Order (Reference)

When the engine auto-generates mixing process steps for a recipe, it should respect the standard incorporation timing based on ingredient category and Baker's percentage. These rules come from baking science — adding ingredients at the wrong stage can impair gluten development.

**Incorporation timing by category:**

| Category | When to Add | Condition / Notes |
|----------|-----------|------------------|
| FLOUR | Beginning (1st speed) | Always first, with water |
| LIQUID | Beginning (1st speed) | Hydrates flour proteins and starch |
| LEAVENING | Beginning (1st speed) | With flour + water (exception: instant dry yeast can go in before autolyse) |
| SEASONING (salt) | Beginning (1st speed) | Can go in with flour + water despite common myths; or after autolyse if enabled |
| ENRICHMENT (low fat, ≤4% BP) | Beginning (1st speed) | Small amounts don't impair gluten formation |
| ENRICHMENT (med fat, 5–15% BP) | Halfway through 2nd speed | Fat lubricates protein chains, delaying gluten bonding |
| ENRICHMENT (high fat, >15% BP) | Near end of 2nd speed | Requires near-full gluten development to support the fat load |
| ENRICHMENT (liquid fat/oil) | Beginning (1st speed) | Part of hydration; large amounts can go after full development in 1st speed |
| ENRICHMENT (eggs) | Beginning (1st speed) | Major hydration role; always include ≥10% water alongside eggs |
| SWEETENER (≤12% BP) | Beginning (1st speed) | Low sugar doesn't disrupt gluten |
| SWEETENER (>12% BP) | In stages, or after development | Sugar is hygroscopic — large amounts steal water from proteins |
| FLAVORING (dry powders) | Beginning (1st speed) | Malt powder, milk powder, etc. — with flour |
| CONDITIONER | Beginning (1st speed) | Ascorbic acid, vital wheat gluten, DATEM, lecithin, enzymes, L-cysteine — always INCORPORATION timing |
| MIXIN (nuts, fruit, chocolate) | End of mix, 1st speed ONLY | After full gluten development; 2nd speed would shred gluten bonds |
| PREFERMENT (liquid — Poolish) | Autolyse (if water ratio >= 15%) or final mix | Water-ratio threshold: large poolish aids hydration, small poolish doesn't justify inclusion |
| PREFERMENT (liquid — Levain) | Autolyse or final mix (sourdough matrix §8.4) | Depends on inoculation %, levain hydration, flour composition, and total dough hydration |
| PREFERMENT (stiff) | After autolyse / beginning of final mix | Biga, PFD, Sponge — higher yeast concentration would initiate fermentation |

**Current implementation:** The engine auto-generates multi-phase mixing steps via `suggestMixingSteps()` in `process-steps.js`. It classifies all ingredients into four phases — AUTOLYSE, INCORPORATION, FAT_ADDITION, MIXIN — using `classifyAllIngredients()` in `mixing-phases.js`. For liquid preferments, a post-pass refines classification: Poolish uses a water-ratio threshold, Levain uses the sourdough decision matrix (§8.4). When autolyse is enabled and a preferment ends up in the autolyse group, the engine uses the FERMENTOLYSE stage (§8.5). The baker can further customize via the Process Steps editor or drag overrides.

**Available process stages:** `PREFERMENT_BUILD`, `AUTOLYSE`, `FERMENTOLYSE`, `MIXING`, `FOLD`, `DIVIDE`, `PRESHAPE`, `REST`, `SHAPE`, `PROOF`, `RETARD`, `BAKE`, `COOL`, `FINISH`.

### 10.3 Full Process Suggestion Algorithm

`suggestProcessSteps()` in `process-steps.js` generates a complete process — from first mix through final proof — with `duration_min`, `temperature`, and `mixer_speed` populated where derivable.

**Inputs:**
- `ingredients` — recipe ingredient list (used for phase classification)
- `hasAutolyse` — whether autolyse is enabled
- `autolyseDurationMin` — autolyse rest duration (default 20)
- `mixType` — one of `Short Mix`, `Improved Mix`, `Intensive Mix`, `Short Improved`
- `ddt` — desired dough temperature in °C
- `autolyseOverrides` — baker's drag overrides from the autolyse split UI (`{ [ingredientId]: 'autolyse' | 'final' }`)

**Step 1: Classify ingredients** — existing `classifyAllIngredients` + `groupByPhase` into AUTOLYSE, INCORPORATION, FAT_ADDITION, MIXIN phases. Then apply `autolyseOverrides`: ingredients the baker dragged into the autolyse list are moved to AUTOLYSE; ingredients dragged to final mix are moved to INCORPORATION (unless already in FAT_ADDITION or MIXIN). This ensures process step descriptions match the autolyse split the baker sees in the UI.

**Preferment type inference:** When a PREFERMENT ingredient is loaded without `preferment_settings` or with the default `CUSTOM` type, the engine infers the type from the ingredient name (e.g., "Levain" → `LEVAIN`, "Poolish" → `POOLISH`, "Biga" → `BIGA`). The baker can override back to `CUSTOM` via the Type dropdown. This inference runs at ingredient load time and on name change, ensuring the classification engine sees the correct PF type for the sourdough decision matrix and water-ratio threshold.

**Step 2: Derive process parameters from mix type.** `MIX_TYPE_PROCESS` lookup table (sourced from Suas Ch. 3):

| Parameter | Short Mix | Improved Mix | Intensive Mix | Short Improved |
|-----------|-----------|-------------|--------------|----------------|
| Bulk ferment (min) | 210 | 90 | 20 | 60 |
| Folds during bulk | 3 | 1 | 0 | 1 |
| Fold interval (min) | 45 | 45 | — | 30 |
| Bench rest (min) | 20 | 20 | 15 | 20 |
| Final proof (min) | 50 | 75 | 105 | 60 |

**Step 3: Enrichment detection.** If FAT_ADDITION phase has ingredients → enriched dough. Affects proof temperature (27°C enriched, 25°C lean) and fermentation descriptions.

**Step 4: Mixer speed derivation** from `MIX_TYPES[mixType].has_second`:

| Step | has_second=true | has_second=false |
|------|----------------|-----------------|
| Autolyse/Fermentolyse Mix | 1st | 1st |
| Incorporation | 1st → 2nd | 1st |
| Development | 2nd | _(skipped)_ |
| Fat & Sugar Addition | 1st → 2nd | 1st |
| Mix-ins | 1st | 1st |

**Step 5: Temperature assignment:**
- Bulk fermentation / folds → DDT
- Final proof → 25°C (lean) or 27°C (enriched)
- Mixing steps → null (mixer friction is a production variable)
- Bench rest → null (room temperature)

**Step 6: Generate steps in order:**
1. Mixing phase steps (autolyse/fermentolyse → incorporation → development → fat addition → mix-ins)
2. FOLD — bulk fermentation is represented as a sequence of fold steps. Each step is a timed fermentation segment; steps with fold actions include "Stretch and fold at end of phase" in the description. Total steps = folds + 1 (N fold-action phases + 1 final rest phase).
   - If folds = 0, a single FOLD step with the full bulk duration
   - Example (Short Improved, 60 min, 1 fold @ 30 min): Fold 1 (30 min, stretch+fold) → Fold 2 (30 min, rest)
   - Example (Short Mix, 210 min, 3 folds @ 45 min): Fold 1 (45 min, s+f) → Fold 2 (45 min, s+f) → Fold 3 (45 min, s+f) → Fold 4 (30 min, rest)
3. PRESHAPE
4. REST (bench rest) — duration from table
5. SHAPE
6. RETARD — 720 min (12 h) default at 4°C. See §10.4 for retarding techniques.
7. PROOF — duration from table, temp = proof temp
8. BAKE — lean: 240°C / 22 min with steam; enriched: 175°C / 30 min without steam.

Each step is independently trackable and editable. The baker can delete, reorder, or adjust any step. Steps like RETARD can be removed if the process doesn't use cold retardation.

### 10.4 Retarding Techniques (Reference — Suas Ch. 4)

Retarding delays fermentation by lowering dough temperature. At 4°C, yeast and bacteria become dormant and most activity stops. Three techniques differ in when retarding occurs and at what temperature.

#### Delayed First Fermentation

Retard in bulk immediately after mixing, before dividing.

| Parameter | Value |
|-----------|-------|
| Retarder temp | 7–9°C (45–48°F) |
| Duration | 12–18 h |
| Yeast (fresh) | ~1.2% BP |
| DDT | 23°C |
| Placement | After mixing, before divide |

After retarding: remove, divide immediately or temper ~1 h, then preshape → rest → shape → proof → bake normally. Fermentation is not completely stopped at 7–9°C — slow gas and acid production continues, preserving product quality. No dough conditioners needed with good flour. Handles high-hydration doughs (ciabatta) well. No surface blisters (retarded in bulk before shaping).

**Drawback:** Requires retarder capacity for bulk dough. Bread not available immediately — 3–4 h needed after pull for divide/shape/proof/bake.

#### Slow Final Proof

Retard after shaping — replaces conventional proof. Bake directly from retarder.

| Parameter | Value |
|-----------|-------|
| Retarder temp | 10°C (50°F) |
| Duration | 12–15 h |
| Yeast (fresh) | 0.8–1% BP |
| DDT | 23°C |
| Mix development | Improved → intensive |
| Dough consistency | Slightly stiffer |
| Placement | After shape |

After mixing: 20–30 min bulk → divide → preshape → 20–30 min rest → shape → retard. At 10°C yeast produces a small amount of CO₂ slowly — after 12 h the dough has enough gas to bake directly from the retarder. Bake window: 12–15 h (same batch can be baked across a several-hour window).

**Drawback:** Ascorbic acid (15–20 ppm) typically needed to reinforce gluten. Surface dehydration risk — humidifier system important.

#### Retarding-Proofing Process

Retard after shaping at very low temp, then warm-proof before baking.

| Parameter | Value |
|-----------|-------|
| Retarder temp | 3–4°C (38–40°F) |
| Duration | 12–48 h |
| Proof after retard | Room temp, or auto-warm to 22–24°C |
| Yeast (fresh) | 1.8–2% BP |
| DDT | 23°C |
| Mix development | Improved → intensive |
| Dough consistency | Stiffer, shape tightly |
| Placement | After shape |

After mixing: 15–20 min bulk → divide → preshape → 20 min rest → shape tightly → retard. Two options: (1) remove from retarder and proof at room temp, or (2) proofer-retarder auto-warms to 22–24°C after the retarding period. Baker can have fresh bread ~1 h after arriving.

**Drawback:** Dough conditioners required. Larger proofer-retarders needed. Humidity control critical — air is drier at low temps.

#### Current Engine Default

The engine suggests the **retarding-proofing** technique: SHAPE → RETARD (4°C, 12 h) → PROOF → BAKE. This is the most common artisan workflow. The baker can:
- Delete RETARD for a straight (non-retarded) process
- Adjust temperature (10°C for slow final proof, 7°C for delayed first fermentation)
- Move RETARD earlier in the sequence (before PRESHAPE for delayed first fermentation)
- Extend duration up to 48 h

---

## 11. Loss & Waste Factor

### 11.1 Definitions

**Process Loss %** — The percentage of dough weight lost between the mixer and the oven: dough stuck to bowls, divider waste, shaping scraps, bench trimmings. The baker sets this once per recipe based on experience with their equipment and process. Setting process loss to 5% tells the engine: "scale up all dough quantities by enough to compensate for 5% of the total dough never making it into the oven."

- **Where it applies:** Dividing, pre-shaping, shaping, proofing transfers — any step between "dough off the mixer" and "dough into the oven."
- **Who sets it:** The baker, based on their shop's workflow. A bakery with a hydraulic divider may lose 1–2%; hand-dividing sticky enriched dough may lose 4–5%.
- **Currently:** A static value entered in the recipe builder. The baker updates it manually if their process changes.
- **Production module (future):** Log actual dough-in vs. dough-loaded weights per batch. Compute rolling average process loss across productions of the same recipe and surface it as a suggested update to the recipe's stored value.

**Bake Loss %** — The percentage of piece weight lost during baking, almost entirely from moisture evaporation. A lean baguette at 240°C loses more moisture than a brioche at 175°C. The baker sets this per recipe based on their oven and product type.

- **Where it applies:** From oven entry to oven exit. A piece weighed at 410g going in and 350g coming out has `(410 - 350) / 410 = 14.6%` bake loss.
- **Who sets it:** The baker, from experience or test bakes.
- **Currently:** A static value entered in the recipe builder.
- **Production module (future):** After each bake, the baker records finished piece weight. The system computes `actual_bake_loss = 1 - (finished_weight / raw_scaled_weight)` per batch, maintains a running mean across productions of the same recipe, and surfaces it as a suggested update. Over time, the value self-corrects from real data rather than guesswork.

### 11.2 Calculation

The two losses compound multiplicatively (not additively) because process loss reduces dough before baking, then bake loss reduces piece weight during baking:

```python
def calc_adjusted_yield(desired_finished_weight, process_loss_pct, bake_loss_pct):
    """
    Raw yield per piece — how much dough to scale per piece
    so the finished product hits the desired weight.
    """
    return desired_finished_weight / ((1 - process_loss_pct) * (1 - bake_loss_pct))

def calc_batch_with_loss(recipe):
    raw_yield = calc_adjusted_yield(recipe.yield_per_piece, recipe.process_loss_pct, recipe.bake_loss_pct)
    return {
        "raw_yield_per_piece": raw_yield,
        "finished_yield_per_piece": recipe.yield_per_piece,
        "scale_factor": raw_yield / recipe.yield_per_piece,
    }
```

**Scale factor** = `raw_yield / desired_yield`. This multiplier is applied to Per Item and Batch columns so every ingredient quantity accounts for both losses.

### 11.3 Example

80g finished panettone, 3% process loss, 12% bake loss:
```
raw = 80 / (0.97 × 0.88) = 93.7g dough per piece
scale_factor = 93.7 / 80 = 1.171x
```

The baker scales 93.7g of dough per piece. After ~3% sticks to equipment during dividing/shaping, ~90.9g enters the oven. After ~12% moisture loss during baking, ~80g comes out.

### 11.4 Typical Ranges

| Product Type | Process Loss | Bake Loss | Notes |
|-------------|-------------|-----------|-------|
| Lean bread (baguette, batard) | 2–3% | 12–18% | High bake loss from high oven temp, steam, thin crust |
| Enriched bread (brioche, Panettone) | 2–4% | 8–12% | Fats reduce moisture loss; lower oven temp |
| Pastry (croissant) | 3–5% | 10–15% | Lamination scraps increase process loss |
| Pizza | 1–2% | 8–12% | Simple shapes, minimal handling |

### 11.5 Production Module Integration (Future)

When the production module tracks batch sessions, loss factors become data-driven:

1. **Per-batch logging:** Baker records `dough_total_weight` (off mixer), `pieces_loaded` (into oven), `finished_piece_weight` (out of oven).
2. **Actual process loss** = `1 - (pieces_loaded × raw_yield / dough_total_weight)`.
3. **Actual bake loss** = `1 - (finished_piece_weight / raw_yield)`.
4. **Rolling mean** across the last N productions of the same recipe → suggested update to recipe's stored values.
5. **Drift alert:** If actual loss deviates >2 percentage points from the recipe's stored value, surface a warning: "Bake loss averaging 16.2% over last 5 bakes — recipe says 12%. Update?"

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

        # Compare pre-ferment settings (type, DDT, fermentation duration)
        a_ps = getattr(ing_a, "preferment_settings", None)
        b_ps = getattr(ing_b, "preferment_settings", None)
        if a_ps or b_ps:
            for field in ["type", "ddt", "fermentation_duration_min"]:
                old_val = getattr(a_ps, field, None) if a_ps else None
                new_val = getattr(b_ps, field, None) if b_ps else None
                if old_val != new_val:
                    changes.append({
                        "type": "modified", "ingredient_id": uid,
                        "name": ing_b.name, "field": f"pf_{field}",
                        "old": old_val, "new": new_val,
                    })

    # Global params
    for field in ["yield_per_piece", "ddt", "autolyse", "autolyse_duration_min",
                   "autolyse_overrides", "process_loss_pct", "bake_loss_pct"]:
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
- Pre-ferment settings (type, DDT, fermentation duration) tracked per-ingredient with `pf_` prefix
- `autolyse_overrides` compared via deep equality (JSON.stringify), not reference equality

### 12.3 Version History Pagination

Version lists are paginated server-side using SQLite `LIMIT ? OFFSET ?`:

- **Page size:** 10 versions per page
- **URL-driven:** `?page=N` query parameter (default: 1)
- **Change summaries:** Computed per-page; the oldest item on each page diffs against the next older version (fetched separately)
- **Current version:** Only displayed on page 1 (it lives above the version list)

---

## 13. Complete Formula Reference

Quick-reference: every output the engine produces.

| Output | What | Formula | Depends On |
|--------|------|---------|------------|
| Overall Baker's % | TFQ[i] / SUM(TFQ_flours) | §4.2 | Total formula |
| Pre-ferment ratio | PF_base_qty / SUM(K_flours) | §4.3 | K, PF.base_qty |
| Pre-ferment qty | (ratio × flour / PF_total_BP) × BP[i] | §4.4 | K, PF Baker's % |
| Total formula qty | K[i] + sum(PF breakdowns for i) | §4.7 | K, PF breakdowns |
| Final dough qty | Total formula - sum(PF contributions) | §4.6 | K, all PF qtys |
| Final dough Baker's % | K[i] / SUM(Final_dough_flours) | §4.9 | K, final dough |
| Per-item weight | Final_dough[i] × yield / G_total | §4.10 | Final dough, yield |
| Batch qty | Per_item[i] × num_pieces | §4.11 | Per-item, num_pieces |
| Scale factor | target / current (by mode) | §4.12 | Scaling mode, target |
| Pre-fermented flour % | PF_flour / Total_flour | §4.13 | PF breakdown, total |
| Hydration | Total_water / Total_flour | §4.14 | Total formula |
| Water temp | (DDT × N) - temps - friction | §6 | DDT, env, mixer |
| Effective friction | friction_factor × mix_type_mult | §7.2 | Mixer profile, mix type |
| 1st speed min | calibration_rounds / first_speed_rpm | §7.3 | Mixer profile, mix type |
| 2nd speed min | target_rounds / second_speed_rpm | §7.3 | Mixer profile, mix type |
| Adjusted yield | yield / ((1-process_loss)(1-bake_loss)) | §11 | yield, loss % |

**The K model (decided):** K = final dough / base recipe quantity. Pre-ferments add mass on top. Total formula ≥ K. This matches the original spreadsheet behavior and the baker's mental model.

**All inputs reduce to:**
- **J** — ingredient names
- **K** — ingredient quantities in grams (final dough amounts)
- **Category** — per ingredient (set once)
- **Pre-ferment Baker's %** — per ingredient per pre-ferment (only when PREFERMENT rows exist)
- **Recipe settings** — yield per piece, DDT, autolyse (with optional overrides), loss factors

---

## 14. Seed Recipes

### 14.1 Panettone (verified against production spreadsheet)

```json
{
  "name": "Panettone",
  "yield_per_piece": 80,
  "ddt": 24,
  "autolyse": false,
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

---

## §15 Dough Type System

Dough type is the highest-level classification a baker makes. It determines process flow, mixing strategy, fermentation schedule, and baking parameters.

### §15.1 Design Principles

- **Suggestion engine, not hard constraint.** Selecting a dough type pre-fills sensible defaults (DDT, autolyse, mix type, loss %) and generates type-appropriate process steps. The baker can override any field.
- **Nullable.** Existing recipes without a dough type continue to work identically — the engine falls back to the standard bread generator.
- **Soft mix-type warnings.** When the current mix type falls outside the recommended set for a dough type, an amber hint is shown (not a blocking error).

### §15.2 Dough Type Table

#### Bread (8 types)

| Key | Label | Autolyse | Mix Type | DDT | Process Loss | Bake Loss |
|-----|-------|----------|----------|-----|-------------|-----------|
| `LEAN` | Lean | Yes, 20 min | Short Mix | 24 | 3% | 12% |
| `ENRICHED` | Enriched | No | Improved Mix | 24 | 2% | 10% |
| `RICH` | Rich | No | Intensive Mix | 22 | 2% | 8% |
| `LAMINATED_YEASTED` | Laminated (Yeasted) | No | Short Mix | 22 | 5% | 10% |
| `LAMINATED` | Laminated (Puff) | No | Short Mix | 20 | 5% | 10% |
| `SOURDOUGH` | Sourdough | Yes, 30 min | Short Mix | 24 | 3% | 14% |
| `PIZZA` | Pizza | No | Intensive Mix | 24 | 2% | 8% |
| `FLATBREAD` | Flatbread | No | Improved Mix | 24 | 2% | 8% |

#### Pastry (5 types)

| Key | Label | Autolyse | Mix Type | DDT | Process Loss | Bake Loss |
|-----|-------|----------|----------|-----|-------------|-----------|
| `SHORTCRUST` | Shortcrust | No | Short Mix | 18 | 3% | 5% |
| `SWEET_PASTRY` | Sweet Pastry | No | Short Mix | 18 | 3% | 5% |
| `CHOUX` | Choux | No | Short Mix | N/A | 5% | 15% |
| `COOKIE` | Cookie | No | Short Mix | 20 | 2% | 3% |
| `PASTA` | Pasta | No | Improved Mix | 22 | 2% | 0% |

### §15.3 Process Step Templates

**Bread types** (LEAN, ENRICHED, RICH, SOURDOUGH) use the existing bread generator from §10 with mix-type-driven parameters.

**PIZZA** and **FLATBREAD** use the bread generator with overridden post-mixing parameters and type-specific shaping/baking steps.

**Specialized types** dispatch to dedicated template generators:

- **LAMINATED_YEASTED**: Mix detrempe → bulk rest → enclose butter block → 3 letter folds with retards → sheet & cut → proof at 27°C → egg wash → bake 190°C
- **LAMINATED (Puff)**: Mix detrempe → rest → enclose butter → 6 single folds with retards → cut/shape → bake 200°C
- **CHOUX**: Cook panade on stove → cool → add eggs via mixer → pipe → bake 200°C then 175°C → dry → fill
- **COOKIE**: Cream butter+sugar → add eggs → add dry → fold mixins → portion → chill → bake 175°C → cool
- **SHORTCRUST**: Sablage → add liquid → fraisage → chill → roll & line → blind bake 180°C → fill
- **SWEET_PASTRY**: Cream butter+sugar → add egg → add flour → chill → roll & line → bake 170°C
- **PASTA**: Mix → knead → rest 30 min → roll → cut → dry/cook

### §15.4 Mix Type Constraints

Soft constraints warn when the selected mix type is unusual for the dough type:

| Dough Type | Allowed Mix Types |
|------------|------------------|
| LAMINATED_YEASTED | Short Mix, Short Improved |
| LAMINATED | Short Mix, Short Improved |
| SHORTCRUST | Short Mix |
| SWEET_PASTRY | Short Mix |
| COOKIE | Short Mix |

All other dough types allow any mix type without warning.

### §15.5 Dough Type Inference

`inferDoughType(ingredients)` analyzes ingredient composition and returns `{ type, confidence }` or `null`. Shown as a soft hint ("Looks like Enriched — Set") below the dough type selector when the baker hasn't chosen one yet.

**Inferable types** (ingredient profile is a strong signal):

| Inferred Type | Signal | Confidence |
|---|---|---|
| `SOURDOUGH` | Has enabled LEVAIN preferment | high |
| `PASTA` | Semolina/durum flour >50% + no yeast/levain | high |
| `COOKIE` | Chemical leavening + sugar BP >12% + fat BP >10% | medium |
| `RICH` | Fat BP >12% + yeast | medium |
| `ENRICHED` | Fat BP 5–12% + yeast | medium |
| `LEAN` | Fat BP <2% + yeast + sugar BP <5% | medium |

The 12% fat boundary between ENRICHED and RICH aligns with the point where mixing method must change from improved to intensive (ref: Suas, *Advanced Bread and Pastry*, Ch. 9).

**Not inferable** (same ingredients, different process): LAMINATED_YEASTED, LAMINATED, CHOUX, PIZZA, FLATBREAD, SWEET_PASTRY, SHORTCRUST. Returns `null`.

### §15.6 Implementation

- Constants & inference: `src/lib/dough-types.js`
- Database: `recipes.dough_type TEXT` (nullable)
- Process steps: `suggestProcessSteps()` accepts `doughType` parameter
- Version tracking: `dough_type` included in snapshots and diffs
- UI: `<select>` with `<optgroup>` for Bread/Pastry in recipe header; inference hint when `dough_type` is null

---

## §16 Accompanied Recipes (future)

Real-world bakery formulas often consist of multiple sub-recipes produced alongside the main dough.

### §16.1 Relationship to §5 (Pre-ferment System)

Multi-stage dough builds (Italian Levain, First Dough, Second Dough, etc.) are **already preferments** from the calculation engine's perspective. They are added as PREFERMENT-category ingredients in the final dough, their contributions decompose into the total formula, and §5's topological sort resolves the dependency chain. A "First Dough" with eggs, sugar, and butter works exactly like a simple poolish — the engine doesn't care how complex the preferment's internal formula is.

**§5 stays. §16 layers on top for what §5 doesn't cover:**

| Concern | §5 handles? | §16 adds |
|---|---|---|
| Calculation (decomposition, total formula, topological sort) | Yes | — |
| Dependency chain resolution (PF → PF → final dough) | Yes | — |
| Non-preferment companions (glazes, fillings, cinnamon sugar) | No | These don't contribute to total formula flour or hydration — they're separate preparations produced alongside the main recipe, scaled proportionally |
| Per-stage process steps | Partial (DDT, fermentation duration) | Full process sequences per sub-recipe — e.g. Italian Levain's "feed every 4h", First Dough's "mix 1st speed only, ferment 2h at 29°C" |
| Production scheduling across stages | No | §9 timeline needs to walk the dependency DAG to find the critical path — First Dough and Second Dough can run in parallel, Third Dough blocks on both |
| Independent reuse | No (PFs are embedded inline per recipe) | The same Italian Levain formula used in both Panettone and Pan d'Oro — shared, reusable sub-recipe definitions |

### §16.2 Categories

- **Finishing components** — produced separately, applied after baking. E.g. Sticky Bun Glaze, Chocolate Hazelnut Glaze, icings.
- **Filling components** — produced separately, incorporated during makeup. E.g. Cinnamon Sugar, pastry cream, frangipane, almond paste.
- **Multi-stage dough builds** — intermediate doughs modeled as PREFERMENT ingredients in the engine. Each stage is a full formula with its own ingredients, baker's %, and fermentation schedule. Stages can form a DAG (directed acyclic graph), not just a linear chain. The calculation engine (§5) already resolves these; §16 adds richer process modeling and reuse.

### §16.3 Examples (Suas, Ch. 9)

| Main Recipe | Accompanied Recipes |
|---|---|
| Sweet Roll Dough | Cinnamon Sugar; Sticky Bun Glaze |
| Laminated Brioche | Sponge (PF); pastry cream or frangipane (filling) |
| Columba di Pasqua | Italian Levain (PF); First Dough (staged build); Hazelnut Glaze |
| Pan d'Oro | Italian Levain; First Dough; Second Dough; Third Dough (4-stage build) |

**Pan d'Oro dependency graph** (illustrates non-linear multi-stage builds):

```
Levain → First Dough ─┐
                       ├→ Third Dough → Final Dough
Second Dough ─────────┘
```

- Levain (Italian style, 140% starter, fed every 4h at 29°C) → feeds into First Dough
- First Dough (flour + water + eggs + sugar + levain) — ferment 2h at 29°C
- Second Dough (flour + eggs + sugar + osmotolerant yeast) — ferment 1.5h at 29°C, independent of First Dough
- Third Dough takes First Dough (400% BP) AND Second Dough (128% BP) — ferment 3h at 29°C
- Final Dough adds flour, eggs, salt, sugar (48%), honey, butter (75.75%), cocoa butter, vanilla — intensive mix, DDT 25-29°C, proof 14h at 22°C

Each stage has its own baker's % computed against its own flour. The intermediate doughs appear as PREFERMENT ingredients in subsequent stages, expressed as a baker's % of that stage's flour — §5's engine resolves the full chain.

### §16.4 Design Considerations (TBD)

- A recipe can link to 1+ accompanied recipes, each with a role (preferment, filling, glaze, etc.)
- Accompanied recipes are themselves recipes — they have ingredients, process steps, and can be versioned independently
- Multi-stage builds form a DAG — stages can depend on multiple predecessors, and the calculation engine (§5) already resolves these via topological sort
- **Scaling:** each accompanied recipe is its own formula with its own baker's %. When the baker scales the main recipe (e.g. bigger batch), the accompanied recipe scales proportionally — its internal ratios stay fixed, only the total quantity changes to match what the main recipe needs
- **Non-PF companions** (glazes, fillings) don't participate in §4/§5 calculations — they are scaled independently based on the main recipe's batch size
- **Reuse:** a sub-recipe (e.g. Italian Levain) could be shared across multiple parent recipes rather than duplicated inline
- **Versioning (§12):** changing a glaze formula shouldn't create a new version of the parent recipe, but should be traceable