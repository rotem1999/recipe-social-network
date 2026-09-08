# util-domain

Types, enums, invariants (SPEC §3–§6):
- Visibility: `private` | `shared` | `public`.
- Categories (TheMealDB's 14, one per recipe): Beef, Breakfast, Chicken, Dessert, Goat, Lamb, Miscellaneous, Pasta, Pork, Seafood, Side, Starter, Vegan, Vegetarian.
- Units: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, none.
- Ingredient: quantity (decimal, empty = "to taste"), unit, name, note?. Step: text, durationMinutes?.
- Recipe: title, description?, category, servings ≥ 1, ingredients ≥ 1, steps ≥ 1, prepMinutes?, cookMinutes?, images.
- Rating: whole stars 1–5, average 1.00–5.00. Comment votes: integer points.
