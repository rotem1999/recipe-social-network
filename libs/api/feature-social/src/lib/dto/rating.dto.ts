import { IsInt, Max, Min } from 'class-validator';
import type { RatingRequest } from '@rsn/shared/util-contracts';
import { MAX_STARS, MIN_STARS } from '@rsn/shared/util-domain';

/** RATE-1: body of `PUT /recipes/:id/rating` — whole stars, 1 to 5. */
export class RatingRequestDto implements RatingRequest {
  @IsInt()
  @Min(MIN_STARS)
  @Max(MAX_STARS)
  stars!: number;
}
