-- CookBook: create the application role and database (SPEC.md §12 DB-1, DB-2, DB-5, DB-6).
-- Run ONCE as the postgres superuser against the local PostgreSQL 18 service.
-- Afterwards put the same password into DB_PASSWORD in .env.local and run
--   pnpm nx run api-data-access-db:migrate
--
-- HOW TO RUN IN pgAdmin 4
--   1. Open pgAdmin, expand Servers, and connect to "PostgreSQL 18" with the
--      postgres superuser password you chose at installation.
--   2. Select the "postgres" database under that server and open
--      Tools > Query Tool (or right-click the database > Query Tool).
--   3. Click the Open File icon (folder) and pick this file, or paste its contents.
--   4. Replace 'CHANGE_ME' on the CREATE ROLE line with the password you want.
--   5. Press F5 (Execute / Run). The Messages tab should end with "CREATE DATABASE".
--   6. Right-click Databases > Refresh: recipe_social_network now appears.
--
-- HOW TO RUN FROM A TERMINAL (alternative)
--   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d postgres -f docker/setup-database.sql
--
-- pgAdmin's Query Tool runs in autocommit mode, which CREATE DATABASE requires
-- (it cannot run inside a transaction block). Running the script a second time
-- skips the role and reports "database already exists" for the last statement.

-- 1. Application role: login only, no superuser, no create-db or create-role rights.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'recipe_app') THEN
    CREATE ROLE recipe_app LOGIN PASSWORD 'CHANGE_ME' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- 2. Database owned by that role. The migration (DB-6) creates every table in it,
--    so the role needs no further grants.
CREATE DATABASE recipe_social_network
  OWNER recipe_app
  ENCODING 'UTF8';
