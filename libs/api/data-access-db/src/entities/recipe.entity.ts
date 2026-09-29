import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
// Type-only imports: erased at runtime, so the TypeORM CLI never has to resolve the @rsn alias.
import type { RecipeSource, Visibility } from '@rsn/shared/util-domain';
import { numericTransformer } from './numeric.transformer';
import { RecipeVersionEntity } from './recipe-version.entity';
import { UserEntity } from './user.entity';

/** §12.1 `recipes` — REC-1..8, SAVE-4..6, CAT-3, RATE-2. */
@Entity({ name: 'recipes' })
@Index('idx_recipes_owner_id', ['ownerId'])
@Index('idx_recipes_visibility', ['visibility'])
export class RecipeEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  /** REC-6: the owner has full ownership; deleting the user removes their recipes. */
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner?: UserEntity;

  /** §3.1: private | shared | public. */
  @Column({ name: 'visibility', type: 'text' })
  visibility!: Visibility;

  /** REC-7: the version currently shown; SET NULL so a version delete never drops the recipe. */
  @Column({ name: 'current_version_id', type: 'uuid', nullable: true })
  currentVersionId!: string | null;

  @ManyToOne(() => RecipeVersionEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'current_version_id' })
  currentVersion?: RecipeVersionEntity | null;

  /** SAVE-4: the public recipe this copy was downloaded from. */
  @Column({ name: 'saved_from_recipe_id', type: 'uuid', nullable: true })
  savedFromRecipeId!: string | null;

  @ManyToOne(() => RecipeEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'saved_from_recipe_id' })
  savedFromRecipe?: RecipeEntity | null;

  /** SAVE-6: attribution set on the first edit of a saved copy. */
  @Column({ name: 'forked_from_recipe_id', type: 'uuid', nullable: true })
  forkedFromRecipeId!: string | null;

  @ManyToOne(() => RecipeEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'forked_from_recipe_id' })
  forkedFromRecipe?: RecipeEntity | null;

  /** CAT-3: user | themealdb. */
  @Column({ name: 'source', type: 'text' })
  source!: RecipeSource;

  /** CAT-3: TheMealDB `idMeal` of the recipe this copy was pulled from. */
  @Column({ name: 'external_id', type: 'text', nullable: true })
  externalId!: string | null;

  /** CAT-6: `strMealThumb`, hosted by TheMealDB (no Firebase upload). */
  @Column({ name: 'external_image_url', type: 'text', nullable: true })
  externalImageUrl!: string | null;

  /** RATE-2: average of all grades, 1.00–5.00, recomputed on every write (RATE-4). */
  @Column({
    name: 'rating_average',
    type: 'numeric',
    precision: 3,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  ratingAverage!: number | null;

  @Column({ name: 'rating_count', type: 'int', default: 0 })
  ratingCount!: number;

  /** §12.1: deleting an own recipe soft-deletes it so saved copies keep their attribution. */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
