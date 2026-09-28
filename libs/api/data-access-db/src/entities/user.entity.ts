import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
// Type-only import: erased at runtime, so the TypeORM CLI never has to resolve the @rsn alias.
import type { Category } from '@rsn/shared/util-domain';

/** §12.1 `users` — AUTH-2, AUTH-5, DISC-6. */
@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  /** AUTH-5: 3–32 chars of [a-z0-9_.-], stored lower-case, unique. */
  @Column({ name: 'username', type: 'text', unique: true })
  username!: string;

  /** AUTH-5: optional, unique when present, stored lower-case. */
  @Column({ name: 'email', type: 'text', nullable: true, unique: true })
  email!: string | null;

  /** AUTH-6: `scrypt$N$r$p$<salt b64>$<key b64>`. */
  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  /** DISC-6: at most 3 categories, pinned in Discover. */
  @Column({
    name: 'favourite_categories',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  favouriteCategories!: Category[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
