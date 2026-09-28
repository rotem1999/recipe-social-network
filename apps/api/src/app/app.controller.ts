// GET /health (SPEC §11.6): liveness, unauthenticated (AUTH-8).
import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@rsn/shared/util-contracts';
import { Public } from '@rsn/api/feature-auth';

@Controller('health')
export class AppController {
  @Public()
  @Get()
  health(): HealthResponse {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
