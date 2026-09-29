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
import { CommentEntity } from './comment.entity';
import { UserEntity } from './user.entity';

/** §12.1 `comment_votes` — COM-2: one up (1) or down (-1) vote per user per comment. */
@Entity({ name: 'comment_votes' })
@Unique('uq_comment_votes_comment_user', ['commentId', 'userId'])
export class CommentVoteEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'comment_id', type: 'uuid' })
  commentId!: string;

  @ManyToOne(() => CommentEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'comment_id' })
  comment?: CommentEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /** COM-3: 1 or -1; a vote of 0 removes the row. */
  @Column({ name: 'value', type: 'smallint' })
  value!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
