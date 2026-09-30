// SPEC §11.7 DOC-5: the error statuses an operation lists, all with ErrorResponseDto.
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.dto';

/**
 * DOC-5: 400 validation; 401 AUTH-8 and a failed sign-in or refresh; 403 and 404
 * ownership and visibility; 409 a taken username or email and friend-request conflicts;
 * 429 the USDA rate-limit pass-through; 503 an outside provider not configured or not
 * answering. The COOK-10 429 has its own body and is declared where it applies.
 */
export type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 503;

const DESCRIPTIONS: Record<ApiErrorStatus, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
};

/** DOC-5: one `ErrorResponseDto` response per listed status. */
export function ApiErrorResponses(
  ...statuses: ApiErrorStatus[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status],
        type: ErrorResponseDto,
      }),
    ),
  );
}
