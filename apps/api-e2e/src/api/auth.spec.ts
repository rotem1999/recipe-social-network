// SPEC.md §2: sign-up (AUTH-5), token issue and refresh (AUTH-7) and the global guard
// (AUTH-8), against a running API.
import axios from 'axios';
import type { AuthResponse, UserDto } from '@rsn/shared/util-contracts';
import {
  TEST_PASSWORD,
  allowErrors,
  anonymousClient,
  clientFor,
  signUp,
  uniqueUsername,
} from '../support/api-helpers';

describe('auth routes', () => {
  const anonymous = anonymousClient();

  it('AUTH-5 signs a new user up and returns a token pair with the user', async () => {
    const username = uniqueUsername('signup');

    const response = await anonymous.post<AuthResponse>('/auth/sign-up', {
      username,
      password: TEST_PASSWORD,
    });

    expect(response.data.user.username).toBe(username);
    expect(response.data.user.email).toBeNull();
    expect(response.data.user.favouriteCategories).toEqual([]);
    expect(typeof response.data.accessToken).toBe('string');
    expect(response.data.accessToken.length).toBeGreaterThan(0);
    expect(typeof response.data.refreshToken).toBe('string');
    expect(response.data.refreshToken.length).toBeGreaterThan(0);
  });

  it('AUTH-5 stores the username lower-case', async () => {
    const username = uniqueUsername('case');

    const response = await anonymous.post<AuthResponse>('/auth/sign-up', {
      username: username.toUpperCase(),
      password: TEST_PASSWORD,
    });

    expect(response.data.user.username).toBe(username);
  });

  it('AUTH-5 rejects a username that is already taken with 409', async () => {
    const username = uniqueUsername('dup');
    await signUp(username);

    const duplicate = await anonymous.post(
      '/auth/sign-up',
      { username, password: TEST_PASSWORD },
      allowErrors,
    );

    expect(duplicate.status).toBe(409);
  });

  it('AUTH-5 rejects a password shorter than 8 characters with 400', async () => {
    const response = await anonymous.post(
      '/auth/sign-up',
      { username: uniqueUsername('short'), password: 'short7c' },
      allowErrors,
    );

    expect(response.status).toBe(400);
  });

  it('AUTH-5 signs an existing user in with the right password', async () => {
    const user = await signUp();

    const response = await anonymous.post<AuthResponse>('/auth/sign-in', {
      username: user.username,
      password: user.password,
    });

    expect(response.status).toBe(200);
    expect(response.data.user.id).toBe(user.id);
    expect(response.data.accessToken.length).toBeGreaterThan(0);
  });

  it('AUTH-5 rejects a wrong password with 401', async () => {
    const user = await signUp();

    const response = await anonymous.post(
      '/auth/sign-in',
      { username: user.username, password: `${user.password}-wrong` },
      allowErrors,
    );

    expect(response.status).toBe(401);
  });

  it('AUTH-5 rejects an unknown username with the same 401', async () => {
    const response = await anonymous.post(
      '/auth/sign-in',
      { username: uniqueUsername('ghost'), password: TEST_PASSWORD },
      allowErrors,
    );

    expect(response.status).toBe(401);
  });

  it('AUTH-7 exchanges a refresh token for a new, working pair', async () => {
    const user = await signUp();

    const response = await anonymous.post<AuthResponse>(
      '/auth/refresh',
      { refreshToken: user.refreshToken },
      allowErrors,
    );

    expect(response.status).toBe(200);
    expect(response.data.user.id).toBe(user.id);
    expect(typeof response.data.accessToken).toBe('string');
    expect(response.data.accessToken.length).toBeGreaterThan(0);
    expect(typeof response.data.refreshToken).toBe('string');
    expect(response.data.refreshToken.length).toBeGreaterThan(0);

    // The pair is only "new" in a useful sense if both halves work: the access token
    // authenticates GET /me and the refresh token buys another pair.
    const me = await clientFor(response.data.accessToken).get<UserDto>('/me');
    expect(me.data.id).toBe(user.id);

    const again = await anonymous.post<AuthResponse>(
      '/auth/refresh',
      { refreshToken: response.data.refreshToken },
      allowErrors,
    );
    expect(again.status).toBe(200);
  });

  it('AUTH-7 refuses an access token at /auth/refresh with 401', async () => {
    const user = await signUp();

    const response = await anonymous.post(
      '/auth/refresh',
      { refreshToken: user.accessToken },
      allowErrors,
    );

    expect(response.status).toBe(401);
  });

  it('AUTH-8 rejects GET /me without a token with 401', async () => {
    const response = await axios.get('/me', allowErrors);

    expect(response.status).toBe(401);
  });

  it('AUTH-8 rejects GET /me with a malformed token with 401', async () => {
    const response = await clientFor('not-a-jwt').get('/me', allowErrors);

    expect(response.status).toBe(401);
  });

  it('AUTH-8 answers GET /me with the caller for a valid token', async () => {
    const user = await signUp();

    const response = await user.client.get<UserDto>('/me');

    expect(response.data).toEqual(
      expect.objectContaining({
        id: user.id,
        username: user.username,
        email: null,
        favouriteCategories: [],
      }),
    );
  });
});
