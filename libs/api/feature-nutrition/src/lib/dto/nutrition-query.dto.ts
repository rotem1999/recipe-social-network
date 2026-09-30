import { IsIn, IsOptional } from 'class-validator';

import type { NutritionMode } from '@rsn/shared/util-contracts';

/** NUT-4, NUT-6: `?mode=ingredients|meal`; absent means ingredients. */
export class NutritionQueryDto {
  @IsOptional()
  // UI-43: a message written for people.
  @IsIn(['ingredients', 'meal'], {
    message: 'Show nutrition per ingredient or for the whole meal',
  })
  mode?: NutritionMode;
}
