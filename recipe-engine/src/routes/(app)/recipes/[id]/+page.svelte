<script>
  import { enhance } from '$app/forms'
  import { toast } from 'svelte-sonner'
  import { generateId, formatPct, formatGrams } from '$lib/utils.js'
  import { PROCESS_STAGES, suggestProcessSteps } from '$lib/process-steps.js'
  import { MIXING_PHASES, classifyAllIngredients } from '$lib/mixing-phases.js'
  import { MIX_TYPE_NAMES } from '$lib/mixing.js'
  import { FERMENTATION_DEFAULTS, PF_SEED_BAKERS_PCT, formatDuration } from '$lib/preferment-defaults.js'
  import { COMMON_INGREDIENTS } from '$lib/common-ingredients.js'
  import { useSortable, reorder } from '$lib/use-sortable.svelte.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    CardFooter,
  } from '$lib/components/ui/card/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import {
    SelectRoot,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from '$lib/components/ui/select/index.js'

  // ── Constants ──────────────────────────────────────────────

  const CATEGORIES = [
    'FLOUR', 'LIQUID', 'ENRICHMENT', 'LEAVENING',
    'SEASONING', 'SWEETENER', 'FLAVORING', 'MIXIN', 'PREFERMENT'
  ]

  const CATEGORY_COLORS = {
    FLOUR: 'bg-amber-100 text-amber-800',
    LIQUID: 'bg-blue-100 text-blue-800',
    ENRICHMENT: 'bg-yellow-100 text-yellow-800',
    LEAVENING: 'bg-green-100 text-green-800',
    SEASONING: 'bg-red-100 text-red-800',
    SWEETENER: 'bg-pink-100 text-pink-800',
    FLAVORING: 'bg-purple-100 text-purple-800',
    MIXIN: 'bg-orange-100 text-orange-800',
    PREFERMENT: 'bg-indigo-100 text-indigo-800'
  }

  const PF_TYPES = ['POOLISH', 'BIGA', 'LEVAIN', 'PATE_FERMENTEE', 'SPONGE', 'CUSTOM']

  // PF types that require a self-reference (old starter / old dough)
  const SELF_REF_PF_TYPES = new Set(['LEVAIN', 'PATE_FERMENTEE'])

  // Required ingredient categories per PF type (auto-seeded, non-removable)
  // Per §5.3: all types need FLOUR + LIQUID; yeast-based types also need LEAVENING
  const PF_REQUIRED_CATEGORIES = {
    POOLISH: ['FLOUR', 'LIQUID', 'LEAVENING'],
    BIGA: ['FLOUR', 'LIQUID', 'LEAVENING'],
    LEVAIN: ['FLOUR', 'LIQUID'],
    PATE_FERMENTEE: ['FLOUR', 'LIQUID', 'LEAVENING'],
    SPONGE: ['FLOUR', 'LIQUID', 'LEAVENING'],
    CUSTOM: [],
  }

  // ── Helpers ────────────────────────────────────────────────

  function round2(n) {
    return Math.round((n || 0) * 100) / 100
  }

  function guessPfType(name) {
    const n = name.toLowerCase()
    if (n.includes('poolish')) return 'POOLISH'
    if (n.includes('biga')) return 'BIGA'
    if (n.includes('levain') || n.includes('sourdough')) return 'LEVAIN'
    if (n.includes('pate') || n.includes('old dough')) return 'PATE_FERMENTEE'
    if (n.includes('sponge')) return 'SPONGE'
    return 'CUSTOM'
  }

  // ── Props & State ──────────────────────────────────────────

  let { data } = $props()

  let recipeName = $state(data.recipe.name)
  let yieldPerPiece = $state(data.recipe.yield_per_piece)
  let ddt = $state(data.recipe.ddt)
  let ingredients = $state(
    data.recipe.ingredients.map((ing) => ({
      ...ing,
      preferment_bakers_pcts: { ...ing.preferment_bakers_pcts },
      preferment_settings: ing.category === 'PREFERMENT'
        ? { ingredient_id: ing.id, enabled: 1, type: guessPfType(ing.name), ddt: null, fermentation_duration_min: null, ...ing.preferment_settings }
        : null
    }))
  )
  let calculated = $state(data.calculated)
  let saving = $state(false)
  let changeNotes = $state('')
  let calculating = $state(false)
  let pfGrams = $state(initPfGrams())
  let pfAddSelect = $state({})

  // Loss & Waste (§11) — stored as decimals (0.03 = 3%)
  let processLossPct = $state(data.recipe.process_loss_pct || 0)
  let bakeLossPct = $state(data.recipe.bake_loss_pct || 0)

  // Autolyse (§8)
  let autolyse = $state(!!data.recipe.autolyse)
  let autolyseDurationMin = $state(data.recipe.autolyse_duration_min || 20)
  let autolyseOverrides = $state(data.recipe.autolyse_overrides || {})

  // Mix Type (§7)
  let mixType = $state(data.recipe.mix_type || 'Improved Mix')

  // Autolyse warnings — reactive, recomputed when ingredients change
  let autolyseWarnings = $derived.by(() => {
    if (!autolyse || ingredients.length === 0) return []
    const { warnings } = classifyAllIngredients(ingredients)
    return warnings
  })

  // Ingredient Library (autocomplete)
  let ingredientLibrary = $state(data.ingredientLibrary || [])
  let acActiveIdx = $state(-1)
  let acOpenFor = $state(null)
  let acQuery = $state('')

  let acSuggestions = $derived.by(() => {
    if (!acOpenFor) return []
    const q = (acQuery || '').toLowerCase()
    const usedNames = new Set(ingredients.map((i) => i.name.toLowerCase()))
    // Merge user library (priority) with built-in common ingredients
    const seen = new Set()
    const merged = []
    for (const entry of ingredientLibrary) {
      const key = entry.name.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(entry)
      }
    }
    for (const entry of COMMON_INGREDIENTS) {
      const key = entry.name.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(entry)
      }
    }
    return merged
      .filter((entry) => (!q || entry.name.toLowerCase().includes(q)) && !usedNames.has(entry.name.toLowerCase()))
      .slice(0, 10)
  })

  function acOpen(ingId, name) {
    acOpenFor = ingId
    acQuery = name || ''
    acActiveIdx = -1
  }

  function acClose() {
    acOpenFor = null
    acQuery = ''
    acActiveIdx = -1
  }

  function inferCategory(ing) {
    if (!ing.name?.trim()) return
    const name = ing.name.trim().toLowerCase()
    // Check ingredient library first, then common ingredients
    const match =
      ingredientLibrary.find((e) => e.name.toLowerCase() === name) ||
      COMMON_INGREDIENTS.find((e) => e.name.toLowerCase() === name)
    if (match && match.category !== ing.category) {
      const idx = ingredients.indexOf(ing)
      if (idx >= 0) onCategoryChange(idx, match.category)
    }
    // Re-infer PF type when name changes on an existing preferment
    inferPfType(ing)
  }

  function inferPfType(ing) {
    if (ing.category !== 'PREFERMENT' || !ing.preferment_settings) return
    const inferred = guessPfType(ing.name)
    if (inferred !== ing.preferment_settings.type) {
      onPfTypeChange(ing.id, inferred)
    }
  }

  function acSelect(ing, entry) {
    const oldCategory = ing.category
    ing.name = entry.name
    acClose()
    if (entry.category !== oldCategory) {
      const idx = ingredients.indexOf(ing)
      if (idx >= 0) onCategoryChange(idx, entry.category)
    } else {
      inferPfType(ing)
      onFieldChange()
    }
  }

  function acKeydown(evt, ing) {
    if (!acSuggestions.length) return
    if (evt.key === 'ArrowDown') {
      evt.preventDefault()
      acActiveIdx = (acActiveIdx + 1) % acSuggestions.length
    } else if (evt.key === 'ArrowUp') {
      evt.preventDefault()
      acActiveIdx = acActiveIdx <= 0 ? acSuggestions.length - 1 : acActiveIdx - 1
    } else if (evt.key === 'Enter' && acActiveIdx >= 0) {
      evt.preventDefault()
      acSelect(ing, acSuggestions[acActiveIdx])
    } else if (evt.key === 'Escape') {
      acClose()
    }
  }

  // Process Steps (§10)
  let processSteps = $state(
    (data.recipe.process_steps || []).map((s) => ({ ...s }))
  )
  let stepsContainer = $state(null)

  useSortable(() => stepsContainer, {
    animation: 200,
    handle: '.step-drag-handle',
    ghostClass: 'opacity-30',
    onEnd(evt) {
      processSteps = reorder(processSteps, evt)
    },
  })

  // Plain variable — not reactive UI state, just a timer reference
  let calcTimeout

  // ── Derived ────────────────────────────────────────────────

  let pfIngredients = $derived(ingredients.filter((i) => i.category === 'PREFERMENT'))

  let recipeReady = $derived(
    calculated &&
    ingredients.some((i) => i.category === 'FLOUR' && i.base_qty > 0) &&
    ingredients.some((i) => i.category === 'LIQUID' && i.base_qty > 0)
  )

  let ingTotal = $derived(ingredients.reduce((s, i) => s + (i.base_qty || 0), 0))

  let ingBpTotal = $derived(
    calculated?.ingredients?.reduce((s, i) => s + (i.overall_bakers_pct || 0), 0) ?? 0
  )

  let calcTotals = $derived.by(() => {
    if (!calculated?.ingredients?.length) return null
    const ings = calculated.ingredients
    return {
      overall_bp: ings.reduce((s, i) => s + (i.overall_bakers_pct || 0), 0),
      total_formula: ings.reduce((s, i) => s + (i.total_formula_qty || 0), 0),
      final_dough_bp: ings.reduce((s, i) => s + (i.final_dough_bakers_pct || 0), 0),
      final_dough: ings.reduce((s, i) => s + (i.final_dough_qty || 0), 0),
      per_item: ings.reduce((s, i) => s + (i.per_item_weight || 0), 0),
      batch: ings.reduce((s, i) => s + (i.batch_qty || 0), 0)
    }
  })

  let pfMismatches = $derived.by(() => {
    const acc = {}
    for (const pf of pfIngredients) {
      const m = getPfMismatch(pf.id)
      if (m) acc[pf.id] = m
    }
    return acc
  })

  let isDraft = $derived(Object.keys(pfMismatches).length > 0)

  // ── Debounced Calculation ──────────────────────────────────

  function scheduleCalc() {
    if (calcTimeout) clearTimeout(calcTimeout)
    calcTimeout = setTimeout(runCalc, 500)
  }

  async function runCalc() {
    calculating = true
    try {
      const res = await fetch(`/api/recipes/${data.recipe.id}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRecipeData())
      })
      if (res.ok) calculated = await res.json()
    } catch {
      // silent fail on calc
    } finally {
      calculating = false
    }
  }

  // Cleanup debounce timer on unmount
  $effect(() => {
    return () => clearTimeout(calcTimeout)
  })

  // ── Build Recipe Payload ───────────────────────────────────

  function buildRecipeData() {
    return {
      name: recipeName,
      yield_per_piece: yieldPerPiece,
      ddt,
      process_loss_pct: processLossPct,
      bake_loss_pct: bakeLossPct,
      autolyse: autolyse ? 1 : 0,
      autolyse_duration_min: autolyseDurationMin,
      autolyse_overrides: autolyseOverrides,
      mix_type: mixType,
      ingredients: ingredients.map((ing, idx) => ({
        id: ing.id,
        name: ing.name,
        category: ing.category,
        base_qty: ing.base_qty,
        sort_order: idx,
        preferment_bakers_pcts: ing.preferment_bakers_pcts,
        preferment_settings: ing.preferment_settings,
      })),
      process_steps: processSteps.map((s, idx) => ({
        id: s.id,
        stage: s.stage,
        sort_order: idx,
        title: s.title,
        description: s.description,
        duration_min: s.duration_min,
        temperature: s.temperature,
        mixer_speed: s.mixer_speed,
        notes: s.notes,
      })),
    }
  }

  // ── Dirty tracking ───────────────────────────────────────────

  let savedSnapshot = $state(JSON.stringify(buildRecipeData()))
  let hasChanges = $derived(JSON.stringify(buildRecipeData()) !== savedSnapshot)

  function discardChanges() {
    const s = JSON.parse(savedSnapshot)
    recipeName = s.name
    yieldPerPiece = s.yield_per_piece
    ddt = s.ddt
    processLossPct = s.process_loss_pct || 0
    bakeLossPct = s.bake_loss_pct || 0
    autolyse = !!s.autolyse
    autolyseDurationMin = s.autolyse_duration_min || 20
    autolyseOverrides = s.autolyse_overrides || {}
    mixType = s.mix_type || 'Improved Mix'
    ingredients = (s.ingredients || []).map((ing) => ({
      ...ing,
      preferment_bakers_pcts: { ...(ing.preferment_bakers_pcts || {}) },
      preferment_settings: ing.category === 'PREFERMENT'
        ? { ingredient_id: ing.id, enabled: 1, type: guessPfType(ing.name), ddt: null, fermentation_duration_min: null, ...ing.preferment_settings }
        : null,
    }))
    processSteps = (s.process_steps || []).map((step) => ({ ...step }))
    changeNotes = ''
    pfGrams = initPfGrams()
    scheduleCalc()
    toast('Changes discarded')
  }

  // ── Ingredient CRUD ────────────────────────────────────────

  function addIngredient() {
    ingredients.push({
      id: generateId(),
      name: '',
      category: 'FLOUR',
      base_qty: 0,
      sort_order: ingredients.length,
      preferment_bakers_pcts: {},
      preferment_settings: null
    })
  }

  function removeIngredient(idx) {
    const removed = ingredients[idx]
    ingredients.splice(idx, 1)
    if (removed.category === 'PREFERMENT') {
      delete pfGrams[removed.id]
      for (const ing of ingredients) {
        delete ing.preferment_bakers_pcts[removed.id]
      }
    }
    scheduleCalc()
  }

  function onCategoryChange(idx, newCategory) {
    const ing = ingredients[idx]
    const oldCategory = ing.category

    ing.category = newCategory

    if (newCategory === 'PREFERMENT' && oldCategory !== 'PREFERMENT') {
      const pfType = guessPfType(ing.name)
      ing.preferment_settings = {
        ingredient_id: ing.id,
        enabled: 1,
        type: pfType,
        ddt: null,
        fermentation_duration_min: null
      }
      pfGrams[ing.id] = {}
      seedPfRequiredIngredients(ing.id, pfType)
    } else if (newCategory !== 'PREFERMENT' && oldCategory === 'PREFERMENT') {
      ing.preferment_settings = null
      delete pfGrams[ing.id]
      for (const other of ingredients) {
        delete other.preferment_bakers_pcts[ing.id]
      }
    }
    scheduleCalc()
  }

  /**
   * Auto-seed required ingredients for a PF type (per §5.3):
   * - Self-reference for LEVAIN / PATE_FERMENTEE
   * - FLOUR + LIQUID for all types, LEAVENING for yeast-based types
   */
  function seedPfRequiredIngredients(pfId, pfType) {
    const grams = pfGrams[pfId] || {}
    const pfIng = ingredients.find((i) => i.id === pfId)

    // Self-reference (old starter / old dough)
    if (SELF_REF_PF_TYPES.has(pfType)) {
      if (grams[pfId] == null) {
        grams[pfId] = 0
        if (pfIng) pfIng.preferment_bakers_pcts[pfId] = 0.2
      }
    }

    // §5.3: Seed existing recipe ingredients with default Baker's % per PF type
    const requiredCats = PF_REQUIRED_CATEGORIES[pfType] || []
    const seedBps = PF_SEED_BAKERS_PCT[pfType] || {}
    const alreadySeeded = new Set(Object.keys(grams))
    for (const cat of requiredCats) {
      const match = ingredients.find(
        (i) => i.category === cat && i.id !== pfId && !alreadySeeded.has(i.id)
      )
      if (match) {
        grams[match.id] = 0
        match.preferment_bakers_pcts[pfId] = seedBps[cat] ?? 0
        alreadySeeded.add(match.id)
      }
    }

    // Reassign to trigger reactivity
    pfGrams[pfId] = { ...grams }
  }

  function onFieldChange() {
    scheduleCalc()
  }

  // ── PF Gram Management ────────────────────────────────────

  function initPfGrams() {
    const grams = {}
    for (const pf of data.recipe.ingredients.filter((i) => i.category === 'PREFERMENT')) {
      grams[pf.id] = {}
      const allIngs = data.recipe.ingredients
      const pfTotalBp = allIngs.reduce((sum, ing) => {
        const bp = ing.preferment_bakers_pcts?.[pf.id]
        return sum + (bp != null ? bp : 0)
      }, 0)
      if (pfTotalBp > 0 && pf.base_qty > 0) {
        let largestId = null
        let largestVal = -1
        let runningSum = 0
        for (const ing of allIngs) {
          const bp = ing.preferment_bakers_pcts?.[pf.id]
          if (bp != null && bp > 0) {
            const rounded = round2((pf.base_qty / pfTotalBp) * bp)
            grams[pf.id][ing.id] = rounded
            runningSum += rounded
            if (rounded > largestVal) {
              largestVal = rounded
              largestId = ing.id
            }
          }
        }
        // Absorb rounding drift into the largest component
        const target = round2(pf.base_qty)
        const diff = round2(target - round2(runningSum))
        if (diff !== 0 && largestId) {
          grams[pf.id][largestId] = round2(grams[pf.id][largestId] + diff)
        }
      }
    }
    return grams
  }

  /**
   * Recalculate PF gram breakdown from Baker's % when the PF's base_qty changes.
   * Mirrors the engine's calcPrefermentBreakdown formula.
   */
  function recalcGramsFromBps(pfId) {
    const pfIng = ingredients.find((i) => i.id === pfId)
    if (!pfIng || pfIng.base_qty <= 0) return

    const totalBp = ingredients.reduce((sum, ing) => {
      const bp = ing.preferment_bakers_pcts?.[pfId]
      return sum + (bp != null ? bp : 0)
    }, 0)
    if (totalBp <= 0) return

    const grams = {}
    let largestId = null
    let largestVal = -1
    let runningSum = 0
    for (const ing of ingredients) {
      const bp = ing.preferment_bakers_pcts?.[pfId]
      if (bp != null && bp > 0) {
        const g = round2((pfIng.base_qty / totalBp) * bp)
        grams[ing.id] = g
        runningSum += g
        if (g > largestVal) { largestVal = g; largestId = ing.id }
      } else if (pfGrams[pfId]?.[ing.id] != null) {
        grams[ing.id] = 0
      }
    }
    // Absorb rounding drift into the largest component
    const diff = round2(pfIng.base_qty - round2(runningSum))
    if (diff !== 0 && largestId) {
      grams[largestId] = round2(grams[largestId] + diff)
    }
    pfGrams[pfId] = grams
  }

  function onPfGramChange(pfId, ingId, value) {
    const parsed = value === '' ? null : parseFloat(value)
    if (!pfGrams[pfId]) pfGrams[pfId] = {}

    if (parsed == null || isNaN(parsed)) {
      delete pfGrams[pfId][ingId]
    } else {
      pfGrams[pfId][ingId] = parsed
    }

    recalcBpsFromGrams(pfId)
    scheduleCalc()
  }

  function recalcBpsFromGrams(pfId) {
    const grams = pfGrams[pfId] || {}
    const flourGrams = Object.entries(grams).reduce((sum, [ingId, qty]) => {
      const ing = ingredients.find((i) => i.id === ingId)
      return ing?.category === 'FLOUR' ? sum + qty : sum
    }, 0)

    for (const ing of ingredients) {
      // Skip other preferments, but allow the self-reference (ing.id === pfId)
      if (ing.category === 'PREFERMENT' && ing.id !== pfId) continue
      const g = grams[ing.id]
      if (g != null && g > 0 && flourGrams > 0) {
        ing.preferment_bakers_pcts[pfId] = g / flourGrams
      } else if (g != null && g === 0) {
        ing.preferment_bakers_pcts[pfId] = 0
      } else if (grams[ing.id] == null) {
        delete ing.preferment_bakers_pcts[pfId]
      }
    }
  }

  // ── PF Validation ─────────────────────────────────────────

  function getPfMismatch(pfId) {
    const pfIng = ingredients.find((i) => i.id === pfId)
    if (!pfIng) return null
    const grams = pfGrams[pfId] || {}
    const rawSum = Object.values(grams).reduce((sum, v) => sum + (v || 0), 0)
    const rawK = pfIng.base_qty || 0
    if (rawK.toFixed(2) !== rawSum.toFixed(2)) {
      const k = parseFloat(rawK.toFixed(2))
      const breakdownSum = parseFloat(rawSum.toFixed(2))
      return { k, breakdownSum, diff: parseFloat(Math.abs(k - breakdownSum).toFixed(2)) }
    }
    return null
  }

  function addIngredientToPf(pfId, ingId) {
    if (!pfGrams[pfId]) pfGrams[pfId] = {}
    pfGrams[pfId][ingId] = 0
    const ing = ingredients.find((i) => i.id === ingId)
    if (ing) ing.preferment_bakers_pcts[pfId] = 0
    pfAddSelect[pfId] = ''
    scheduleCalc()
  }

  function removeIngredientFromPf(pfId, ingId) {
    if (pfGrams[pfId]) delete pfGrams[pfId][ingId]
    const ing = ingredients.find((i) => i.id === ingId)
    if (ing) delete ing.preferment_bakers_pcts[pfId]
    recalcBpsFromGrams(pfId)
    scheduleCalc()
  }

  // ── PF Settings ────────────────────────────────────────────

  function onPfTypeChange(ingId, newType) {
    const ing = ingredients.find((i) => i.id === ingId)
    if (!ing?.preferment_settings) return
    const oldType = ing.preferment_settings.type
    ing.preferment_settings.type = newType

    // Remove self-reference when switching away from a type that needs it
    if (!SELF_REF_PF_TYPES.has(newType) && SELF_REF_PF_TYPES.has(oldType)) {
      if (pfGrams[ingId]) delete pfGrams[ingId][ingId]
      delete ing.preferment_bakers_pcts[ingId]
      recalcBpsFromGrams(ingId)
    }

    // Remove old required-category ingredients that the new type doesn't need
    const oldRequired = PF_REQUIRED_CATEGORIES[oldType] || []
    const newRequired = PF_REQUIRED_CATEGORIES[newType] || []
    for (const cat of oldRequired) {
      if (newRequired.includes(cat)) continue
      // Find and remove ingredients of this category that were auto-seeded
      for (const other of ingredients) {
        if (other.category === cat && other.id !== ingId && pfGrams[ingId]?.[other.id] != null) {
          // Only remove if grams are still 0 (untouched by the baker)
          if (pfGrams[ingId][other.id] === 0) {
            delete pfGrams[ingId][other.id]
            delete other.preferment_bakers_pcts[ingId]
          }
        }
      }
    }

    // Seed required ingredients for the new type
    seedPfRequiredIngredients(ingId, newType)
    scheduleCalc()
  }

  // ── Process Steps ────────────────────────────────────────────

  function addProcessStep() {
    processSteps.push({
      id: generateId(),
      stage: 'MIXING',
      sort_order: processSteps.length,
      title: '',
      description: '',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
      notes: null,
    })
  }

  function removeProcessStep(idx) {
    processSteps.splice(idx, 1)
  }

  function moveProcessStep(idx, dir) {
    const target = idx + dir
    if (target < 0 || target >= processSteps.length) return
    const tmp = processSteps[idx]
    processSteps[idx] = processSteps[target]
    processSteps[target] = tmp
  }

  function suggestSteps() {
    const steps = suggestProcessSteps({
      ingredients,
      hasAutolyse: autolyse,
      autolyseDurationMin,
      mixType,
      ddt,
      autolyseOverrides,
    })
    for (const s of steps) {
      processSteps.push({
        id: generateId(),
        sort_order: processSteps.length,
        notes: null,
        ...s,
      })
    }
  }

  function resuggestSteps() {
    processSteps.length = 0
    suggestSteps()
  }

  // ── Autolyse Split Drag ──────────────────────────────────────

  let autolyseListEl = $state(null)
  let finalMixListEl = $state(null)

  const autolyseSortableOpts = {
    group: 'autolyse-split',
    sort: false,
    animation: 150,
    onEnd(evt) {
      if (evt.from === evt.to) return

      const itemId = evt.item.dataset.ingredientId
      const targetList = evt.to.dataset.listType

      // Revert DOM — let Svelte re-render from state
      evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex] || null)

      // Sparse overrides: only store non-default positions
      const { phases: phaseMap } = classifyAllIngredients(ingredients)
      const phase = phaseMap.get(itemId)
      const engineDefault = phase === MIXING_PHASES.AUTOLYSE ? 'autolyse' : 'final'

      if (targetList === engineDefault) {
        const { [itemId]: _, ...rest } = autolyseOverrides
        autolyseOverrides = rest
      } else {
        autolyseOverrides = { ...autolyseOverrides, [itemId]: targetList }
      }

      scheduleCalc()
    },
  }

  useSortable(() => autolyseListEl, autolyseSortableOpts)
  useSortable(() => finalMixListEl, autolyseSortableOpts)

  function resetAutolyseOverrides() {
    autolyseOverrides = {}
    scheduleCalc()
  }

  // ── Lookup Helpers ─────────────────────────────────────────

  function getCalc(ingId) {
    return calculated?.ingredients?.find((i) => i.id === ingId)
  }

  function getCalcPf(pfId) {
    return calculated?.preferments?.find((p) => p.id === pfId)
  }

  // ── CSV Export ─────────────────────────────────────────────

  function exportCsv() {
    if (!calculated) return

    const pfs = calculated.preferments || []
    const rows = []

    const header = [
      'Ingredient', 'Category', 'K (g)', 'Overall BP %',
      'Total Formula (g)', 'Final Dough BP %',
      'Final Dough (g)', 'Per Item (g)', 'Batch (g)'
    ]
    for (const pf of pfs) {
      header.push(`${pf.name} BP`, `${pf.name} Qty (g)`)
    }
    rows.push(header)

    for (const ing of calculated.ingredients) {
      const row = [
        ing.name || '(unnamed)', ing.category,
        ing.base_qty.toFixed(2), (ing.overall_bakers_pct * 100).toFixed(2),
        ing.total_formula_qty.toFixed(2),
        (ing.final_dough_bakers_pct * 100).toFixed(2), ing.final_dough_qty.toFixed(2),
        ing.per_item_weight.toFixed(2), ing.batch_qty.toFixed(2)
      ]
      for (const pf of pfs) {
        const srcIng = ingredients.find((i) => i.id === ing.id)
        const bp = srcIng?.preferment_bakers_pcts?.[pf.id]
        row.push(bp != null ? bp.toString() : '')
        row.push((ing.preferment_qtys?.[pf.id] || 0).toFixed(2))
      }
      rows.push(row)
    }

    rows.push([])
    rows.push(['Summary'])
    rows.push(['Hydration', (calculated.totals.hydration * 100).toFixed(1) + '%'])
    rows.push(['Total Weight', calculated.totals.total_weight.toFixed(1) + 'g'])
    rows.push(['Total Flour', calculated.totals.total_flour.toFixed(1) + 'g'])
    rows.push(['Pieces', calculated.totals.num_pieces.toFixed(1)])
    rows.push(['Yield/Piece', yieldPerPiece + 'g'])
    rows.push(['DDT', ddt + 'C'])
    if (calculated.totals.total_prefermented_flour_pct > 0) {
      rows.push([
        'Pre-fermented Flour',
        (calculated.totals.total_prefermented_flour_pct * 100).toFixed(1) + '%',
      ])
    }
    if (processLossPct > 0 || bakeLossPct > 0) {
      rows.push([
        'Process Loss',
        (processLossPct * 100).toFixed(1) + '%',
      ])
      rows.push(['Bake Loss', (bakeLossPct * 100).toFixed(1) + '%'])
      rows.push([
        'Raw Yield/Piece',
        calculated.totals.raw_yield_per_piece.toFixed(1) + 'g',
      ])
      rows.push([
        'Scale Factor',
        calculated.totals.scale_factor.toFixed(3) + 'x',
      ])
    }

    for (const pf of pfs) {
      if (Object.keys(pf.breakdown).length > 0) {
        rows.push([])
        rows.push([`${pf.name} Breakdown (${pf.type})`])
        rows.push(['Ingredient', 'Quantity (g)'])
        for (const [name, qty] of Object.entries(pf.breakdown)) {
          rows.push([name, qty.toFixed(2)])
        }
      }
    }

    if (calculated.autolyse) {
      rows.push([])
      rows.push([
        `Autolyse Split (${calculated.autolyse.autolyse_duration_min} min)`,
      ])
      rows.push(['Autolyse Ingredients'])
      for (const item of calculated.autolyse.autolyse_ingredients) {
        rows.push([item.name, item.qty.toFixed(2)])
      }
      rows.push(['Final Mix Ingredients'])
      for (const item of calculated.autolyse.final_mix_ingredients) {
        rows.push([item.name, item.qty.toFixed(2)])
      }
    }

    if (processSteps.length > 0) {
      rows.push([])
      rows.push(['Process Steps'])
      rows.push(['#', 'Stage', 'Title', 'Duration (min)', 'Temp (C)', 'Description'])
      for (let i = 0; i < processSteps.length; i++) {
        const s = processSteps[i]
        rows.push([
          i + 1,
          s.stage,
          s.title,
          s.duration_min ?? '',
          s.temperature ?? '',
          s.description,
        ])
      }
    }

    const csv = rows.map((row) =>
      row.map((cell) => {
        const str = String(cell ?? '')
        return (str.includes(',') || str.includes('"') || str.includes('\n'))
          ? '"' + str.replace(/"/g, '""') + '"'
          : str
      }).join(',')
    ).join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${recipeName || 'recipe'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }
</script>

<!-- ── Snippets ──────────────────────────────────────────── -->

{#snippet removeBtn(onclick, label = 'Remove')}
  <button
    type="button"
    {onclick}
    class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    aria-label={label}
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  </button>
{/snippet}

{#snippet categoryBadge(category)}
  <Badge variant="secondary" class="text-[10px] font-normal {CATEGORY_COLORS[category] || ''}">
    {category}
  </Badge>
{/snippet}

{#snippet sectionIcon(d)}
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
    <path d={d} />
  </svg>
{/snippet}

<!-- ── Sticky Action Bar ────────────────────────────────── -->

{#if !data.canEdit}
  <div class="-mx-4 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
    You have view-only access to this bakery.
  </div>
{/if}

<div class="sticky top-0 z-10 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
  <div class="flex items-center gap-3">
    <a
      href="/recipes/{data.recipe.id}/versions"
      class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      title="View version history"
    >
      v{data.recipe.version}
      {#if data.versionCount > 0}
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
      {/if}
    </a>
    <div class="flex-1"></div>

    {#if isDraft}
      <Badge variant="outline" class="border-amber-300 bg-amber-50 text-amber-700">
        Draft — fix PF mismatches
      </Badge>
    {/if}
    {#if calculating}
      <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
        <svg class="h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
        Calculating
      </span>
    {/if}

    <Button variant="outline" size="sm" onclick={exportCsv} disabled={!recipeReady || hasChanges}>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      CSV
    </Button>

    <Button variant="outline" size="sm" href="/recipes/{data.recipe.id}/production" disabled={!recipeReady || hasChanges}>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Production
    </Button>

    {#if hasChanges}
      <Button variant="ghost" size="sm" onclick={discardChanges} class="text-muted-foreground">
        Discard
      </Button>
    {/if}

    {#if data.canEdit}
      <form
        method="POST"
        action="?/save"
        use:enhance={() => {
          saving = true
          return async ({ result, update }) => {
            saving = false
            if (result.type === 'success') {
              toast.success('Recipe saved')
              if (result.data?.calculated) calculated = result.data.calculated
              if (result.data?.recipe) data.recipe.version = result.data.recipe.version
              if (result.data?.versionCount !== undefined) data.versionCount = result.data.versionCount
              if (result.data?.ingredientLibrary) ingredientLibrary = result.data.ingredientLibrary
              changeNotes = ''
              savedSnapshot = JSON.stringify(buildRecipeData())
            } else {
              toast.error('Failed to save recipe')
            }
            await update({ reset: false })
          }
        }}
      >
        <input type="hidden" name="data" value={JSON.stringify(buildRecipeData())} />
        <input type="hidden" name="change_notes" value={changeNotes} />
        {#if hasChanges}
          <input
            type="text"
            bind:value={changeNotes}
            placeholder="What changed? (optional)"
            class="w-44 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none ring-ring transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-offset-1"
          />
        {/if}
        <Button
          type="submit"
          size="sm"
          disabled={saving || isDraft || !hasChanges}
          class="min-w-20"
        >
          {#if saving}
            <svg class="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            Saving
          {:else}
            Save
          {/if}
        </Button>
      </form>
    {/if}
  </div>
</div>

<div class="space-y-6">

  <!-- ── Recipe Header ──────────────────────────────────── -->

  <Card>
    <CardHeader class="pb-4">
      <div class="flex flex-wrap items-start gap-4">
        <div class="flex-1 min-w-48">
          <label for="recipe-name" class="mb-1.5 block text-xs font-medium text-muted-foreground">Recipe Name</label>
          <input
            id="recipe-name"
            type="text"
            bind:value={recipeName}
            oninput={scheduleCalc}
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-lg font-semibold outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
          />
        </div>
        <div class="w-32">
          <label for="yield" class="mb-1.5 block text-xs font-medium text-muted-foreground">Yield/piece (g)</label>
          <input
            id="yield"
            type="number"
            step="0.01"
            min="0"
            bind:value={yieldPerPiece}
            oninput={scheduleCalc}
            onblur={() => { yieldPerPiece = round2(yieldPerPiece) }}
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
          />
        </div>
        <div class="w-24">
          <label for="ddt" class="mb-1.5 block text-xs font-medium text-muted-foreground">DDT (&deg;C)</label>
          <input
            id="ddt"
            type="number"
            step="0.01"
            min="0"
            bind:value={ddt}
            oninput={scheduleCalc}
            onblur={() => { ddt = round2(ddt) }}
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
          />
        </div>
      </div>
    </CardHeader>

    <CardContent class="space-y-4">
      {#if recipeReady}
        <!-- Loss & Waste + Autolyse -->
        <div class="flex flex-wrap items-end gap-4">
          <div class="w-32">
            <label for="process-loss" class="mb-1.5 block text-xs font-medium text-muted-foreground">
              Process Loss %
            </label>
            <input
              id="process-loss"
              type="number"
              step="0.1"
              min="0"
              max="50"
              value={round2(processLossPct * 100)}
              oninput={(e) => {
                processLossPct = (parseFloat(e.target.value) || 0) / 100
                scheduleCalc()
              }}
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
              placeholder="2-5"
            />
          </div>
          <div class="w-32">
            <label for="bake-loss" class="mb-1.5 block text-xs font-medium text-muted-foreground">
              Bake Loss %
            </label>
            <input
              id="bake-loss"
              type="number"
              step="0.1"
              min="0"
              max="50"
              value={round2(bakeLossPct * 100)}
              oninput={(e) => {
                bakeLossPct = (parseFloat(e.target.value) || 0) / 100
                scheduleCalc()
              }}
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
              placeholder="8-18"
            />
          </div>
          <Separator orientation="vertical" class="!h-8 mx-1" />
          <label class="flex items-center gap-2.5 pb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              bind:checked={autolyse}
              onchange={scheduleCalc}
              class="h-4 w-4 rounded border-input accent-primary"
            />
            <span class="text-sm font-medium">Autolyse</span>
          </label>
          {#if autolyse}
            <div class="w-28">
              <label for="autolyse-dur" class="mb-1.5 block text-xs font-medium text-muted-foreground">
                Duration (min)
              </label>
              <input
                id="autolyse-dur"
                type="number"
                step="1"
                min="5"
                max="120"
                bind:value={autolyseDurationMin}
                oninput={scheduleCalc}
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
              />
            </div>
          {/if}
          <Separator orientation="vertical" class="!h-8 mx-1" />
          <div class="w-40">
            <label for="mix-type" class="mb-1.5 block text-xs font-medium text-muted-foreground">Mix Type</label>
            <select
              id="mix-type"
              bind:value={mixType}
              onchange={scheduleCalc}
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
            >
              {#each MIX_TYPE_NAMES as name}
                <option value={name}>{name}</option>
              {/each}
            </select>
          </div>
        </div>

      {/if}

      <!-- Summary badges -->
      {#if calculated}
        <Separator />
        <div class="flex flex-wrap gap-2">
          <Badge variant="secondary" class="bg-blue-50 text-blue-700 font-normal">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>
            Hydration {formatPct(calculated.totals.hydration)}
          </Badge>
          <Badge variant="secondary" class="font-normal">
            Total {formatGrams(calculated.totals.total_weight, 0)}
          </Badge>
          <Badge variant="secondary" class="font-normal">
            {calculated.totals.num_pieces.toFixed(1)} pieces
          </Badge>
          {#if calculated.totals.total_prefermented_flour_pct > 0}
            <Badge variant="secondary" class="bg-indigo-50 text-indigo-700 font-normal">
              PF flour {formatPct(calculated.totals.total_prefermented_flour_pct)}
            </Badge>
          {/if}
          {#if calculated.totals.scale_factor > 1}
            <Badge variant="secondary" class="bg-amber-50 text-amber-700 font-normal">
              Scale {calculated.totals.scale_factor.toFixed(3)}x
            </Badge>
            <Badge variant="secondary" class="bg-amber-50 text-amber-700 font-normal">
              Raw yield {formatGrams(calculated.totals.raw_yield_per_piece)}
            </Badge>
          {/if}
        </div>
      {/if}
    </CardContent>
  </Card>

  <!-- ── Ingredient Table ───────────────────────────────── -->

  <Card>
    <CardHeader class="flex-row items-center justify-between space-y-0 pb-0">
      <CardTitle class="flex items-center gap-2">
        {@render sectionIcon('M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5ZM6.5 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z')}
        Ingredients
      </CardTitle>
      <Button variant="outline" size="sm" onclick={addIngredient}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        Add
      </Button>
    </CardHeader>
    <CardContent class="p-0 pt-4">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-y border-border bg-muted/50">
              <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</th>
              <th class="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground w-28">Grams</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Category</th>
              <th class="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground w-20">BP %</th>
              <th class="px-4 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {#each ingredients as ing, idx (ing.id)}
              {@const calc = getCalc(ing.id)}
              <tr class="group border-b border-border transition-colors hover:bg-muted/30">
                <td class="px-4 py-2">
                  <div class="relative">
                    <input
                      type="text"
                      bind:value={ing.name}
                      oninput={(e) => { acOpen(ing.id, e.target.value); onFieldChange() }}
                      onfocus={(e) => { acOpen(ing.id, e.target.value || '') }}
                      onblur={() => { inferCategory(ing); setTimeout(acClose, 150) }}
                      onkeydown={(e) => acKeydown(e, ing)}
                      placeholder="Ingredient name"
                      autocomplete="off"
                      class="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors focus:border-input focus:bg-background focus:ring-1 focus:ring-ring"
                    />
                    {#if acOpenFor === ing.id && acSuggestions.length > 0}
                      <div class="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                        {#each acSuggestions as entry, i}
                          <button
                            type="button"
                            class="flex w-full items-center justify-between px-2 py-1.5 text-sm hover:bg-accent {i === acActiveIdx ? 'bg-accent' : ''}"
                            onmousedown={() => acSelect(ing, entry)}
                          >
                            <span>{entry.name}</span>
                            <span class="rounded px-1.5 py-0.5 text-[10px] font-medium {CATEGORY_COLORS[entry.category] || ''}">{entry.category}</span>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </td>
                <td class="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    bind:value={ing.base_qty}
                    oninput={() => { if (ing.category === 'PREFERMENT') recalcGramsFromBps(ing.id); onFieldChange() }}
                    onblur={() => { ing.base_qty = round2(ing.base_qty); if (ing.category === 'PREFERMENT') recalcGramsFromBps(ing.id) }}
                    class="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-right tabular-nums outline-none transition-colors focus:border-input focus:bg-background focus:ring-1 focus:ring-ring"
                  />
                </td>
                <td class="px-4 py-2">
                  <SelectRoot
                    type="single"
                    value={ing.category}
                    onValueChange={(v) => onCategoryChange(idx, v)}
                    items={CATEGORIES.map((c) => ({ value: c, label: c }))}
                  >
                    <SelectTrigger class="h-7 border-transparent bg-transparent px-2 text-xs hover:border-input">
                      <span>{ing.category}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {#each CATEGORIES as cat}
                        <SelectItem value={cat} label={cat} />
                      {/each}
                    </SelectContent>
                  </SelectRoot>
                </td>
                <td class="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {calc ? formatPct(calc.overall_bakers_pct) : '-'}
                </td>
                <td class="px-4 py-2">
                  <span class="opacity-0 group-hover:opacity-100 transition-opacity">
                    {@render removeBtn(() => removeIngredient(idx), 'Remove ingredient')}
                  </span>
                </td>
              </tr>

              <!-- PF settings sub-row -->
              {#if ing.category === 'PREFERMENT' && ing.preferment_settings}
                <tr class="border-b border-border bg-indigo-50/50">
                  <td colspan="5" class="px-8 py-2.5">
                    <div class="flex flex-wrap items-center gap-4 text-sm">
                      <div class="flex items-center gap-1.5">
                        <span class="text-xs font-medium text-muted-foreground">Type</span>
                        <SelectRoot
                          type="single"
                          value={ing.preferment_settings.type}
                          onValueChange={(v) => onPfTypeChange(ing.id, v)}
                          items={PF_TYPES.map((t) => ({ value: t, label: t }))}
                        >
                          <SelectTrigger class="h-7 w-auto min-w-28 px-2 text-xs">
                            <span>{ing.preferment_settings.type}</span>
                          </SelectTrigger>
                          <SelectContent>
                            {#each PF_TYPES as t}
                              <SelectItem value={t} label={t} />
                            {/each}
                          </SelectContent>
                        </SelectRoot>
                      </div>

                      <div class="flex items-center gap-1.5">
                        <span class="text-xs font-medium text-muted-foreground">DDT</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={ing.preferment_settings.ddt ?? ''}
                          oninput={(e) => {
                            ing.preferment_settings.ddt = e.target.value === '' ? null : parseFloat(e.target.value)
                            scheduleCalc()
                          }}
                          placeholder={ddt}
                          class="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs tabular-nums outline-none ring-ring transition-shadow focus:ring-1"
                        />
                        <span class="text-[10px] text-muted-foreground">&deg;C</span>
                      </div>

                      <div class="flex items-center gap-1.5">
                        <span class="text-xs font-medium text-muted-foreground">Ferment</span>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={ing.preferment_settings.fermentation_duration_min ?? ''}
                          oninput={(e) => {
                            ing.preferment_settings.fermentation_duration_min = e.target.value === '' ? null : parseInt(e.target.value)
                            scheduleCalc()
                          }}
                          placeholder={FERMENTATION_DEFAULTS[ing.preferment_settings.type] ?? 480}
                          class="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs tabular-nums outline-none ring-ring transition-shadow focus:ring-1"
                        />
                        <span class="text-[10px] text-muted-foreground">
                          {formatDuration(ing.preferment_settings.fermentation_duration_min ?? FERMENTATION_DEFAULTS[ing.preferment_settings.type] ?? 480)}
                        </span>
                      </div>

                      {#if getCalcPf(ing.id)?.enabled}
                        {@const cpf = getCalcPf(ing.id)}
                        <Separator orientation="vertical" class="!h-4" />
                        <span class="text-xs text-muted-foreground tabular-nums">
                          Ratio {formatPct(cpf.ratio)} &middot; PF Flour {formatPct(cpf.prefermented_flour_pct)}
                        </span>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-border bg-muted/30">
              <td class="px-4 py-2.5 font-semibold">Total</td>
              <td class="px-4 py-2.5 text-right font-semibold tabular-nums">{formatGrams(ingTotal)}</td>
              <td class="px-4 py-2.5"></td>
              <td class="px-4 py-2.5 text-right font-semibold tabular-nums text-muted-foreground">{formatPct(ingBpTotal)}</td>
              <td class="px-4 py-2.5"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </CardContent>
  </Card>

  <!-- ── Calculated Results ─────────────────────────────── -->

  {#if calculated && calculated.ingredients?.length > 0}
    <Card>
      <CardHeader class="pb-0">
        <CardTitle class="flex items-center gap-2">
          {@render sectionIcon('M3 3v18h18 M18.7 8l-5.1 5.2-2.8-2.7L7 14.3')}
          Calculated Results
        </CardTitle>
      </CardHeader>
      <CardContent class="p-0 pt-4">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-y border-border bg-muted/50">
                <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Ingredient</th>
                <th class="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Overall BP</th>
                <th class="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Formula</th>
                <th class="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">FD BP</th>
                <th class="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Final Dough</th>
                <th class="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Per Item</th>
                <th class="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Batch</th>
              </tr>
            </thead>
            <tbody>
              {#each calculated.ingredients as ing (ing.id)}
                <tr class="border-b border-border last:border-0 transition-colors hover:bg-muted/20">
                  <td class="px-4 py-2">
                    <span class="mr-1.5 font-medium">{ing.name || '(unnamed)'}</span>
                    {@render categoryBadge(ing.category)}
                  </td>
                  <td class="px-4 py-2 text-right tabular-nums">{formatPct(ing.overall_bakers_pct)}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{formatGrams(ing.total_formula_qty)}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{formatPct(ing.final_dough_bakers_pct)}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{formatGrams(ing.final_dough_qty)}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{formatGrams(ing.per_item_weight)}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{formatGrams(ing.batch_qty)}</td>
                </tr>
              {/each}
            </tbody>
            {#if calcTotals}
              <tfoot>
                <tr class="border-t-2 border-border bg-muted/30">
                  <td class="px-4 py-2.5 font-semibold">Total</td>
                  <td class="px-4 py-2.5 text-right font-semibold tabular-nums">{formatPct(calcTotals.overall_bp)}</td>
                  <td class="px-4 py-2.5 text-right font-semibold tabular-nums">{formatGrams(calcTotals.total_formula)}</td>
                  <td class="px-4 py-2.5 text-right font-semibold tabular-nums">{formatPct(calcTotals.final_dough_bp)}</td>
                  <td class="px-4 py-2.5 text-right font-semibold tabular-nums">{formatGrams(calcTotals.final_dough)}</td>
                  <td class="px-4 py-2.5 text-right font-semibold tabular-nums">{formatGrams(calcTotals.per_item)}</td>
                  <td class="px-4 py-2.5 text-right font-semibold tabular-nums">{formatGrams(calcTotals.batch)}</td>
                </tr>
              </tfoot>
            {/if}
          </table>
        </div>
      </CardContent>
    </Card>

    <!-- ── Pre-ferment Breakdown Tables ───────────────────── -->

    {#each pfIngredients as pfIng (pfIng.id)}
      {@const calcPf = getCalcPf(pfIng.id)}
      {@const gramsForPf = pfGrams[pfIng.id] || {}}
      {@const gramsTotal = Object.values(gramsForPf).reduce((s, v) => s + (v || 0), 0)}
      {@const bpTotal = ingredients.reduce((s, i) => {
        if (i.category === 'PREFERMENT' && i.id !== pfIng.id) return s
        const bp = i.preferment_bakers_pcts[pfIng.id]
        return s + (bp != null ? bp : 0)
      }, 0)}
      {@const availableIngs = ingredients.filter((i) => (i.category !== 'PREFERMENT' || i.id === pfIng.id) && gramsForPf[i.id] == null && i.name)}
      {@const pfRequiredCats = PF_REQUIRED_CATEGORIES[pfIng.preferment_settings?.type] || []}

      <Card class="border-indigo-200">
        <CardHeader class="flex-row items-center justify-between space-y-0 pb-0">
          <div class="flex items-center gap-2">
            <CardTitle>{pfIng.name}</CardTitle>
            <Badge variant="secondary" class="bg-indigo-50 text-indigo-700 font-normal">
              {pfIng.preferment_settings?.type || 'CUSTOM'}
            </Badge>
          </div>
          {#if calcPf?.enabled}
            <span class="text-xs tabular-nums text-muted-foreground">
              Ratio {formatPct(calcPf.ratio)} &middot; BP {formatPct(calcPf.total_bakers_pct)} &middot; PF Flour {formatPct(calcPf.prefermented_flour_pct)}
            </span>
          {/if}
        </CardHeader>
        <CardContent class="p-0 pt-4">
          {#if pfMismatches[pfIng.id]}
            <div class="mx-6 mb-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              Mismatch: recipe says <span class="font-semibold">{formatGrams(pfMismatches[pfIng.id].k)}</span>
              but breakdown totals <span class="font-semibold">{formatGrams(pfMismatches[pfIng.id].breakdownSum)}</span>
              (off by {formatGrams(pfMismatches[pfIng.id].diff)})
            </div>
          {/if}

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-y border-indigo-100 bg-indigo-50/50">
                  <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Ingredient</th>
                  <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-24">Category</th>
                  <th class="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground w-28">Grams</th>
                  <th class="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground w-24">Baker's %</th>
                  <th class="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {#each ingredients as ing (ing.id)}
                  {#if (ing.category !== 'PREFERMENT' || ing.id === pfIng.id) && gramsForPf[ing.id] != null}
                    {@const bp = ing.preferment_bakers_pcts[pfIng.id]}
                    {@const isSelfRef = ing.id === pfIng.id}
                    {@const isRequired = isSelfRef || pfRequiredCats.includes(ing.category)}
                    <tr class="group border-b border-border last:border-0 transition-colors hover:bg-indigo-50/30">
                      <td class="px-4 py-2 font-medium">
                        {ing.name || '(unnamed)'}
                        {#if isSelfRef}
                          <span class="ml-1 text-[10px] text-muted-foreground">(starter)</span>
                        {:else if isRequired}
                          <span class="ml-1 text-[10px] text-muted-foreground">(required)</span>
                        {/if}
                      </td>
                      <td class="px-4 py-2">{@render categoryBadge(ing.category)}</td>
                      <td class="px-4 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={gramsForPf[ing.id] ?? 0}
                          oninput={(e) => onPfGramChange(pfIng.id, ing.id, e.target.value)}
                          onblur={() => {
                            if (pfGrams[pfIng.id]?.[ing.id] != null) {
                              pfGrams[pfIng.id][ing.id] = round2(pfGrams[pfIng.id][ing.id])
                              recalcBpsFromGrams(pfIng.id)
                              scheduleCalc()
                            }
                          }}
                          class="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-right tabular-nums outline-none ring-ring transition-shadow focus:ring-1"
                        />
                      </td>
                      <td class="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {bp != null ? formatPct(bp) : '-'}
                      </td>
                      <td class="px-4 py-2">
                        {#if !isRequired}
                          <span class="opacity-0 group-hover:opacity-100 transition-opacity">
                            {@render removeBtn(() => removeIngredientFromPf(pfIng.id, ing.id), 'Remove from pre-ferment')}
                          </span>
                        {/if}
                      </td>
                    </tr>
                  {/if}
                {/each}
              </tbody>
              <tfoot>
                <tr class="border-t-2 border-border bg-indigo-50/30">
                  <td class="px-4 py-2.5 font-semibold">Total</td>
                  <td class="px-4 py-2.5"></td>
                  <td class="px-4 py-2.5 text-right font-semibold tabular-nums">{formatGrams(gramsTotal)}</td>
                  <td class="px-4 py-2.5 text-right font-semibold tabular-nums text-muted-foreground">{formatPct(bpTotal)}</td>
                  <td class="px-4 py-2.5"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>

        <!-- Add ingredient to this PF -->
        {#if availableIngs.length > 0}
          <CardFooter class="border-t border-border pt-3">
            <div class="flex items-center gap-2">
              <SelectRoot
                type="single"
                value={pfAddSelect[pfIng.id] || ''}
                onValueChange={(v) => {
                  pfAddSelect[pfIng.id] = v
                  if (v) addIngredientToPf(pfIng.id, v)
                }}
                items={[
                  { value: '', label: 'Add ingredient...' },
                  ...availableIngs.map((a) => ({ value: a.id, label: `${a.name} (${a.category})` })),
                ]}
              >
                <SelectTrigger class="w-auto min-w-48">
                  <span class="text-muted-foreground">Add ingredient...</span>
                </SelectTrigger>
                <SelectContent>
                  {#each availableIngs as avail (avail.id)}
                    <SelectItem value={avail.id} label="{avail.name} ({avail.category})" />
                  {/each}
                </SelectContent>
              </SelectRoot>
            </div>
          </CardFooter>
        {/if}
      </Card>
    {/each}

    <!-- ── Autolyse Split ─────────────────────────────────── -->

    {#if calculated?.autolyse}
      <Card class="border-teal-200">
        <CardHeader class="pb-0">
          <CardTitle class="flex items-center gap-2">
            {@render sectionIcon('M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83')}
            Autolyse Split
            <Badge variant="secondary" class="bg-teal-50 text-teal-700 font-normal">
              {calculated.autolyse.autolyse_duration_min} min rest
            </Badge>
            {#if Object.keys(autolyseOverrides).length > 0}
              <Button variant="ghost" size="sm" onclick={resetAutolyseOverrides} class="ml-auto text-xs text-muted-foreground">
                Reset to defaults
              </Button>
            {/if}
          </CardTitle>
          <p class="text-xs text-muted-foreground mt-1">Drag ingredients between lists to customize the split</p>
        </CardHeader>
        <CardContent>
          {#if autolyseWarnings.length > 0}
            <div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-4">
              {autolyseWarnings[0].message}
            </div>
          {/if}
          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h3 class="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-teal-700">
                <span class="inline-block h-2 w-2 rounded-full bg-teal-500"></span>
                Autolyse Mix
              </h3>
              <div
                bind:this={autolyseListEl}
                data-list-type="autolyse"
                class="min-h-[3rem] space-y-1 rounded-lg border-2 border-dashed border-teal-200 p-2"
              >
                {#each calculated.autolyse.autolyse_ingredients as item (item.id)}
                  <div
                    data-ingredient-id={item.id}
                    class="flex cursor-grab items-center justify-between rounded-md bg-teal-50/50 px-3 py-1.5 text-sm active:cursor-grabbing"
                  >
                    <span class="flex items-center gap-1.5 font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-teal-400"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                      {item.name}
                    </span>
                    <span class="tabular-nums text-muted-foreground">{formatGrams(item.qty)}</span>
                  </div>
                {/each}
              </div>
            </div>
            <div>
              <h3 class="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-orange-700">
                <span class="inline-block h-2 w-2 rounded-full bg-orange-500"></span>
                Final Mix (after rest)
              </h3>
              <div
                bind:this={finalMixListEl}
                data-list-type="final"
                class="min-h-[3rem] space-y-1 rounded-lg border-2 border-dashed border-orange-200 p-2"
              >
                {#each calculated.autolyse.final_mix_ingredients as item (item.id)}
                  <div
                    data-ingredient-id={item.id}
                    class="flex cursor-grab items-center justify-between rounded-md bg-orange-50/50 px-3 py-1.5 text-sm active:cursor-grabbing"
                  >
                    <span class="flex items-center gap-1.5 font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-orange-400"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                      {item.name}
                    </span>
                    <span class="tabular-nums text-muted-foreground">{formatGrams(item.qty)}</span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    {/if}
  {/if}

  <!-- ── Process Steps ──────────────────────────────────── -->

  <Card>
    <CardHeader class="flex-row items-center justify-between space-y-0">
      <CardTitle class="flex items-center gap-2">
        {@render sectionIcon('M12 20h9 M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.854z')}
        Process Steps
      </CardTitle>
      <div class="flex gap-2">
        {#if processSteps.length === 0}
          <Button variant="outline" size="sm" onclick={suggestSteps} class="border-teal-300 text-teal-700 hover:bg-teal-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83"/></svg>
            Suggest Mixing Steps
          </Button>
        {:else}
          <Button variant="ghost" size="sm" onclick={resuggestSteps} class="text-teal-700 hover:bg-teal-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83"/></svg>
            Re-suggest
          </Button>
        {/if}
        <Button variant="outline" size="sm" onclick={addProcessStep}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Add Step
        </Button>
      </div>
    </CardHeader>

    {#if processSteps.length === 0}
      <CardContent class="pt-0">
        <div class="flex flex-col items-center rounded-lg border border-dashed border-border py-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mb-2 text-muted-foreground/50"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.854z"/></svg>
          <p class="text-sm text-muted-foreground">No process steps yet.</p>
          <p class="text-xs text-muted-foreground/70">Add steps to document your method.</p>
        </div>
      </CardContent>
    {:else}
      <CardContent class="p-0">
        <div class="divide-y divide-border" bind:this={stepsContainer}>
          {#each processSteps as step, idx (step.id)}
            <div class="group px-6 py-4 transition-colors hover:bg-muted/20">
              <div class="flex items-start gap-3">
                <!-- Drag handle -->
                <div class="step-drag-handle flex cursor-grab items-center pt-2 text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                </div>

                <!-- Step number -->
                <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {idx + 1}
                </span>

                <!-- Step content -->
                <div class="flex-1 space-y-2.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <SelectRoot
                      type="single"
                      value={step.stage}
                      onValueChange={(v) => { step.stage = v }}
                      items={PROCESS_STAGES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
                    >
                      <SelectTrigger class="h-7 w-auto min-w-28 px-2.5 text-xs font-medium">
                        <span>{step.stage.replace(/_/g, ' ')}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {#each PROCESS_STAGES as stage}
                          <SelectItem value={stage} label={stage.replace(/_/g, ' ')} />
                        {/each}
                      </SelectContent>
                    </SelectRoot>
                    <input
                      type="text"
                      bind:value={step.title}
                      placeholder="Step title"
                      class="flex-1 min-w-40 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-medium outline-none ring-ring transition-shadow focus:ring-1"
                    />
                  </div>
                  <textarea
                    bind:value={step.description}
                    placeholder="Description..."
                    rows="2"
                    class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none ring-ring transition-shadow focus:ring-1"
                  ></textarea>
                  <div class="flex flex-wrap gap-3">
                    <div class="w-28">
                      <label class="mb-1 block text-[10px] font-medium text-muted-foreground">Duration (min)</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        bind:value={step.duration_min}
                        class="w-full rounded-md border border-input bg-background px-2 py-1 text-xs tabular-nums outline-none ring-ring transition-shadow focus:ring-1"
                      />
                    </div>
                    <div class="w-28">
                      <label class="mb-1 block text-[10px] font-medium text-muted-foreground">Temp (&deg;C)</label>
                      <input
                        type="number"
                        step="0.5"
                        bind:value={step.temperature}
                        class="w-full rounded-md border border-input bg-background px-2 py-1 text-xs tabular-nums outline-none ring-ring transition-shadow focus:ring-1"
                      />
                    </div>
                    <div class="w-28">
                      <label class="mb-1 block text-[10px] font-medium text-muted-foreground">Mixer Speed</label>
                      <input
                        type="text"
                        bind:value={step.mixer_speed}
                        placeholder="e.g. 1st"
                        class="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none ring-ring transition-shadow focus:ring-1"
                      />
                    </div>
                    <div class="flex-1 min-w-40">
                      <label class="mb-1 block text-[10px] font-medium text-muted-foreground">Notes</label>
                      <input
                        type="text"
                        bind:value={step.notes}
                        placeholder="Optional notes..."
                        class="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none ring-ring transition-shadow focus:ring-1"
                      />
                    </div>
                  </div>
                </div>

                <!-- Remove -->
                <span class="opacity-0 group-hover:opacity-100 transition-opacity">
                  {@render removeBtn(() => removeProcessStep(idx), 'Remove step')}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </CardContent>
    {/if}
  </Card>
</div>

