// §2 (AUTH-1..AUTH-8), §11.6: users, JWT tokens and the global guard.
export { AuthModule } from './lib/auth.module';
export { AuthController } from './lib/auth.controller';
export { MeController } from './lib/me.controller';
export { AuthService } from './lib/auth.service';
export { UsersService } from './lib/users.service';
export { PasswordService } from './lib/password.service';
export { JwtAuthGuard } from './lib/jwt-auth.guard';
export { Public, IS_PUBLIC_KEY } from './lib/public.decorator';
export { CurrentUser } from './lib/current-user.decorator';
export type { AuthUser } from './lib/auth-user';
export { SignUpDto } from './lib/dto/sign-up.dto';
export { SignInDto } from './lib/dto/sign-in.dto';
export { RefreshDto } from './lib/dto/refresh.dto';
export { AuthResponseDto, UserResponseDto } from './lib/dto/auth-response.dto';
