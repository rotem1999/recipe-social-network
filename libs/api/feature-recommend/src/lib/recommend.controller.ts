import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@rsn/api/feature-auth';
import { CurrentUser } from '@rsn/api/feature-auth';
import { QuotaExceededResponseDto } from '@rsn/api/feature-cook';
import { ApiErrorResponses } from '@rsn/api/util-openapi';

import { RecommendRequestDto } from './dto/recommend-request.dto';
import { RecommendResponseDto } from './dto/recommend-response.dto';
import { RecommendService } from './recommend.service';

/** SPEC §11.6: `POST /recommend` (WX-1..WX-10). Authenticated (AUTH-8). */
@ApiTags('recommend')
@ApiBearerAuth()
@Controller('recommend')
export class RecommendController {
  constructor(private readonly recommend: RecommendService) {}

  /** WX-10: weather- and time-based picks for the home or Discover tab. */
  @ApiErrorResponses(400, 401, 503)
  @ApiResponse({
    status: 429,
    description: 'Daily AI quota reached (COOK-8, COOK-10)',
    type: QuotaExceededResponseDto,
  })
  @Post()
  ask(
    @CurrentUser() user: AuthUser,
    @Body() body: RecommendRequestDto,
  ): Promise<RecommendResponseDto> {
    return this.recommend.recommend(user, body);
  }
}
