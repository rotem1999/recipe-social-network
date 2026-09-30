// Public surface of @rsn/web/feature-recipes (SPEC.md §11.3): the Home tab, the
// recipe detail screen, the editor (UI-11) and the card the other web features
// reuse. Sub-components stay private to the library.
export { RecipeCard } from './lib/recipe-card';
export type { RecipeCardProps } from './lib/recipe-card';

export { HomeScreen } from './lib/home-screen';
export type {
  HomeRecommendationContext,
  HomeScreenProps,
} from './lib/home-screen';

export { RecipeDetailScreen } from './lib/recipe-detail-screen';
export type { RecipeDetailScreenProps } from './lib/recipe-detail-screen';

export { RecipeEditorScreen } from './lib/recipe-editor-screen';
// UI-35: the shell's UI-40 Discard clears the editor's kept draft.
export { clearEditorDraft, DRAFT_STORAGE_KEY } from './lib/editor-draft';
export type { RecipeEditorScreenProps } from './lib/recipe-editor-screen';
