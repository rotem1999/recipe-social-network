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
import { UserEntity } from './user.entity';

/** §12.1 `ai_daily_usage` — COOK-8: AI requests per user per UTC day. */
@Entity({ name: 'ai_daily_usage' })
@Unique('uq_ai_daily_usage_user_day', ['userId', 'day'])
export class AiDailyUsageEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /** COOK-10: the UTC day, `YYYY-MM-DD` (the `pg` driver returns `date` as a string). */
  @Column({ name: 'day', type: 'date' })
  day!: string;

  /** COOK-8: counted server-side before the OpenRouter call is made. */
  @Column({ name: 'count', type: 'int', default: 0 })
  count!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
