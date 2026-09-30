// GET /health (SPEC §11.6): liveness, unauthenticated (AUTH-8).
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@rsn/shared/util-contracts';
import { Public } from '@rsn/api/feature-auth';

// DOC-2 tag; public (AUTH-8), so no bearer requirement (DOC-6).
@ApiTags('health')
@Controller('health')
export class AppController {
  @Public()
  // DOC-4: apps/api holds no DTO classes, so the HealthResponse body is declared inline.
  @ApiOkResponse({
    description: 'The API is up.',
    schema: {
      type: 'object',
      required: ['status', 'time'],
      properties: {
        status: { type: 'string', enum: ['ok'] },
        time: { type: 'string', format: 'date-time' },
      },
    },
  })
  @Get()
  health(): HealthResponse {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
