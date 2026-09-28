import { IsIn, IsOptional } from 'class-validator';

import type { NutritionMode } from '@rsn/shared/util-contracts';

/** NUT-4, NUT-6: `?mode=ingredients|meal`; absent means ingredients. */
export class NutritionQueryDto {
  @IsOptional()
  @IsIn(['ingredients', 'meal'])
  mode?: NutritionMode;
}
