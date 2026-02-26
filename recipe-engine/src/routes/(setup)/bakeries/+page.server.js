import { fail, redirect } from '@sveltejs/kit'
import { getUserBakeries, setActiveBakery, getBakeryMember } from '$lib/server/db.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  const bakeries = getUserBakeries(locals.user.id)
  return { bakeries }
}

/** @type {import('./$types').Actions} */
export const actions = {
  switch: async ({ request, locals }) => {
    const form = await request.formData()
    const bakeryId = form.get('bakery_id')?.toString()
    if (!bakeryId) return fail(400, { error: 'Missing bakery ID' })

    // Verify membership
    const member = getBakeryMember(bakeryId, locals.user.id)
    if (!member) return fail(403, { error: 'Not a member of this bakery' })

    setActiveBakery(locals.user.id, bakeryId)
    redirect(302, '/recipes')
  },
}
