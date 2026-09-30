// SPEC §11.7 DOC-5: every listed error status is documented with the one shared
// ErrorResponseDto of the Nest error shape (§11.6). Checked on a document built from a
// stub controller, not on the feature controllers.
import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { ApiErrorResponses } from './api-error-responses.decorator';
import type { ApiErrorStatus } from './api-error-responses.decorator';
import { buildDocumentConfig } from './docs-options';

const ALL_STATUSES: ApiErrorStatus[] = [400, 401, 403, 404, 409, 429, 503];

const REASON_PHRASES: Record<ApiErrorStatus, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
};

@Controller('stub')
class StubController {
  @Get('all')
  @ApiErrorResponses(...ALL_STATUSES)
  all(): string {
    return 'all';
  }

  @Get('some')
  @ApiErrorResponses(400, 404)
  some(): string {
    return 'some';
  }

  @Get('none')
  none(): string {
    return 'none';
  }
}

@Controller('class-level')
@ApiErrorResponses(401)
class ClassLevelController {
  @Get()
  get(): string {
    return 'class-level';
  }
}

interface ResponseObject {
  description: string;
  content?: Record<string, { schema: { $ref?: string } }>;
}

function responsesOf(
  document: OpenAPIObject,
  path: string,
): Record<string, ResponseObject> {
  return document.paths[path].get?.responses as Record<string, ResponseObject>;
}

describe('ApiErrorResponses', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StubController, ClassLevelController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    document = SwaggerModule.createDocument(app, buildDocumentConfig());
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(ALL_STATUSES)(
    'DOC-5 documents %p with its reason phrase and the ErrorResponseDto schema',
    (status) => {
      const response = responsesOf(document, '/stub/all')[String(status)];

      expect(response).toBeDefined();
      expect(response.description).toBe(REASON_PHRASES[status]);
      expect(response.content?.['application/json']?.schema).toEqual({
        $ref: '#/components/schemas/ErrorResponseDto',
      });
    },
  );

  it('DOC-5 lists only the statuses it is given', () => {
    // No success response is declared on the stub; @nestjs/swagger adds its default
    // 200 only to operations that declare no response at all (see the next test).
    const responses = responsesOf(document, '/stub/some');

    expect(Object.keys(responses).sort()).toEqual(['400', '404']);
  });

  it('DOC-5 adds no error response to an operation without the decorator', () => {
    expect(Object.keys(responsesOf(document, '/stub/none'))).toEqual(['200']);
  });

  it('DOC-5 applied to a controller class documents the status on its operations', () => {
    const response = responsesOf(document, '/class-level')['401'];

    expect(response.description).toBe('Unauthorized');
    expect(response.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/ErrorResponseDto',
    });
  });
});

describe('ErrorResponseDto', () => {
  it('DOC-5 documents message as one string or a list of strings (§11.6 Nest error shape)', async () => {
    @Controller('dto')
    class DtoController {
      @Get()
      @ApiErrorResponses(400)
      get(): string {
        return 'dto';
      }
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [DtoController],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    try {
      const document = SwaggerModule.createDocument(app, buildDocumentConfig());
      const schema = document.components?.schemas?.['ErrorResponseDto'] as {
        properties: Record<string, unknown>;
      };

      expect(schema).toBeDefined();
      expect(schema.properties['message']).toEqual(
        expect.objectContaining({
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
        }),
      );
    } finally {
      await app.close();
    }
  });
});
