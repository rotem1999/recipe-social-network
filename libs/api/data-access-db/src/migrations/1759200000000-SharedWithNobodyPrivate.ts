import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * §4 FR-4 migration `SharedWithNobodyPrivate` (QA-REVIEW-2026-09-30-2 BUG-032): before the
 * fix, removing a friend could leave a `shared` recipe with no `recipe_shares` row. Such a
 * recipe is shared with nobody, so it becomes `private`, the same rule `FriendsService.remove`
 * now applies in its transaction. Data only; no schema change.
 */
export class SharedWithNobodyPrivate1759200000000 implements MigrationInterface {
  name = 'SharedWithNobodyPrivate1759200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "recipes" SET "visibility" = 'private', "updated_at" = now()
      WHERE "visibility" = 'shared'
        AND NOT EXISTS (
          SELECT 1 FROM "recipe_shares" s WHERE s."recipe_id" = "recipes"."id"
        )
    `);
  }

  public async down(): Promise<void> {
    // No-op: which rows were `shared` before `up` is not recorded, and a `shared` recipe with
    // no recipients is the invalid state this migration removes, so there is nothing to restore.
  }
}
