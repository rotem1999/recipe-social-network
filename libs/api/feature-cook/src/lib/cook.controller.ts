import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@rsn/api/feature-auth';
import type { AuthUser } from '@rsn/api/feature-auth';
import { ApiErrorResponses } from '@rsn/api/util-openapi';
import { CookService } from './cook.service';
import { CookAskDto } from './dto/cook-ask.dto';
import {
  CookAskResponseDto,
  QuotaExceededResponseDto,
  QuotaResponseDto,
} from './dto/cook-response.dto';

/** §11.6: `POST /cook/ask`, `GET /cook/quota` (COOK-1..10), behind the global guard (AUTH-8). */
@ApiTags('cook')
@ApiBearerAuth()
@Controller('cook')
export class CookController {
  constructor(private readonly cook: CookService) {}

  /** COOK-2/COOK-10: one question about the current step. */
  @ApiErrorResponses(400, 401, 403, 404, 503)
  @ApiResponse({
    status: 429,
    description: 'Daily AI quota reached (COOK-8, COOK-10)',
    type: QuotaExceededResponseDto,
  })
  @Post('ask')
  ask(
    @CurrentUser() user: AuthUser,
    @Body() body: CookAskDto,
  ): Promise<CookAskResponseDto> {
    return this.cook.ask(user, body);
  }

  /** COOK-8/COOK-10: `{ used, limit, remaining }` for today (UTC). */
  @ApiErrorResponses(401)
  @Get('quota')
  quota(@CurrentUser() user: AuthUser): Promise<QuotaResponseDto> {
    return this.cook.quotaFor(user);
  }
}
