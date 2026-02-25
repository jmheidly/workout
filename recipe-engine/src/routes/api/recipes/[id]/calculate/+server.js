import { json } from '@sveltejs/kit'
import { calculateRecipe } from '$lib/server/engine.js'

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
  const recipe = await request.json()

  try {
    const result = calculateRecipe(recipe)
    return json(result)
  } catch (e) {
    return json({ error: e.message }, { status: 400 })
  }
}
