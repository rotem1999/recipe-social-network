import { Body, Controller, Post } from '@nestjs/common';
import type { AuthUser } from '@rsn/api/feature-auth';
import { CurrentUser } from '@rsn/api/feature-auth';
import type { RecommendResponse } from '@rsn/shared/util-contracts';

import { RecommendRequestDto } from './dto/recommend-request.dto';
import { RecommendService } from './recommend.service';

/** SPEC §11.6: `POST /recommend` (WX-1..WX-10). Authenticated (AUTH-8). */
@Controller('recommend')
export class RecommendController {
  constructor(private readonly recommend: RecommendService) {}

  /** WX-10: weather- and time-based picks for the home or Discover tab. */
  @Post()
  ask(
    @CurrentUser() user: AuthUser,
    @Body() body: RecommendRequestDto,
  ): Promise<RecommendResponse> {
    return this.recommend.recommend(user, body);
  }
}
