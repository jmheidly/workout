import { fail } from '@sveltejs/kit'
import {
  getMixerProfiles,
  createMixerProfile,
  updateMixerProfile,
  deleteMixerProfile,
} from '$lib/server/db.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  return { mixerProfiles: getMixerProfiles(locals.bakery.id) }
}

/** @type {import('./$types').Actions} */
export const actions = {
  create: async ({ request, locals }) => {
    const form = await request.formData()
    const dataStr = form.get('data')?.toString()
    if (!dataStr) return fail(400, { error: 'Missing data' })

    let data
    try {
      data = JSON.parse(dataStr)
    } catch {
      return fail(400, { error: 'Invalid data' })
    }

    if (!data.name?.trim()) return fail(400, { error: 'Name is required' })

    createMixerProfile(locals.user.id, locals.bakery.id, data)
    return { success: true }
  },

  update: async ({ request, locals }) => {
    const form = await request.formData()
    const id = form.get('id')?.toString()
    const dataStr = form.get('data')?.toString()
    if (!id || !dataStr) return fail(400, { error: 'Missing data' })

    let data
    try {
      data = JSON.parse(dataStr)
    } catch {
      return fail(400, { error: 'Invalid data' })
    }

    updateMixerProfile(id, locals.bakery.id, data)
    return { success: true }
  },

  delete: async ({ request, locals }) => {
    const form = await request.formData()
    const id = form.get('id')?.toString()
    if (!id) return fail(400, { error: 'Missing id' })

    deleteMixerProfile(id, locals.bakery.id)
    return { success: true }
  },
}
