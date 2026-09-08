# libs/api

scope:api. NestJS 11 modules, TypeORM 1.x, Jest. Each `feature-*` exports one Nest module; each `data-access-*` wraps one external system and is the only place its URL, key or SDK appears. Config comes from the env keys in .env.example. TypeORM 1.x API only: no `Connection`, `@EntityRepository` or `AbstractRepository`.
