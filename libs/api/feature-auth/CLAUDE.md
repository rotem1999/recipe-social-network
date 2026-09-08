# feature-auth

Username + password sign-in (SPEC §2). The password hash lives in PostgreSQL through data-access-db. The backend issues JWT access and refresh tokens; secrets and TTLs from JWT_ACCESS_* and JWT_REFRESH_*. A guard ties every request to the signed-in user. No Firebase Auth, no Google sign-in.
