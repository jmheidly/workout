const Database = require('better-sqlite3')
const db = new Database('data/recipe-engine.db')

const recipeId = process.argv[2]
const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId)
const ingredients = db
  .prepare(
    'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order'
  )
  .all(recipeId)

const pfSettings = db
  .prepare(
    'SELECT ps.* FROM preferment_settings ps JOIN recipe_ingredients ri ON ri.id = ps.ingredient_id WHERE ri.recipe_id = ?'
  )
  .all(recipeId)
const pfBps = db
  .prepare(
    'SELECT pb.* FROM preferment_bakers_pcts pb JOIN recipe_ingredients ri ON ri.id = pb.ingredient_id WHERE ri.recipe_id = ?'
  )
  .all(recipeId)

const pfSettingsMap = Object.fromEntries(
  pfSettings.map((s) => [s.ingredient_id, s])
)
const pfBpMap = {}
for (const bp of pfBps) {
  if (!pfBpMap[bp.ingredient_id]) pfBpMap[bp.ingredient_id] = []
  pfBpMap[bp.ingredient_id].push(bp)
}

recipe.ingredients = ingredients.map((i) => ({
  ...i,
  is_flour: Boolean(i.is_flour),
  is_prefermented: Boolean(i.is_prefermented),
  preferment_settings: pfSettingsMap[i.id] || null,
  preferment_bakers_pcts: pfBpMap[i.id] || null,
}))

require('fs').writeFileSync('/tmp/recipe_payload.json', JSON.stringify(recipe))
console.log(
  'Built recipe: ' + recipe.name + ' (' + ingredients.length + ' ingredients)'
)
db.close()
