// SPEC §11.7 DOC-1, DOC-6, DOC-7, DOC-8 (and TEST-3): mounting the docs on a real Nest
// application. The app listens on an ephemeral port of 127.0.0.1 only; no database, no
// feature module, no environment file: the env keys are passed in explicitly.
import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { docsPaths, setupApiDocs } from './setup-api-docs';
import type { DocsEnv } from './docs-access';

/** Stands in for the API routes; not a docs route (AUTH-8 is not in play here). */
@Controller('ping')
class PingController {
  @Get()
  ping(): { ok: boolean } {
    return { ok: true };
  }
}

const PREFIX = 'api/v1';

/** Made-up credentials, used by this suite only (DOC-9: no real secret in a test). */
const USERNAME = 'docs-reader';
const PASSWORD = 'made-up-docs-pass-0123';

function basic(pair: string): Record<string, string> {
  return {
    authorization: `Basic ${Buffer.from(pair, 'utf8').toString('base64')}`,
  };
}

interface Started {
  app: INestApplication;
  base: string;
  mounted: boolean;
  warn: jest.Mock;
}

async function start(env: DocsEnv): Promise<Started> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PingController],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix(PREFIX);
  const warn = jest.fn();
  const mounted = setupApiDocs(app, {
    globalPrefix: PREFIX,
    env,
    logger: { warn },
  });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, base: `http://127.0.0.1:${port}`, mounted, warn };
}

/**
 * Sends `Authorization` twice on one request (fetch would join the values into one
 * header), through the plain Node client, to `/api/v1/docs-json`.
 */
