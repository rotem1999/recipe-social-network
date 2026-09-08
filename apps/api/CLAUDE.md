# apps/api

NestJS 11.2.3, CommonJS, Jest. The root module imports the Nest modules from `@rsn/api/feature-*`; nothing else lives here.
- Config from env: NODE_ENV, API_PORT, API_GLOBAL_PREFIX, DB_*, JWT_*, provider keys (.env.example, regenerated from SPEC §14).
- This process is the only one that reaches PostgreSQL, OpenRouter, TheMealDB, USDA, Open-Meteo and Firebase.
- No custom webpack config, no deep imports into Nest internals (keeps the NestJS 12 move possible).
- Runs on Rotem's PC for now.
