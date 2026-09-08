# data-access-usda

FoodData Central client. Base USDA_FDC_BASE_URL, key as `?api_key=` (USDA_FDC_KEY). Use `POST /foods/search` with a JSON body (GET with a dataType filter returns 400) and `GET /food/{fdcId}`. Meal-name lookup filters `dataType: ["Survey (FNDDS)"]`. Nutrients are per 100 g; energy id 1008, then 2047, then 2048; a missing id means unavailable, never 0. Portions: `foodPortions[].gramWeight`, `foodMeasures[]`. Limit 1,000 req/h per IP (429, then a 1 h block).
