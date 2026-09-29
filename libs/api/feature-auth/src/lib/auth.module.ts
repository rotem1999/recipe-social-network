import { Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { DbModule } from '@rsn/api/data-access-db';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { PasswordService } from './password.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { asTtl } from './token-ttl';

/** AUTH-7: default access TTL when `JWT_ACCESS_TTL` is absent. */
const DEFAULT_ACCESS_TTL = '15m';
/** §14: the API refuses to start without these. */
const REQUIRED_SECRETS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;

/**
 * §2: users, tokens and the global guard. `ConfigModule.forRoot({ isGlobal: true })`
 * lives in apps/api, so `ConfigService` is injected without importing anything here.
 */
@Module({
  imports: [
    DbModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): JwtModuleOptions => ({
        // AUTH-7: HS256 access tokens; refresh tokens pass their own secret per call.
        secret: cfg.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: asTtl(
            cfg.get<string>('JWT_ACCESS_TTL') ?? DEFAULT_ACCESS_TTL,
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    UsersService,
    PasswordService,
    JwtAuthGuard,
    // AUTH-8: every route is guarded unless it is marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [UsersService, JwtAuthGuard, JwtModule],
})
export class AuthModule implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  /** §14: refuse to start when a JWT secret is missing rather than sign with `undefined`. */
  onModuleInit(): void {
    const missing = REQUIRED_SECRETS.filter((key) => {
      const value = this.config.get<string>(key);
      return value === undefined || value === '';
    });
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variable(s): ${missing.join(
          ', ',
        )}. Set them in .env.local (see .env.example) before starting the API.`,
      );
    }
  }
}
