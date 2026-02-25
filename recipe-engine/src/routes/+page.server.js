import { redirect } from '@sveltejs/kit'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  if (locals.user) {
    redirect(302, '/recipes')
  }
  redirect(302, '/login')
}
