# data-access-themealdb

v2 client: `{THEMEALDB_BASE_URL}/{THEMEALDB_KEY}/<endpoint>.php` (paid key added to .env by Rotem). Endpoints: search, lookup, filter (≤ 4 ingredients), list, categories, random, randomselection, popular, latest. Mapper: strIngredient1..20 + strMeasure1..20 → ingredients; strInstructions (one blob) → steps; strCategory → category (1:1); servings 2; strMealThumb → image. Source has no servings, nutrition or times. Attribution: "Recipe data and imagery: TheMealDB (https://www.themealdb.com/)".
