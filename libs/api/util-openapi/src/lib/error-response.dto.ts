// SPEC §11.7 DOC-5: the one error schema of the document, the Nest error shape of §11.6.
import { ApiProperty } from '@nestjs/swagger';
import type { ApiErrorResponse } from '@rsn/shared/util-contracts';

/** §11.6: `{ statusCode, message, error }`, the Nest default error body. */
export class ErrorResponseDto implements ApiErrorResponse {
  /** The HTTP status code. */
  statusCode!: number;

  /** One message, or the list of validation messages of a 400. */
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  /** The HTTP reason phrase, for example `Not Found`. */
  error?: string;
}
