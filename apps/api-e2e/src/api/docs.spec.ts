// SPEC.md §13 TEST-3 and §11.7 DOC-1, DOC-2, DOC-4, DOC-6, DOC-7, DOC-9: the OpenAPI
// document the running development API serves at `/api/v1/docs-json`, checked against
// the §11.6 route table and the four public routes of AUTH-8.
import type { AxiosInstance } from 'axios';
import { allowErrors, anonymousClient } from '../support/api-helpers';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

const HTTP_METHODS: readonly string[] = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
];

/** DOC-2: the one tag per library that owns routes in §11.6. */
const DOC_TAGS = [
  'health',
  'auth',
  'recipes',
  'friends',
  'discover',
  'social',
  'cook',
  'recommend',
  'nutrition',
] as const;
type DocTag = (typeof DOC_TAGS)[number];

interface Route {
  method: HttpMethod;
  /** The §11.6 path without the global prefix, path params in OpenAPI `{name}` form. */
  path: string;
  /** DOC-2: the tag of the owning library in the §11.6 table. */
  tag: DocTag;
  /** §11.6 query parameters (DOC-4). */
  query?: string[];
}

/** SPEC.md §11.6, row by row (the docs routes themselves are not Nest routes, AUTH-8). */
const ROUTES: Route[] = [
  { method: 'get', path: '/health', tag: 'health' },
  { method: 'post', path: '/auth/sign-up', tag: 'auth' },
  { method: 'post', path: '/auth/sign-in', tag: 'auth' },
  { method: 'post', path: '/auth/refresh', tag: 'auth' },
  { method: 'get', path: '/me', tag: 'auth' },
  { method: 'put', path: '/me/favourite-categories', tag: 'discover' },
  { method: 'get', path: '/users/search', tag: 'friends', query: ['q'] },
  { method: 'get', path: '/friends', tag: 'friends' },
  { method: 'post', path: '/friends/requests', tag: 'friends' },
  { method: 'post', path: '/friends/requests/{id}/accept', tag: 'friends' },
  { method: 'post', path: '/friends/requests/{id}/decline', tag: 'friends' },
  { method: 'delete', path: '/friends/requests/{id}', tag: 'friends' },
  { method: 'delete', path: '/friends/{userId}', tag: 'friends' },
  { method: 'get', path: '/recipes', tag: 'recipes' },
  { method: 'post', path: '/recipes', tag: 'recipes' },
  { method: 'get', path: '/recipes/{id}', tag: 'recipes' },
  { method: 'get', path: '/recipes/{id}/versions', tag: 'recipes' },
  { method: 'get', path: '/recipes/{id}/versions/{n}', tag: 'recipes' },
  { method: 'put', path: '/recipes/{id}', tag: 'recipes' },
  { method: 'patch', path: '/recipes/{id}/visibility', tag: 'recipes' },
  { method: 'delete', path: '/recipes/{id}', tag: 'recipes' },
  { method: 'post', path: '/recipes/{id}/save', tag: 'recipes' },
  { method: 'post', path: '/recipes/catalogue/{mealId}/save', tag: 'recipes' },
  { method: 'post', path: '/recipes/{id}/sync', tag: 'recipes' },
  { method: 'post', path: '/recipes/{id}/images', tag: 'recipes' },
  { method: 'delete', path: '/recipes/{id}/images/{index}', tag: 'recipes' },
  {
    method: 'get',
    path: '/recipes/{id}/nutrition',
    tag: 'nutrition',
    query: ['mode'],
  },
  {
    method: 'get',
    path: '/discover',
    tag: 'discover',
    query: ['category', 'page'],
  },
  { method: 'get', path: '/discover/catalogue/{mealId}', tag: 'discover' },
  { method: 'put', path: '/recipes/{id}/rating', tag: 'social' },
  { method: 'get', path: '/recipes/{id}/rating', tag: 'social' },
  { method: 'get', path: '/recipes/{id}/comments', tag: 'social' },
  { method: 'post', path: '/recipes/{id}/comments', tag: 'social' },
  { method: 'delete', path: '/comments/{id}', tag: 'social' },
  { method: 'put', path: '/comments/{id}/vote', tag: 'social' },
  { method: 'post', path: '/cook/ask', tag: 'cook' },
  { method: 'get', path: '/cook/quota', tag: 'cook' },
  { method: 'post', path: '/recommend', tag: 'recommend' },
];

/** AUTH-8: the only routes without the Bearer requirement (DOC-6). */
const PUBLIC_ROUTES: string[] = [
  'post /auth/sign-up',
  'post /auth/sign-in',
  'post /auth/refresh',
  'get /health',
];

interface ParameterObject {
  name: string;
  in: string;
}

interface OperationObject {
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: ParameterObject[];
}

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  servers?: unknown[];
  security?: Array<Record<string, string[]>>;
  components?: { securitySchemes?: Record<string, Record<string, unknown>> };
  paths: Record<string, Record<string, OperationObject | unknown>>;
}

interface Operation {
  method: string;
  path: string;
  operation: OperationObject;
}

