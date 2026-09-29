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
  @IsUUID()
  recipeId!: string;

  /** COOK-1: 0-based index of the step being cooked. */
  @IsInt()
  @Min(0)
  stepIndex!: number;

  /** COOK-10: optional; at most 500 characters. */
  @IsOptional()
  @IsString()
  @MaxLength(COOK_QUESTION_MAX_LENGTH)
  question?: string;
}
