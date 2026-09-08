# apps/api-e2e

Jest end-to-end tests against a running API. Needs the local PostgreSQL 18.6 (Windows service `postgresql-x64-18`, port 5432) reached through the DB_* env keys. Schema comes from migrations only, never `synchronize`.
