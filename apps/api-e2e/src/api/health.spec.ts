// SPEC.md §11.6 `GET /health` — liveness, and the one route besides the three auth
// routes that AUTH-8 leaves open.
import type { AxiosInstance } from 'axios';
import type { HealthResponse } from '@rsn/shared/util-contracts';
import { anonymousClient, allowErrors } from '../support/api-helpers';

describe('GET /health', () => {
  const anonymous: AxiosInstance = anonymousClient();

  it('AUTH-8 answers 200 with { status: "ok" } to a caller with no token', async () => {
    const response = await anonymous.get<HealthResponse>('/health', allowErrors);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('ok');
  });

  it('AUTH-8 returns the server time as an ISO-8601 string', async () => {
    const response = await anonymous.get<HealthResponse>('/health');

    expect(typeof response.data.time).toBe('string');
    expect(Number.isNaN(Date.parse(response.data.time))).toBe(false);
  });

  it('§11.6 serves the route under the global prefix only', async () => {
    // The prefixed URL above answered 200; the bare origin is not a route.
    const origin = new URL(anonymous.defaults.baseURL ?? '').origin;
    const unprefixed = await anonymous.get('/health', {
      ...allowErrors,
      baseURL: origin,
    });

    expect(unprefixed.status).toBe(404);
  });
});