describe('GET /docs-json (development)', () => {
  const anonymous: AxiosInstance = anonymousClient();
  let document: OpenApiDocument;
  let operations: Operation[];
  /**
   * The document emits paths with the global prefix (`useGlobalPrefix`, DOC-1), e.g.
   * `/api/v1/recipes/{id}`; the axios base URL of the suite carries the same prefix.
   */
  let prefix: string;

  function key(method: string, path: string): string {
    return `${method} ${path}`;
  }

  function withPrefix(path: string): string {
    return `${prefix}${path}`;
  }

  function withoutPrefix(path: string): string {
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
  }

  function find(route: Route): OperationObject | undefined {
    return document.paths[withPrefix(route.path)]?.[route.method] as
      OperationObject | undefined;
  }

  beforeAll(async () => {
    prefix = new URL(anonymous.defaults.baseURL ?? '').pathname.replace(
      /\/+$/,
      '',
    );
    const response = await anonymous.get<OpenApiDocument>(
      '/docs-json',
      allowErrors,
    );
    expect(response.status).toBe(200);
    document = response.data;
    operations = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([method]) => HTTP_METHODS.includes(method))
        .map(([method, operation]) => ({
          method,
          path,
          operation: operation as OperationObject,
        })),
    );
  });

  it('DOC-1 DOC-7 serves the document in development without sign-in', async () => {
    const response = await anonymous.get('/docs-json', allowErrors);

    expect(response.status).toBe(200);
    expect(String(response.headers['content-type'])).toMatch(
      /application\/json/,
    );
  });

  it('DOC-1 serves Swagger UI in development without sign-in', async () => {
    const response = await anonymous.get<string>('/docs', allowErrors);

    expect(response.status).toBe(200);
    expect(String(response.headers['content-type'])).toMatch(/text\/html/);
  });

  it('DOC-1 serves no YAML document', async () => {
    const response = await anonymous.get('/docs-yaml', allowErrors);

    expect(response.status).toBe(404);
  });

  it('TEST-3 DOC-1 is an OpenAPI 3 document', () => {
    expect(typeof document.openapi).toBe('string');
    expect(document.openapi.startsWith('3.')).toBe(true);
  });

  it('DOC-2 carries the CookBook API header', () => {
    expect(document.info.title).toBe('CookBook API');
    expect(document.info.version).toBe('1');
  });

  it.each(
    ROUTES.map((route) => [
      `${route.method.toUpperCase()} ${route.path}`,
      route,
    ]),
  )('TEST-3 DOC-4 lists %s of the §11.6 table', (_label, route) => {
    expect(Object.keys(document.paths)).toContain(withPrefix(route.path));
    expect(find(route as Route)).toBeDefined();
  });

  it('TEST-3 §11.6 the document holds no operation outside the table', () => {
    const expected = ROUTES.map((route) =>
      key(route.method, route.path),
    ).sort();
    const actual = operations
      .map(({ method, path }) => key(method, withoutPrefix(path)))
      .sort();

    expect(actual).toEqual(expected);
  });

  it('DOC-1 emits every path under the global prefix, with path params in {name} form', () => {
    for (const path of Object.keys(document.paths)) {
      expect(path.startsWith(`${prefix}/`)).toBe(true);
      expect(path).not.toMatch(/\/:/);
    }
  });

  it('DOC-4 declares every path parameter as an in: path parameter', () => {
    for (const { method, path, operation } of operations) {
      const names = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      const declared = (operation.parameters ?? [])
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => parameter.name);

      expect({ operation: key(method, path), path: declared.sort() }).toEqual({
        operation: key(method, path),
        path: names.sort(),
      });
    }
  });

  it.each(
    ROUTES.filter((route) => route.query !== undefined).map((route) => [
      `${route.method.toUpperCase()} ${route.path}`,
      route,
    ]),
  )('DOC-4 declares the §11.6 query parameters of %s', (_label, route) => {
    const typed = route as Route;
    const declared = (find(typed)?.parameters ?? [])
      .filter((parameter) => parameter.in === 'query')
      .map((parameter) => parameter.name);

    expect(declared).toEqual(expect.arrayContaining(typed.query ?? []));
  });

  it('TEST-3 DOC-2 gives every operation exactly one tag from the DOC-2 list', () => {
    for (const { method, path, operation } of operations) {
      const tags = operation.tags ?? [];

      expect({ operation: key(method, path), tags: tags.length }).toEqual({
        operation: key(method, path),
        tags: 1,
      });
      expect(DOC_TAGS as readonly string[]).toContain(tags[0]);
    }
  });

  it.each(
    ROUTES.map((route) => [
      `${route.method.toUpperCase()} ${route.path}`,
      route,
    ]),
  )('DOC-2 tags %s with its owning library', (_label, route) => {
    const typed = route as Route;

    expect(find(typed)?.tags).toEqual([typed.tag]);
  });

  it('DOC-6 declares one HTTP bearer scheme in JWT format', () => {
    expect(document.components?.securitySchemes).toEqual({
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    });
  });

  it('DOC-6 sets no document-wide security requirement', () => {
    expect(document.security ?? []).toEqual([]);
  });

  it('TEST-3 DOC-6 AUTH-8 leaves only the four public routes without the bearer requirement', () => {
    const unsecured = operations
      .filter(({ operation }) => (operation.security ?? []).length === 0)
      .map(({ method, path }) => key(method, withoutPrefix(path)))
      .sort();

    expect(unsecured).toEqual([...PUBLIC_ROUTES].sort());
  });

  it('DOC-6 AUTH-8 puts the bearer requirement on every protected operation', () => {
    for (const { method, path, operation } of operations) {
      if (PUBLIC_ROUTES.includes(key(method, withoutPrefix(path)))) continue;

      expect({
        operation: key(method, path),
        security: operation.security,
      }).toEqual({
        operation: key(method, path),
        security: [{ bearer: [] }],
      });
    }
  });

  it('DOC-9 declares no server URL', () => {
    expect(document.servers ?? []).toEqual([]);
  });
});
