import { redirect } from '@sveltejs/kit'
import { validateSession, SESSION_COOKIE } from '$lib/server/auth.js'
import {
  getUserById,
  getBakeryMember,
  getBakery,
  getBakerySubscription,
} from '$lib/server/db.js'
import { getSubscriptionStatus } from '$lib/server/plans.js'

const VERIFY_BYPASS_PATHS = [
  '/verify-email',
  '/login',
  '/logout',
  '/signup',
  '/health',
  '/terms',
  '/privacy',
  '/mfa',
  '/api/mfa',
]

const SUBSCRIPTION_BYPASS_PATHS = [
  '/bakeries/settings/billing',
  '/api/stripe',
  '/login',
  '/logout',
  '/signup',
  '/health',
  '/terms',
  '/privacy',
  '/verify-email',
  '/bakeries',
  '/invite',
  '/settings',
]

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const token = event.cookies.get(SESSION_COOKIE)

  if (token) {
    const result = validateSession(token)
    if (result) {
      event.locals.user = result.user
      event.locals.session = result.session

      // Resolve bakery context
      const user = getUserById(result.user.id)
      if (user?.active_bakery_id) {
        const member = getBakeryMember(user.active_bakery_id, user.id)
        if (member) {
          const bakery = getBakery(user.active_bakery_id)
          if (bakery) {
            event.locals.bakery = {
              id: bakery.id,
              name: bakery.name,
              slug: bakery.slug,
              role: member.role,
            }
          }
        }
      }

      // Gate unverified users → redirect to /verify-email
      if (!result.user.email_verified_at) {
        const path = event.url.pathname
        const allowed = VERIFY_BYPASS_PATHS.some(
          (p) => path === p || path.startsWith(p + '/')
        )
        if (!allowed) {
          redirect(302, '/verify-email')
        }
      }

      // Gate inactive subscriptions → redirect to billing
      if (event.locals.bakery) {
        const path = event.url.pathname
        const bypassed = SUBSCRIPTION_BYPASS_PATHS.some(
          (p) => path === p || path.startsWith(p + '/')
        )
        if (!bypassed) {
          const sub = getBakerySubscription(event.locals.bakery.id)
          const status = getSubscriptionStatus(sub)
          event.locals.subscription = status
          if (!status.active) {
            redirect(302, '/bakeries/settings/billing')
          }
        } else {
          // Still attach subscription for bypassed pages that might need it
          const sub = getBakerySubscription(event.locals.bakery.id)
          event.locals.subscription = getSubscriptionStatus(sub)
        }
      }
    }
  }

  const response = await resolve(event)

  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains'
    )
  }

  return response
}
