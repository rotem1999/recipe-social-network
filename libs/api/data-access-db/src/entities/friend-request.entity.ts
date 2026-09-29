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

/**
 * §12.1 `friend_requests.status`. The values are SPEC §12.1's; no shared union exists in
 * `@rsn/shared/util-domain`, so the column type is declared here.
 */
export const FRIEND_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'declined',
] as const;
export type FriendRequestStatus = (typeof FRIEND_REQUEST_STATUSES)[number];

/** §12.1 `friend_requests` — FR-2: a friendship is an `accepted` row in either direction. */
@Entity({ name: 'friend_requests' })
@Unique('uq_friend_requests_from_to', ['fromUserId', 'toUserId'])
export class FriendRequestEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'from_user_id', type: 'uuid' })
  fromUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'from_user_id' })
  fromUser?: UserEntity;

  @Column({ name: 'to_user_id', type: 'uuid' })
  toUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'to_user_id' })
  toUser?: UserEntity;

  /** FR-4: `pending` until the receiver accepts or declines. */
  @Column({ name: 'status', type: 'text', default: 'pending' })
  status!: FriendRequestStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
