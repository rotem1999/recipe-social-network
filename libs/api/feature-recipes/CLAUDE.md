# feature-recipes

SPEC §3.1–§3.3. Recipes are private by default; the owner alone sets visibility (private/shared/public), edits and deletes.
- Edits create versions; if a recipe is public, all its versions are public.
- Shared: view-only for chosen friends, cookable, still owned by the sharer.
- Save (public or TheMealDB) = local copy; editing a copy forks it with attribution to the source. TheMealDB saves are fetched through data-access-themealdb at save time and get servings 2.
- Images go through data-access-images; the recipe stores the object path.
