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
import { RecipeEntity } from './recipe.entity';
import { UserEntity } from './user.entity';

/** §12.1 `comments` — COM-1, COM-3: 1–2000 characters, attached to the recipe. */
@Entity({ name: 'comments' })
@Index('idx_comments_recipe_id', ['recipeId'])
export class CommentEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

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

  @Column({ name: 'body', type: 'text' })
  body!: string;

  /** COM-3: the author can delete their own comment (soft delete). */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
