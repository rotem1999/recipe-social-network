import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB-3, DB-6, §12.1: the whole schema in one hand-written migration.
 * `gen_random_uuid()` is built into PostgreSQL 18 (DB-5), so no `pgcrypto` extension is created.
 */
export class InitialSchema1759000000000 implements MigrationInterface {
  name = 'InitialSchema1759000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // users — AUTH-2, AUTH-5, DISC-6
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "username" text NOT NULL,
        "email" text,
        "password_hash" text NOT NULL,
        "favourite_categories" text[] NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_username" UNIQUE ("username"),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);

    // recipes — REC-1..8, SAVE-4..6, CAT-3, RATE-2
    await queryRunner.query(`
      CREATE TABLE "recipes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "visibility" text NOT NULL,
        "current_version_id" uuid,
        "saved_from_recipe_id" uuid,
        "forked_from_recipe_id" uuid,
        "source" text NOT NULL,
        "external_id" text,
        "external_image_url" text,
        "rating_average" numeric(3,2),
        "rating_count" integer NOT NULL DEFAULT 0,
        "deleted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_recipes" PRIMARY KEY ("id"),
        CONSTRAINT "ck_recipes_visibility" CHECK ("visibility" IN ('private', 'shared', 'public')),
        CONSTRAINT "ck_recipes_source" CHECK ("source" IN ('user', 'themealdb'))
      )
    `);

    // recipe_versions — §3.1.1, REC-7, IMG-3
    await queryRunner.query(`
      CREATE TABLE "recipe_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "recipe_id" uuid NOT NULL,
        "version_number" integer NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "category" text NOT NULL,
        "servings" integer NOT NULL,
        "prep_minutes" integer,
        "cook_minutes" integer,
        "ingredients" jsonb NOT NULL,
        "steps" jsonb NOT NULL,
        "image_paths" text[] NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_recipe_versions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_recipe_versions_recipe_version" UNIQUE ("recipe_id", "version_number")
      )
    `);

    // recipe_shares — REC-2, REC-8
    await queryRunner.query(`
      CREATE TABLE "recipe_shares" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "recipe_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_recipe_shares" PRIMARY KEY ("id"),
        CONSTRAINT "uq_recipe_shares_recipe_user" UNIQUE ("recipe_id", "user_id")
      )
    `);

    // friend_requests — FR-2, FR-4
    await queryRunner.query(`
      CREATE TABLE "friend_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "from_user_id" uuid NOT NULL,
        "to_user_id" uuid NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_friend_requests" PRIMARY KEY ("id"),
        CONSTRAINT "uq_friend_requests_from_to" UNIQUE ("from_user_id", "to_user_id"),
        CONSTRAINT "ck_friend_requests_status" CHECK ("status" IN ('pending', 'accepted', 'declined'))
      )
    `);

    // ratings — RATE-1, RATE-4
    await queryRunner.query(`
      CREATE TABLE "ratings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "recipe_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "stars" smallint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ratings" PRIMARY KEY ("id"),
        CONSTRAINT "uq_ratings_recipe_user" UNIQUE ("recipe_id", "user_id"),
        CONSTRAINT "ck_ratings_stars" CHECK ("stars" BETWEEN 1 AND 5)
      )
    `);

    // comments — COM-1, COM-3
    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "recipe_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "body" text NOT NULL,
        "deleted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_comments" PRIMARY KEY ("id")
      )
    `);

    // comment_votes — COM-2
    await queryRunner.query(`
      CREATE TABLE "comment_votes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "comment_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "value" smallint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_comment_votes" PRIMARY KEY ("id"),
        CONSTRAINT "uq_comment_votes_comment_user" UNIQUE ("comment_id", "user_id"),
        CONSTRAINT "ck_comment_votes_value" CHECK ("value" IN (1, -1))
      )
    `);

    // ai_daily_usage — COOK-8
    await queryRunner.query(`
      CREATE TABLE "ai_daily_usage" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "day" date NOT NULL,
        "count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ai_daily_usage" PRIMARY KEY ("id"),
        CONSTRAINT "uq_ai_daily_usage_user_day" UNIQUE ("user_id", "day")
      )
    `);

    // Foreign keys. CASCADE for rows owned by a recipe or a user; SET NULL for the
    // attribution and current-version pointers of §12.1.
    await queryRunner.query(`
      ALTER TABLE "recipes"
        ADD CONSTRAINT "fk_recipes_owner" FOREIGN KEY ("owner_id")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "recipe_versions"
        ADD CONSTRAINT "fk_recipe_versions_recipe" FOREIGN KEY ("recipe_id")
        REFERENCES "recipes" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "recipes"
        ADD CONSTRAINT "fk_recipes_current_version" FOREIGN KEY ("current_version_id")
        REFERENCES "recipe_versions" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "recipes"
        ADD CONSTRAINT "fk_recipes_saved_from" FOREIGN KEY ("saved_from_recipe_id")
        REFERENCES "recipes" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "recipes"
        ADD CONSTRAINT "fk_recipes_forked_from" FOREIGN KEY ("forked_from_recipe_id")
        REFERENCES "recipes" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "recipe_shares"
        ADD CONSTRAINT "fk_recipe_shares_recipe" FOREIGN KEY ("recipe_id")
        REFERENCES "recipes" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "recipe_shares"
        ADD CONSTRAINT "fk_recipe_shares_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "friend_requests"
        ADD CONSTRAINT "fk_friend_requests_from_user" FOREIGN KEY ("from_user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "friend_requests"
        ADD CONSTRAINT "fk_friend_requests_to_user" FOREIGN KEY ("to_user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "ratings"
        ADD CONSTRAINT "fk_ratings_recipe" FOREIGN KEY ("recipe_id")
        REFERENCES "recipes" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "ratings"
        ADD CONSTRAINT "fk_ratings_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "comments"
        ADD CONSTRAINT "fk_comments_recipe" FOREIGN KEY ("recipe_id")
        REFERENCES "recipes" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "comments"
        ADD CONSTRAINT "fk_comments_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "comment_votes"
        ADD CONSTRAINT "fk_comment_votes_comment" FOREIGN KEY ("comment_id")
        REFERENCES "comments" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "comment_votes"
        ADD CONSTRAINT "fk_comment_votes_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "ai_daily_usage"
        ADD CONSTRAINT "fk_ai_daily_usage_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Indexes for the lookups of §3.1, §5 and §6 (the unique constraints above already
    // index their own columns).
    await queryRunner.query(
      `CREATE INDEX "idx_recipes_owner_id" ON "recipes" ("owner_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_recipes_visibility" ON "recipes" ("visibility")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_comments_recipe_id" ON "comments" ("recipe_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_comments_recipe_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_recipes_visibility"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_recipes_owner_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_daily_usage"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comment_votes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ratings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "friend_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recipe_shares"`);
    // recipes.current_version_id references recipe_versions, so drop that FK first.
    await queryRunner.query(
      `ALTER TABLE "recipes" DROP CONSTRAINT IF EXISTS "fk_recipes_current_version"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "recipe_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recipes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
