import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { CurrentUser } from '@rsn/api/feature-auth';
import type { AuthUser } from '@rsn/api/feature-auth';
import type { NutritionResponse } from '@rsn/shared/util-contracts';

import { NutritionQueryDto } from './dto/nutrition-query.dto';
import { NutritionService } from './nutrition.service';

/** §11.6: `GET /recipes/:id/nutrition?mode=` (NUT-1..NUT-6). */
@Controller('recipes')
export class NutritionController {
  constructor(private readonly nutrition: NutritionService) {}

  @Get(':id/nutrition')
  getNutrition(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: NutritionQueryDto,
  ): Promise<NutritionResponse> {
    // NUT-4: ingredient-based calculation is the default.
    return this.nutrition.compute(user, id, query.mode ?? 'ingredients');
  }
}
