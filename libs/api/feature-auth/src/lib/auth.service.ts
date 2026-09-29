import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserEntity } from '@rsn/api/data-access-db';
import type { AuthResponse } from '@rsn/shared/util-contracts';
import { DUMMY_PASSWORD_HASH, PasswordService } from './password.service';
import { UsersService } from './users.service';
import { normaliseEmail, normaliseUsername } from './normalise';
import { asTtl } from './token-ttl';
import type { SignUpDto } from './dto/sign-up.dto';
import type { SignInDto } from './dto/sign-in.dto';
import type { RefreshDto } from './dto/refresh.dto';

/** AUTH-7: defaults when the TTL keys are absent from the environment. */
const DEFAULT_ACCESS_TTL = '15m';
const DEFAULT_REFRESH_TTL = '30d';
/** AUTH-7: marks a refresh token, so an access token cannot be replayed at /auth/refresh. */
const REFRESH_TOKEN_TYPE = 'refresh';
/** AUTH-5: sign-in reveals nothing about which half of the pair was wrong. */
const INVALID_CREDENTIALS = 'Invalid username or password';
/** Postgres unique_violation, raised when two sign-ups race on the same name. */
const UNIQUE_VIOLATION = '23505';

interface RefreshPayload {
  sub?: unknown;
  typ?: unknown;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { driverError?: { code?: string } } | null | undefined)
    ?.driverError?.code;
  return code === UNIQUE_VIOLATION;
}

/** §2: sign-up, sign-in and refresh (AUTH-5, AUTH-6, AUTH-7). */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** AUTH-5: unique username, unique email when given; 409 when either is taken. */
  async signUp(body: SignUpDto): Promise<AuthResponse> {
    const username = normaliseUsername(body.username);
    const email = normaliseEmail(body.email);

    if ((await this.users.findByUsername(username)) !== null) {
      throw new ConflictException('Username is already taken');
    }
    if (email !== null && (await this.users.findByEmail(email)) !== null) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.passwords.hash(body.password);
    let user: UserEntity;
    try {
      user = await this.users.create({ username, email, passwordHash });
    } catch (error) {
      // Two concurrent sign-ups: the database's unique indexes are the real check.
      if (isUniqueViolation(error)) {
        throw new ConflictException('Username or email is already taken');
      }
      throw error;
    }
    return this.issueTokens(user);
  }

  /** AUTH-5, AUTH-6: same 401, and the same time, for an unknown user and a wrong password. */
  async signIn(body: SignInDto): Promise<AuthResponse> {
    const user = await this.users.findByUsername(body.username);
    if (user === null) {
      // AUTH-6: the same scrypt derivation runs against a fixed dummy hash; its result
      // is ignored, so an unknown username never signs in.
      await this.passwords.verify(body.password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const ok = await this.passwords.verify(body.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.issueTokens(user);
  }

  /** AUTH-7: a valid refresh token buys a new pair; anything else is 401. */
  async refresh(body: RefreshDto): Promise<AuthResponse> {
    // Resolved outside the try so a missing JWT_REFRESH_SECRET keeps its own message.
    const secret = this.refreshSecret();
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(body.refreshToken, {
        secret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.typ !== REFRESH_TOKEN_TYPE || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // The user is reloaded so a deleted account cannot keep refreshing.
    const user = await this.users.findById(payload.sub);
    if (user === null) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueTokens(user);
  }

  /** AUTH-7: access token (`sub`, `username`) plus refresh token (`sub`, `typ`). */
  async issueTokens(user: UserEntity): Promise<AuthResponse> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, username: user.username },
      {
        expiresIn: asTtl(
          this.config.get<string>('JWT_ACCESS_TTL') ?? DEFAULT_ACCESS_TTL,
        ),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, typ: REFRESH_TOKEN_TYPE },
      {
        secret: this.refreshSecret(),
        expiresIn: asTtl(
          this.config.get<string>('JWT_REFRESH_TTL') ?? DEFAULT_REFRESH_TTL,
        ),
      },
    );
    return { accessToken, refreshToken, user: this.users.toDto(user) };
  }

  /** §14: the API refuses to start without it, so it is present by the time this runs. */
  private refreshSecret(): string {
    const secret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (secret === undefined || secret === '') {
      throw new UnauthorizedException('Refresh tokens are not configured');
    }
    return secret;
  }
}
