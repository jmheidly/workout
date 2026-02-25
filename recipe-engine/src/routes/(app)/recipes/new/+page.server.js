import { fail, redirect } from '@sveltejs/kit'
import { createRecipe } from '$lib/server/db.js'

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ request, locals }) => {
    const form = await request.formData()
    const name = form.get('name')?.toString()?.trim()
    const yieldPerPiece = parseFloat(form.get('yield_per_piece')?.toString() || '0')
    const ddt = parseFloat(form.get('ddt')?.toString() || '24')

    if (!name) {
      return fail(400, { error: 'Recipe name is required', name, yield_per_piece: yieldPerPiece, ddt })
    }

    const id = createRecipe(locals.user.id, {
      name,
      yield_per_piece: yieldPerPiece,
      ddt
    })

    redirect(302, `/recipes/${id}`)
  }
}
