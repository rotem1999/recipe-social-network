import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '@rsn/api/feature-auth';
import type { AuthUser } from '@rsn/api/feature-auth';
import type { CookAskResponse, QuotaDto } from '@rsn/shared/util-contracts';
import { CookService } from './cook.service';
import { CookAskDto } from './dto/cook-ask.dto';

/** §11.6: `POST /cook/ask`, `GET /cook/quota` (COOK-1..10), behind the global guard (AUTH-8). */
@Controller('cook')
export class CookController {
  constructor(private readonly cook: CookService) {}

  /** COOK-2/COOK-10: one question about the current step. */
  @Post('ask')
  ask(
    @CurrentUser() user: AuthUser,
    @Body() body: CookAskDto,
  ): Promise<CookAskResponse> {
    return this.cook.ask(user, body);
  }

  /** COOK-8/COOK-10: `{ used, limit, remaining }` for today (UTC). */
  @Get('quota')
  quota(@CurrentUser() user: AuthUser): Promise<QuotaDto> {
    return this.cook.quotaFor(user);
  }
}
