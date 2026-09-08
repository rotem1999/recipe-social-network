# data-access-db

TypeORM entities, migrations, DataSource. `synchronize` is always false; every schema change is a migration. Connection from DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME. Data to model (SPEC §2–§7): users (username, password hash, email?), recipes with versions and visibility, saved copies with fork attribution, shares to friends, friend requests, ratings (`numeric(3,2)`), comments with votes, favourite categories, per-user daily AI request counts.
