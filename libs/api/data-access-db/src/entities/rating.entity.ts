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
import { RecipeEntity } from './recipe.entity';
import { UserEntity } from './user.entity';

/** §12.1 `ratings` — RATE-1, RATE-4: one whole-star grade (1–5) per user per recipe. */
@Entity({ name: 'ratings' })
@Unique('uq_ratings_recipe_user', ['recipeId', 'userId'])
export class RatingEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  /** RATE-4: ratings attach to the recipe, not to a version. */
  @Column({ name: 'recipe_id', type: 'uuid' })
  recipeId!: string;

  @ManyToOne(() => RecipeEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'recipe_id' })
  recipe?: RecipeEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /** RATE-1: whole stars, 1 to 5 (check constraint in the migration). */
  @Column({ name: 'stars', type: 'smallint' })
  stars!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
