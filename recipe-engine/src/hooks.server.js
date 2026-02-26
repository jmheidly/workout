import { validateSession, SESSION_COOKIE } from '$lib/server/auth.js'
import { getUserById, getBakeryMember, getBakery } from '$lib/server/db.js'

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
    }
  }

  return resolve(event)
}
