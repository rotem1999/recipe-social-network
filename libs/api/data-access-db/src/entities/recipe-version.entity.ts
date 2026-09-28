import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
// Type-only imports: erased at runtime, so the TypeORM CLI never has to resolve the @rsn alias.
import type { Category, Ingredient, Step } from '@rsn/shared/util-domain';
import { RecipeEntity } from './recipe.entity';

/** §12.1 `recipe_versions` — §3.1.1, REC-7, IMG-3. */
@Entity({ name: 'recipe_versions' })
@Unique('uq_recipe_versions_recipe_version', ['recipeId', 'versionNumber'])
export class RecipeVersionEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'recipe_id', type: 'uuid' })
  recipeId!: string;

  @ManyToOne(() => RecipeEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'recipe_id' })
  recipe?: RecipeEntity;

  /** REC-7: 1-based, unique within the recipe. */
  @Column({ name: 'version_number', type: 'int' })
  versionNumber!: number;

  @Column({ name: 'title', type: 'text' })
  title!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  /** DISC-8: exactly one of the 14 categories. */
  @Column({ name: 'category', type: 'text' })
  category!: Category;

  /** §3.1.1: integer >= 1 (CAT-4 default 2 for catalogue imports). */
  @Column({ name: 'servings', type: 'int' })
  servings!: number;

  @Column({ name: 'prep_minutes', type: 'int', nullable: true })
  prepMinutes!: number | null;

  @Column({ name: 'cook_minutes', type: 'int', nullable: true })
  cookMinutes!: number | null;

  /** §3.1.1: ordered structured ingredients. */
  @Column({ name: 'ingredients', type: 'jsonb' })
  ingredients!: Ingredient[];

  /** §3.1.1: ordered steps, optional timer per step. */
  @Column({ name: 'steps', type: 'jsonb' })
  steps!: Step[];

  /** IMG-3, IMG-6: Firebase object paths `recipes/<recipeId>/<uuid>.<ext>`, at most 3. */
  @Column({
    name: 'image_paths',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  imagePaths!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
