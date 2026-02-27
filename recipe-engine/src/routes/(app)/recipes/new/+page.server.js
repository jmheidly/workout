import { fail, redirect } from '@sveltejs/kit'
import { createRecipe, getMixerProfiles } from '$lib/server/db.js'
import { requireRole } from '$lib/server/auth.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  requireRole(locals, 'owner', 'admin', 'member')
  return { mixerProfiles: getMixerProfiles(locals.bakery.id) }
}

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')
    const form = await request.formData()
    const name = form.get('name')?.toString()?.trim()
    const yieldPerPiece = parseFloat(form.get('yield_per_piece')?.toString() || '0')
    const ddt = parseFloat(form.get('ddt')?.toString() || '24')
    const doughType = form.get('dough_type')?.toString()?.trim() || null

    if (!name) {
      return fail(400, { error: 'Recipe name is required', name, yield_per_piece: yieldPerPiece, ddt, dough_type: doughType })
    }

    const id = createRecipe(locals.user.id, locals.bakery.id, {
      name,
      yield_per_piece: yieldPerPiece,
      ddt,
      dough_type: doughType,
    })

    redirect(302, `/recipes/${id}`)
  },
}
