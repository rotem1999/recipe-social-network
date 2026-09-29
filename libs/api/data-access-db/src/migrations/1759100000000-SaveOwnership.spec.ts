// SPEC §12.1 migration `SaveOwnership` (SAVE-7..10, CAT-7), DB-3/DB-6. The QueryRunner
// is a mock: no database is touched, only the SQL the migration issues is inspected.
import type { QueryRunner } from 'typeorm';
import { SaveOwnership1759100000000 } from './1759100000000-SaveOwnership';

/** Collapses whitespace so the assertions read the SQL, not its indentation. */
function flat(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function runner(): { queryRunner: QueryRunner; sql: () => string[] } {
  const query = jest.fn().mockResolvedValue(undefined);
  return {
    queryRunner: { query } as unknown as QueryRunner,
    sql: () => query.mock.calls.map((call) => flat(String(call[0]))),
  };
}

describe('SaveOwnership1759100000000', () => {
  describe('up', () => {
    it('§12.1 adds forked_at, synced_version_number and external_title as nullable columns first', async () => {
      const { queryRunner, sql } = runner();

      await new SaveOwnership1759100000000().up(queryRunner);

      const [first] = sql();
      expect(first).toMatch(/^ALTER TABLE "recipes"/);
      expect(first).toContain('ADD COLUMN "forked_at" timestamptz');
      expect(first).toContain('ADD COLUMN "synced_version_number" int');
      expect(first).toContain('ADD COLUMN "external_title" text');
      expect(first).not.toMatch(/NOT NULL/);
    });

    it('SAVE-7 backfills forked_at from updated_at on edited copies of user recipes and on TheMealDB copies with more than one version', async () => {
      const { queryRunner, sql } = runner();

      await new SaveOwnership1759100000000().up(queryRunner);

      const forked = sql().find((statement) =>
        statement.includes('SET "forked_at"'),
      );
      expect(forked).toBeDefined();
      expect(forked).toContain('SET "forked_at" = "updated_at"');
      expect(forked).toContain(
        '"saved_from_recipe_id" IS NOT NULL AND "forked_from_recipe_id" IS NOT NULL',
      );
      expect(forked).toContain(`"source" = 'themealdb'`);
      expect(forked).toMatch(/count\(\*\) FROM "recipe_versions".*> 1/);
    });

    it('SAVE-9 backfills external_title from the version 1 title of TheMealDB rows', async () => {
      const { queryRunner, sql } = runner();

      await new SaveOwnership1759100000000().up(queryRunner);

      const title = sql().find((statement) =>
        statement.includes('SET "external_title"'),
      );
      expect(title).toBeDefined();
      expect(title).toContain('SET "external_title" = v."title"');
      expect(title).toContain(`r."source" = 'themealdb'`);
      expect(title).toContain('v."version_number" = 1');
    });

    it('SAVE-10 backfills synced_version_number with the source’s current version number on copies of user recipes', async () => {
      const { queryRunner, sql } = runner();

      await new SaveOwnership1759100000000().up(queryRunner);

      const synced = sql().find((statement) =>
        statement.includes('SET "synced_version_number"'),
      );
      expect(synced).toBeDefined();
      expect(synced).toContain('SET "synced_version_number" = v."version_number"');
      expect(synced).toContain('v."id" = s."current_version_id"');
      expect(synced).toContain('r."saved_from_recipe_id" = s."id"');
    });

    it('SAVE-8 deletes the shares of every unforked copy and sets it private, after forked_at is filled', async () => {
      const { queryRunner, sql } = runner();

      await new SaveOwnership1759100000000().up(queryRunner);

      const statements = sql();
      const forkedIndex = statements.findIndex((s) => s.includes('SET "forked_at"'));
      const sharesIndex = statements.findIndex((s) =>
        s.startsWith('DELETE FROM "recipe_shares"'),
      );
      const privateIndex = statements.findIndex((s) =>
        s.includes(`SET "visibility" = 'private'`),
      );
      expect(sharesIndex).toBeGreaterThan(forkedIndex);
      expect(privateIndex).toBeGreaterThan(forkedIndex);

      for (const index of [sharesIndex, privateIndex]) {
        const statement = statements[index];
        expect(statement).toContain(
          `("saved_from_recipe_id" IS NOT NULL OR "source" = 'themealdb')`,
        );
        expect(statement).toContain('"forked_at" IS NULL');
      }
    });

    it('§12.1 issues exactly the six statements of the migration', async () => {
      const { queryRunner, sql } = runner();

      await new SaveOwnership1759100000000().up(queryRunner);

      expect(sql()).toHaveLength(6);
    });
  });

  describe('down', () => {
    it('§12.1 drops the three columns and nothing else', async () => {
      const { queryRunner, sql } = runner();

      await new SaveOwnership1759100000000().down(queryRunner);

      const statements = sql();
      expect(statements).toHaveLength(1);
      expect(statements[0]).toMatch(/^ALTER TABLE "recipes"/);
      expect(statements[0]).toContain('DROP COLUMN IF EXISTS "external_title"');
      expect(statements[0]).toContain(
        'DROP COLUMN IF EXISTS "synced_version_number"',
      );
      expect(statements[0]).toContain('DROP COLUMN IF EXISTS "forked_at"');
    });
  });
});
