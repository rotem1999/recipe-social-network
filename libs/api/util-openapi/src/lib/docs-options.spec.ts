// SPEC §11.7: the document header (DOC-2), the bearer scheme (DOC-6), the Swagger UI
// options per build (DOC-1, DOC-8) and what the document may not hold (DOC-9); TEST-3.
import {
  BEARER_SCHEME_NAME,
  DOCS_DESCRIPTION,
  DOCS_PATH,
  DOCS_TITLE,
  DOCS_VERSION,
  buildDocumentConfig,
  buildSwaggerCustomOptions,
  isProduction,
} from './docs-options';

describe('isProduction', () => {
  it('DOC-7 treats NODE_ENV=production as production', () => {
    expect(isProduction('production')).toBe(true);
  });

  it.each([['development'], ['test'], [''], ['Production'], [undefined]])(
    'DOC-7 treats NODE_ENV=%p as development',
    (nodeEnv) => {
      expect(isProduction(nodeEnv)).toBe(false);
    },
  );
});

describe('buildSwaggerCustomOptions', () => {
  it('DOC-1 DOC-8 production: global prefix, JSON only, Try it out off, no persisted token', () => {
    expect(buildSwaggerCustomOptions(true)).toEqual({
      useGlobalPrefix: true,
      raw: ['json'],
      swaggerOptions: {
        supportedSubmitMethods: [],
        persistAuthorization: false,
      },
    });
  });

  it('DOC-1 DOC-8 development: global prefix, JSON only, Swagger UI default Try it out, no persisted token', () => {
    const options = buildSwaggerCustomOptions(false);

    expect(options).toEqual({
      useGlobalPrefix: true,
      raw: ['json'],
      swaggerOptions: { persistAuthorization: false },
    });
    expect(options.swaggerOptions).not.toHaveProperty('supportedSubmitMethods');
  });

  it('DOC-1 serves no YAML document in either build', () => {
    for (const production of [true, false]) {
      expect(buildSwaggerCustomOptions(production).raw).toEqual(['json']);
    }
  });
});

describe('buildDocumentConfig', () => {
  it('DOC-1 mounts the docs at "docs" under the global prefix', () => {
    expect(DOCS_PATH).toBe('docs');
  });

  it('DOC-1 builds an OpenAPI 3 document header', () => {
    expect(buildDocumentConfig().openapi).toMatch(/^3\./);
  });

  it('DOC-2 has the exact title, version and description', () => {
    const { info } = buildDocumentConfig();

    expect(info.title).toBe('CookBook API');
    expect(info.version).toBe('1');
    expect(info.description).toBe(
      'CookBook recipe social network API. Every route except the ones marked public needs a Bearer access token (AUTH-8).',
    );
    expect(DOCS_TITLE).toBe(info.title);
    expect(DOCS_VERSION).toBe(info.version);
    expect(DOCS_DESCRIPTION).toBe(info.description);
  });

  it('DOC-6 declares exactly one HTTP bearer scheme in JWT format', () => {
    const { components } = buildDocumentConfig();

    expect(components?.securitySchemes).toEqual({
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    });
    expect(BEARER_SCHEME_NAME).toBe('bearer');
  });

  it('DOC-6 sets no document-wide security requirement (public routes carry none)', () => {
    const config = buildDocumentConfig();

    expect(config.security ?? []).toEqual([]);
  });

  it('DOC-9 declares no server URL', () => {
    expect(buildDocumentConfig().servers ?? []).toEqual([]);
  });

  it('DOC-9 writes no URL and no environment value into the header', () => {
    const sentinels = {
      DOCS_USERNAME: 'sentinel-docs-user-7f3a',
      DOCS_PASSWORD: 'sentinel-docs-pass-7f3a',
      JWT_ACCESS_SECRET: 'sentinel-jwt-secret-7f3a',
      OPENROUTER_KEY: 'sentinel-openrouter-key-7f3a',
    };
    const saved = Object.fromEntries(
      Object.keys(sentinels).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, sentinels);
    try {
      const serialized = JSON.stringify(buildDocumentConfig());

      expect(serialized).not.toMatch(/https?:\/\//);
      for (const value of Object.values(sentinels)) {
        expect(serialized).not.toContain(value);
      }
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
