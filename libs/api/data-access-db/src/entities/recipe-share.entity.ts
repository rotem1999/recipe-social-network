import {
  CreateDateColumn,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { RecipeEntity } from './recipe.entity';
import { UserEntity } from './user.entity';

/** §12.1 `recipe_shares` — REC-2, REC-8: one row per (recipe, friend it is shared with). */
@Entity({ name: 'recipe_shares' })
@Unique('uq_recipe_shares_recipe_user', ['recipeId', 'userId'])
export class RecipeShareEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'recipe_id', type: 'uuid' })
  recipeId!: string;

  @ManyToOne(() => RecipeEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'recipe_id' })
  recipe?: RecipeEntity;

  /** FR-4: removing a friend removes every share between the two users. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
