import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@rsn/api/feature-auth';
import type { AuthUser } from '@rsn/api/feature-auth';
import { ApiErrorResponses } from '@rsn/api/util-openapi';

import { NutritionQueryDto } from './dto/nutrition-query.dto';
import { NutritionResponseDto } from './dto/nutrition-response.dto';
import { NutritionService } from './nutrition.service';

/** §11.6: `GET /recipes/:id/nutrition?mode=` (NUT-1..NUT-10). */
@ApiTags('nutrition')
@ApiBearerAuth()
@Controller('recipes')
export class NutritionController {
  constructor(private readonly nutrition: NutritionService) {}

  // 429: the USDA rate limit passes through (both modes); 503: USDA not configured or
  // not answering in meal mode (ingredients mode leaves the ingredient unmatched).
  @ApiErrorResponses(400, 401, 403, 404, 429, 503)
  @Get(':id/nutrition')
  getNutrition(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: NutritionQueryDto,
  ): Promise<NutritionResponseDto> {
    // NUT-4: ingredient-based calculation is the default.
    return this.nutrition.compute(user, id, query.mode ?? 'ingredients');
  }
}