function statusWithRepeatedAuthorization(
  base: string,
  values: string[],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${base}/api/v1/docs-json`, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.setHeader('authorization', values);
    request.on('error', reject);
    request.end();
  });
}

describe('docsPaths', () => {
  it('DOC-1 DOC-7 puts both docs paths under the global prefix', () => {
    expect(docsPaths('api/v1')).toEqual(['/api/v1/docs', '/api/v1/docs-json']);
  });

  it('DOC-1 DOC-7 trims leading and trailing slashes of the prefix', () => {
    expect(docsPaths('/api/v1/')).toEqual([
      '/api/v1/docs',
      '/api/v1/docs-json',
    ]);
    expect(docsPaths('//api/v1')).toEqual([
      '/api/v1/docs',
      '/api/v1/docs-json',
    ]);
  });

  it('DOC-1 DOC-7 gives /docs and /docs-json for an empty prefix', () => {
    expect(docsPaths('')).toEqual(['/docs', '/docs-json']);
    expect(docsPaths('/')).toEqual(['/docs', '/docs-json']);
  });
});

describe('setupApiDocs', () => {
  describe('development', () => {
    let started: Started;

    beforeAll(async () => {
      started = await start({ NODE_ENV: 'development' });
    });

    afterAll(async () => {
      await started.app.close();
    });

    it('DOC-1 DOC-7 mounts the docs and logs no warning', () => {
      expect(started.mounted).toBe(true);
      expect(started.warn).not.toHaveBeenCalled();
    });

    it('DOC-1 DOC-7 serves the OpenAPI 3 JSON at /api/v1/docs-json without sign-in', async () => {
      const response = await fetch(`${started.base}/api/v1/docs-json`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/application\/json/);
      const document = (await response.json()) as {
        openapi: string;
        info: { title: string };
        paths: Record<string, unknown>;
      };
      expect(document.openapi).toMatch(/^3\./);
      expect(document.info.title).toBe('CookBook API');
      expect(Object.keys(document.paths)).toContain('/api/v1/ping');
    });

    it('DOC-1 DOC-7 serves Swagger UI at /api/v1/docs without sign-in', async () => {
      const response = await fetch(`${started.base}/api/v1/docs`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/text\/html/);
    });

    it('DOC-6 serves the docs with no Bearer token and ignores one that is sent', async () => {
      const response = await fetch(`${started.base}/api/v1/docs-json`, {
        headers: { authorization: 'Bearer not-a-real-token' },
      });

      expect(response.status).toBe(200);
    });

    it('DOC-1 serves no YAML document', async () => {
      const response = await fetch(`${started.base}/api/v1/docs-yaml`);

      expect(response.status).toBe(404);
    });

    it('DOC-1 follows the global prefix: the unprefixed docs paths are 404', async () => {
      expect((await fetch(`${started.base}/docs-json`)).status).toBe(404);
      expect((await fetch(`${started.base}/docs`)).status).toBe(404);
    });

    it('DOC-8 keeps Try it out (no supportedSubmitMethods) and does not persist the token', async () => {
      const response = await fetch(
        `${started.base}/api/v1/docs/swagger-ui-init.js`,
      );
      const script = await response.text();

      expect(response.status).toBe(200);
      expect(script).not.toContain('supportedSubmitMethods');
      expect(script).toMatch(/"persistAuthorization":\s*false/);
    });
  });

  describe('production with valid keys', () => {
    let started: Started;
    const good = basic(`${USERNAME}:${PASSWORD}`);

    beforeAll(async () => {
      started = await start({
        NODE_ENV: 'production',
        DOCS_USERNAME: USERNAME,
        DOCS_PASSWORD: PASSWORD,
      });
    });

    afterAll(async () => {
      await started.app.close();
    });

    it('DOC-1 DOC-7 mounts the docs and logs no warning', () => {
      expect(started.mounted).toBe(true);
      expect(started.warn).not.toHaveBeenCalled();
    });

    it.each([
      ['/api/v1/docs-json'],
      ['/api/v1/docs'],
      ['/api/v1/docs/'],
      ['/api/v1/docs/swagger-ui-init.js'],
    ])(
      'DOC-7 answers 401 with the challenge and an empty body at %s without credentials',
      async (path) => {
        const response = await fetch(`${started.base}${path}`);

        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe(
          'Basic realm="CookBook API docs", charset="UTF-8"',
        );
        expect(await response.text()).toBe('');
      },
    );

    it('DOC-7 answers 401 to the wrong password', async () => {
      const response = await fetch(`${started.base}/api/v1/docs-json`, {
        headers: basic(`${USERNAME}:made-up-wrong-pass-0123`),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        'Basic realm="CookBook API docs", charset="UTF-8"',
      );
    });

    it('DOC-6 DOC-7 answers 401 to a Bearer token instead of Basic credentials', async () => {
      const response = await fetch(`${started.base}/api/v1/docs-json`, {
        headers: { authorization: 'Bearer not-a-real-token' },
      });

      expect(response.status).toBe(401);
    });

    it('DOC-1 DOC-7 serves the JSON document to the right credentials', async () => {
      const response = await fetch(`${started.base}/api/v1/docs-json`, {
        headers: good,
      });

      expect(response.status).toBe(200);
      const document = (await response.json()) as { openapi: string };
      expect(document.openapi).toMatch(/^3\./);
    });

    it('DOC-7 checks the one Authorization header Node keeps when a request repeats it (§16 A12)', async () => {
      const right = good['authorization'];
      const wrong = basic(`${USERNAME}:made-up-wrong-pass-0123`)[
        'authorization'
      ];

      expect(
        await statusWithRepeatedAuthorization(started.base, [right, wrong]),
      ).toBe(200);
      expect(
        await statusWithRepeatedAuthorization(started.base, [wrong, right]),
      ).toBe(401);
    });

    it('DOC-1 DOC-7 serves Swagger UI to the right credentials', async () => {
      const response = await fetch(`${started.base}/api/v1/docs`, {
        headers: good,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/text\/html/);
    });

    it('DOC-1 serves no YAML document, even to the right credentials', async () => {
      const response = await fetch(`${started.base}/api/v1/docs-yaml`, {
        headers: good,
      });

      expect(response.status).toBe(404);
    });

    it('DOC-8 turns Try it out off for every operation and does not persist the token', async () => {
      const response = await fetch(
        `${started.base}/api/v1/docs/swagger-ui-init.js`,
        { headers: good },
      );
      const script = await response.text();

      expect(response.status).toBe(200);
      expect(script).toMatch(/"supportedSubmitMethods":\s*\[\s*\]/);
      expect(script).toMatch(/"persistAuthorization":\s*false/);
    });

    it('DOC-7 leaves the API routes outside the docs Basic check', async () => {
      const response = await fetch(`${started.base}/api/v1/ping`);

      expect(response.status).toBe(200);
      expect(response.headers.get('www-authenticate')).toBeNull();
    });
  });

  describe.each([
    [
      'a 15-character password',
      {
        NODE_ENV: 'production',
        DOCS_USERNAME: USERNAME,
        DOCS_PASSWORD: 'q'.repeat(15),
      },
      ['DOCS_PASSWORD'],
    ],
    [
      'an empty username',
      { NODE_ENV: 'production', DOCS_USERNAME: '', DOCS_PASSWORD: PASSWORD },
      ['DOCS_USERNAME'],
    ],
    [
      'an empty password',
      { NODE_ENV: 'production', DOCS_USERNAME: USERNAME, DOCS_PASSWORD: '' },
      ['DOCS_PASSWORD'],
    ],
    [
      'no docs keys at all',
      { NODE_ENV: 'production' },
      ['DOCS_USERNAME', 'DOCS_PASSWORD'],
    ],
  ] as Array<[string, DocsEnv, string[]]>)(
    'production with %s',
    (_label, env, namedKeys) => {
      let started: Started;

      beforeAll(async () => {
        started = await start(env);
      });

      afterAll(async () => {
        await started.app.close();
      });

      it('DOC-7 does not mount the docs', () => {
        expect(started.mounted).toBe(false);
      });

      it('DOC-7 logs exactly one warning naming the key, never a value', () => {
        expect(started.warn).toHaveBeenCalledTimes(1);
        const [message] = started.warn.mock.calls[0] as [string];
        for (const key of namedKeys) {
          expect(message).toContain(key);
        }
        for (const value of [env.DOCS_USERNAME, env.DOCS_PASSWORD]) {
          if (value) expect(message).not.toContain(value);
        }
      });

      it.each([
        ['/api/v1/docs'],
        ['/api/v1/docs-json'],
        ['/api/v1/docs/swagger-ui-init.js'],
      ])(
        'DOC-7 answers 404 at %s, with or without credentials',
        async (path) => {
          const bare = await fetch(`${started.base}${path}`);
          const withCredentials = await fetch(`${started.base}${path}`, {
            headers: basic(`${USERNAME}:${PASSWORD}`),
          });

          expect(bare.status).toBe(404);
          expect(bare.headers.get('www-authenticate')).toBeNull();
          expect(withCredentials.status).toBe(404);
        },
      );

      it('DOC-7 still serves the API routes', async () => {
        expect((await fetch(`${started.base}/api/v1/ping`)).status).toBe(200);
      });
    },
  );
});
