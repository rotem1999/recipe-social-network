// SPEC §11.7 DOC-4, DOC-5: response classes of feature-cook, kept in step with
// util-contracts, and the COOK-10 429 body.
import type { CookAskResponse, QuotaDto } from '@rsn/shared/util-contracts';

/** COOK-8, COOK-10: today's (UTC) AI requests of the caller. */
export class QuotaResponseDto implements QuotaDto {
  used!: number;
  limit!: number;
  remaining!: number;
}

/** COOK-10: the answer to one cook-mode question. */
export class CookAskResponseDto implements CookAskResponse {
  /** COOK-10: plain text, under 120 words. */
  answer!: string;

  quota!: QuotaResponseDto;

  /** The OpenRouter model that answered (§10). */
  model!: string;

  promptTokens!: number;
  completionTokens!: number;

  /** OpenRouter `usage.cost` in credits (1 credit = $1). */
  cost!: number;
}

/**
 * COOK-8, COOK-10: the 429 body of `POST /cook/ask` and `POST /recommend` when the
 * daily AI quota is used up; `quota` carries the remaining count.
 */
export class QuotaExceededResponseDto {
  /** Always 429. */
  statusCode!: number;

  message!: string;

  quota!: QuotaResponseDto;
}
