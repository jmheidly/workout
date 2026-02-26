import { error } from '@sveltejs/kit'
import { getRecipe, getRecipeVersions, getRecipeVersion, buildRecipeSnapshot, getMixerProfiles } from '$lib/server/db.js'
import { calculateRecipe } from '$lib/server/engine.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ params, locals, url }) {
  const recipe = getRecipe(params.id, locals.bakery.id)
  if (!recipe) {
    error(404, 'Recipe not found')
  }

  const versions = getRecipeVersions(params.id)

  // If ?view=N query param, load that version's snapshot + calculate
  const viewVersion = url.searchParams.get('view')
  let viewData = null
  if (viewVersion) {
    const vNum = parseInt(viewVersion, 10)
    const ver = getRecipeVersion(params.id, vNum)
    if (ver) {
      const snapshot = JSON.parse(ver.snapshot)
      let calculated = null
      try {
        calculated = calculateRecipe({
          ...snapshot,
          id: params.id,
          ingredients: snapshot.ingredients || [],
          process_steps: snapshot.process_steps || [],
        })
      } catch {
        // ignore calc errors for old versions
      }
      viewData = { version: ver, snapshot, calculated }
    }
  }

  // If ?compare=A,B query params, load both for comparison
  const compareParam = url.searchParams.get('compare')
  let compareData = null
  if (compareParam) {
    const [aStr, bStr] = compareParam.split(',')
    const aNum = parseInt(aStr, 10)
    const bNum = parseInt(bStr, 10)

    // Version A — could be a historical version or current
    let snapshotA = null
    let calcA = null
    let metaA = null
    if (aNum === recipe.version) {
      snapshotA = buildRecipeSnapshot(recipe)
      try {
        calcA = calculateRecipe(recipe)
      } catch {}
      metaA = { version_number: recipe.version, created_at: recipe.updated_at, isCurrent: true }
    } else {
      const verA = getRecipeVersion(params.id, aNum)
      if (verA) {
        snapshotA = JSON.parse(verA.snapshot)
        try {
          calcA = calculateRecipe({
            ...snapshotA,
            id: params.id,
            ingredients: snapshotA.ingredients || [],
            process_steps: snapshotA.process_steps || [],
          })
        } catch {}
        metaA = verA
      }
    }

    // Version B
    let snapshotB = null
    let calcB = null
    let metaB = null
    if (bNum === recipe.version) {
      snapshotB = buildRecipeSnapshot(recipe)
      try {
        calcB = calculateRecipe(recipe)
      } catch {}
      metaB = { version_number: recipe.version, created_at: recipe.updated_at, isCurrent: true }
    } else {
      const verB = getRecipeVersion(params.id, bNum)
      if (verB) {
        snapshotB = JSON.parse(verB.snapshot)
        try {
          calcB = calculateRecipe({
            ...snapshotB,
            id: params.id,
            ingredients: snapshotB.ingredients || [],
            process_steps: snapshotB.process_steps || [],
          })
        } catch {}
        metaB = verB
      }
    }

    if (snapshotA && snapshotB) {
      compareData = {
        a: { snapshot: snapshotA, calculated: calcA, meta: metaA },
        b: { snapshot: snapshotB, calculated: calcB, meta: metaB },
      }
    }
  }

  const mixerProfiles = getMixerProfiles(locals.bakery.id)

  return { recipe, versions, viewData, compareData, mixerProfiles }
}
