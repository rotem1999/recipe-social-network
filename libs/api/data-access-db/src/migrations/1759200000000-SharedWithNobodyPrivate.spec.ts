// SPEC §4 FR-4 migration `SharedWithNobodyPrivate` (BUG-032), DB-3/DB-6. The QueryRunner
// is a mock: no database is touched, only the SQL the migration issues is inspected.
import type { QueryRunner } from 'typeorm';
import { SharedWithNobodyPrivate1759200000000 } from './1759200000000-SharedWithNobodyPrivate';

/** Collapses whitespace so the assertions read the SQL, not its indentation. */
function flat(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function runner(): { queryRunner: QueryRunner; query: jest.Mock; sql: () => string[] } {
  const query = jest.fn().mockResolvedValue(undefined);
  return {
    queryRunner: { query } as unknown as QueryRunner,
    query,
    sql: () => query.mock.calls.map((call) => flat(String(call[0]))),
  };
}

describe('SharedWithNobodyPrivate1759200000000', () => {
  it('DB-6 keeps the timestamp in the class name and in the `name` property', () => {
    expect(SharedWithNobodyPrivate1759200000000.name).toBe(
      'SharedWithNobodyPrivate1759200000000',
    );
    expect(new SharedWithNobodyPrivate1759200000000().name).toBe(
      'SharedWithNobodyPrivate1759200000000',
    );
  });

  describe('up', () => {
    it('FR-4 makes every shared recipe with no recipe_shares row private, in one statement', async () => {
      const { queryRunner, sql } = runner();

      await new SharedWithNobodyPrivate1759200000000().up(queryRunner);

      const statements = sql();
      expect(statements).toHaveLength(1);
      const [statement] = statements;
      expect(statement).toMatch(/^UPDATE "recipes" SET "visibility" = 'private'/);
      expect(statement).toContain('"updated_at" = now()');
      expect(statement).toContain(`WHERE "visibility" = 'shared'`);
      expect(statement).toContain(
        'AND NOT EXISTS ( SELECT 1 FROM "recipe_shares" s WHERE s."recipe_id" = "recipes"."id" )',
      );
    });

    it('FR-4 applies to every owner, not only to one pair of users', async () => {
      const { queryRunner, query, sql } = runner();

      await new SharedWithNobodyPrivate1759200000000().up(queryRunner);

      expect(sql()[0]).not.toContain('owner_id');
      // No parameters: the rule is the same for all rows.
      expect(query.mock.calls[0]).toHaveLength(1);
    });

    it('FR-4 is data only: it issues no schema change', async () => {
      const { queryRunner, sql } = runner();

      await new SharedWithNobodyPrivate1759200000000().up(queryRunner);

      for (const statement of sql()) {
        expect(statement).not.toMatch(/\b(ALTER|CREATE|DROP|DELETE|TRUNCATE)\b/i);
      }
    });
  });

  describe('down', () => {
    it('FR-4 is a no-op that touches no table', async () => {
      const { queryRunner, query } = runner();

      await expect(
        new SharedWithNobodyPrivate1759200000000().down(),
      ).resolves.toBeUndefined();
      // Called the way TypeORM calls it, with a QueryRunner, it still issues nothing.
      await (
        new SharedWithNobodyPrivate1759200000000().down as (
          runner: QueryRunner,
        ) => Promise<void>
      )(queryRunner);

      expect(query).not.toHaveBeenCalled();
    });
  });
});
