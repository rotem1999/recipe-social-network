import { IsInt, Max, Min } from 'class-validator';
import type { RatingRequest } from '@rsn/shared/util-contracts';
import { MAX_STARS, MIN_STARS } from '@rsn/shared/util-domain';

/** RATE-1: body of `PUT /recipes/:id/rating` — whole stars, 1 to 5. */
export class RatingRequestDto implements RatingRequest {
  // UI-43: messages written for people.
  @IsInt({ message: 'Rate with whole stars' })
  @Min(MIN_STARS, { message: `Rate at least ${MIN_STARS} star` })
  @Max(MAX_STARS, { message: `Rate at most ${MAX_STARS} stars` })
  stars!: number;
}
