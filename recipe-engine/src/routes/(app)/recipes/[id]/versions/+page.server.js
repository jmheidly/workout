import { error } from '@sveltejs/kit'
import {
  getRecipe,
  getRecipeVersions,
  getRecipeVersionCount,
  getRecipeVersion,
  buildRecipeSnapshot,
  getMixerProfiles,
} from '$lib/server/db.js'
import { calculateRecipe } from '$lib/server/engine.js'
import { diffVersions, summarizeChanges } from '$lib/version-diff.js'

/**
 * Generate a human-readable summary, resolving mixer UUIDs to names.
 */
function resolveChangeSummary(changes, mixerNameMap) {
  // Replace mixer UUIDs in the changes before summarizing
  const resolved = changes.map((c) => {
    if (c.type === 'param_changed' && c.field === 'mixer_profile_id') {
      return {
        ...c,
        old: c.old ? mixerNameMap[c.old] || c.old : null,
        new: c.new ? mixerNameMap[c.new] || c.new : null,
      }
    }
    return c
  })
  return summarizeChanges(resolved)
}

/** @type {import('./$types').PageServerLoad} */
export function load({ params, locals, url }) {
  const recipe = getRecipe(params.id, locals.bakery.id)
  if (!recipe) {
    error(404, 'Recipe not found')
  }

  // Pagination — server-side with LIMIT/OFFSET
  const PAGE_SIZE = 10
  const pageParam = url.searchParams.get('page')
  const page = Math.max(1, parseInt(pageParam, 10) || 1)
  const totalCount = getRecipeVersionCount(params.id)
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const versions = getRecipeVersions(params.id, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

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
      metaA = {
        version_number: recipe.version,
        created_at: recipe.updated_at,
        isCurrent: true,
      }
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
      metaB = {
        version_number: recipe.version,
        created_at: recipe.updated_at,
        isCurrent: true,
      }
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
  const mixerNameMap = Object.fromEntries(
    mixerProfiles.map((m) => [m.id, m.name])
  )

  // Build per-version change summaries by diffing adjacent snapshots
  // versions is sorted DESC — [0] is newest on this page, last is oldest on this page
  const changeSummaries = {}
  if (versions.length > 0) {
    // On page 1, diff current (recipes table) vs newest snapshot
    if (page === 1) {
      const currentSnapshot = buildRecipeSnapshot(recipe)
      const newestVer = getRecipeVersion(params.id, versions[0].version_number)
      if (newestVer) {
        const newestSnapshot = JSON.parse(newestVer.snapshot)
        const changes = diffVersions(newestSnapshot, currentSnapshot)
        changeSummaries[recipe.version] = resolveChangeSummary(
          changes,
          mixerNameMap
        )
      }
    }

    // Diff each version against its predecessor
    for (let i = 0; i < versions.length - 1; i++) {
      const newer = getRecipeVersion(params.id, versions[i].version_number)
      const older = getRecipeVersion(params.id, versions[i + 1].version_number)
      if (newer && older) {
        const changes = diffVersions(
          JSON.parse(older.snapshot),
          JSON.parse(newer.snapshot)
        )
        changeSummaries[versions[i].version_number] = resolveChangeSummary(
          changes,
          mixerNameMap
        )
      }
    }

    // For the oldest version on this page, diff against the next older version (from next page)
    const oldest = versions[versions.length - 1]
    if (oldest.version_number > 1) {
      const olderVer = getRecipeVersion(params.id, oldest.version_number - 1)
      const thisVer = getRecipeVersion(params.id, oldest.version_number)
      if (olderVer && thisVer) {
        const changes = diffVersions(
          JSON.parse(olderVer.snapshot),
          JSON.parse(thisVer.snapshot)
        )
        changeSummaries[oldest.version_number] = resolveChangeSummary(
          changes,
          mixerNameMap
        )
      }
    }
  }

  return {
    recipe,
    versions,
    viewData,
    compareData,
    mixerProfiles,
    changeSummaries,
    pagination: { page, pageSize: PAGE_SIZE, totalCount, totalPages },
  }
}
