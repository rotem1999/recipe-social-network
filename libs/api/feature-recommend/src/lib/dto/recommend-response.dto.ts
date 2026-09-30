// SPEC §11.7 DOC-4: response classes of feature-recommend, kept in step with util-contracts.
import { QuotaResponseDto } from '@rsn/api/feature-cook';
import { RecipeCardResponseDto } from '@rsn/api/feature-recipes';
import type {
  RecommendResponse,
  RecommendationDto,
  WeatherContextDto,
} from '@rsn/shared/util-contracts';

/** WX-9, WX-10: the weather context of the caller's city. */
export class WeatherContextResponseDto implements WeatherContextDto {
  city!: string;
  temperatureC!: number;
  isDay!: boolean;

  /** WX-10: the WMO `weather_code` as a word. */
  condition!: string;

  localHour!: number;

  /** WX-2: the weather line shown in the greeting. */
  line!: string;
}

/** WX-4, WX-10: one pick and the model's reason. */
export class RecommendationResponseDto implements RecommendationDto {
  recipe!: RecipeCardResponseDto;
  reason!: string;
}

/** WX-10: `POST /recommend`. */
export class RecommendResponseDto implements RecommendResponse {
  /** WX-10: up to 3 picks, best first (`home`), or 1 (`discover`). */
  picks!: RecommendationResponseDto[];

  /** WX-10: null when the city cannot be geocoded. */
  weather!: WeatherContextResponseDto | null;

  quota!: QuotaResponseDto;
}
