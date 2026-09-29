import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { COOK_QUESTION_MAX_LENGTH } from '@rsn/shared/util-domain';
import type { CookAskRequest } from '@rsn/shared/util-contracts';

/** COOK-10: the body of `POST /cook/ask` (§11.6 ids are UUIDs). */
export class CookAskDto implements CookAskRequest {
  // UI-43: messages written for people.
  @IsUUID(undefined, { message: 'Open a recipe to ask about' })
  recipeId!: string;

  /** COOK-1: 0-based index of the step being cooked. */
  @IsInt({ message: 'Choose a step to ask about' })
  @Min(0, { message: 'Choose a step to ask about' })
  stepIndex!: number;

  /** COOK-10: optional; at most 500 characters. */
  @IsOptional()
  @IsString({ message: 'Write your question as text' })
  @MaxLength(COOK_QUESTION_MAX_LENGTH, {
    message: `Questions can be at most ${COOK_QUESTION_MAX_LENGTH} characters`,
  })
  question?: string;
}
