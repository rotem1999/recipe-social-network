import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * §12.1 migration `SaveOwnership` (SAVE-7..10, CAT-7): the columns that tell a saved copy
 * from a fork, the TheMealDB meal name kept for attribution, and the source version a copy
 * last took; then the backfill of existing rows.
 */
export class SaveOwnership1759100000000 implements MigrationInterface {
  name = 'SaveOwnership1759100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recipes"
        ADD COLUMN "forked_at" timestamptz,
        ADD COLUMN "synced_version_number" int,
        ADD COLUMN "external_title" text
    `);

    // SAVE-7: copies of user recipes already edited, and TheMealDB copies with a second version.
    await queryRunner.query(`
      UPDATE "recipes" SET "forked_at" = "updated_at"
      WHERE ("saved_from_recipe_id" IS NOT NULL AND "forked_from_recipe_id" IS NOT NULL)
         OR ("source" = 'themealdb' AND (
              SELECT count(*) FROM "recipe_versions" v WHERE v."recipe_id" = "recipes"."id"
            ) > 1)
    `);

    // SAVE-9: the meal name at save time is the title of version 1.
    await queryRunner.query(`
      UPDATE "recipes" r SET "external_title" = v."title"
      FROM "recipe_versions" v
      WHERE r."source" = 'themealdb' AND v."recipe_id" = r."id" AND v."version_number" = 1
    `);

    // SAVE-10: existing copies are taken to match the source's current version.
    await queryRunner.query(`
      UPDATE "recipes" r SET "synced_version_number" = v."version_number"
      FROM "recipes" s
      JOIN "recipe_versions" v ON v."id" = s."current_version_id"
      WHERE r."saved_from_recipe_id" = s."id"
    `);

    // SAVE-8: every copy still unforked is private and shared with nobody.
    const unforked = `
      SELECT "id" FROM "recipes"
      WHERE ("saved_from_recipe_id" IS NOT NULL OR "source" = 'themealdb')
        AND "forked_at" IS NULL
    `;
    await queryRunner.query(
      `DELETE FROM "recipe_shares" WHERE "recipe_id" IN (${unforked})`,
    );
    await queryRunner.query(
      `UPDATE "recipes" SET "visibility" = 'private' WHERE "id" IN (${unforked})`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recipes"
        DROP COLUMN IF EXISTS "external_title",
        DROP COLUMN IF EXISTS "synced_version_number",
        DROP COLUMN IF EXISTS "forked_at"
    `);
  }
}
