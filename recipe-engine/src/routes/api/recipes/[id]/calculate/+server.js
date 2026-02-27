import { json } from '@sveltejs/kit'
import { calculateRecipe } from '$lib/server/engine.js'

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
  const recipe = await request.json()

  try {
    const result = calculateRecipe(recipe)
    return json(result)
  } catch {
    return json({ error: 'Calculation failed' }, { status: 400 })
  }
}
