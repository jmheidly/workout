import { fail, redirect } from '@sveltejs/kit'
import { requireRole } from '$lib/server/auth.js'
import {
  getBakery,
  getBakeryBySlug,
  updateBakery,
  deleteBakery,
  getBakerySubscription,
  getBakerySettings,
  updateBakerySettings,
} from '$lib/server/db.js'
import { getStripe } from '$lib/server/stripe.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  requireRole(locals, 'owner', 'admin')
  const bakery = getBakery(locals.bakery.id)
  const bakerySettings = getBakerySettings(locals.bakery.id)
  return { bakeryDetails: bakery, bakerySettings }
}

/** @type {import('./$types').Actions} */
export const actions = {
  update: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin')

    const form = await request.formData()
    const name = form.get('name')?.toString()?.trim()
    let slug = form.get('slug')?.toString()?.trim()?.toLowerCase()

    if (!name) return fail(400, { error: 'Name is required' })
    if (!slug) return fail(400, { error: 'Slug is required' })

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return fail(400, {
        error: 'Slug can only contain lowercase letters, numbers, and hyphens',
      })
    }

    // Check slug uniqueness (excluding self)
    const existing = getBakeryBySlug(slug)
    if (existing && existing.id !== locals.bakery.id) {
      return fail(400, { error: 'A bakery with this slug already exists' })
    }

    updateBakery(locals.bakery.id, { name, slug })
    return { success: true }
  },

  updateSettings: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin')

    const form = await request.formData()
    const windowStr = form.get('rolling_average_window')?.toString()
    const window = parseInt(windowStr, 10)

    if (isNaN(window) || window < 1 || window > 100) {
      return fail(400, { settingsError: 'Window must be between 1 and 100' })
    }

    updateBakerySettings(locals.bakery.id, {
      rolling_average_window: window,
    })

    return { settingsSuccess: true }
  },

  delete: async ({ locals }) => {
    requireRole(locals, 'owner')

    // Cancel Stripe subscription if exists
    const sub = getBakerySubscription(locals.bakery.id)
    if (sub?.stripe_subscription_id) {
      try {
        const stripe = getStripe()
        if (stripe) {
          await stripe.subscriptions.cancel(sub.stripe_subscription_id)
        }
      } catch {
        // Non-blocking — bakery deletion proceeds even if Stripe fails
      }
    }

    deleteBakery(locals.bakery.id)
    redirect(302, '/bakeries')
  },
}
