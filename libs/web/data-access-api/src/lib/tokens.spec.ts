import { beforeEach, vi } from 'vitest';
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  TokenStore,
  tokenStore,
} from './tokens';

describe('TokenStore (UI-17)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('UI-17 uses the localStorage keys cookbook.accessToken and cookbook.refreshToken', () => {
    expect(ACCESS_TOKEN_KEY).toBe('cookbook.accessToken');
    expect(REFRESH_TOKEN_KEY).toBe('cookbook.refreshToken');
  });

  it('UI-17 writes the pair to those localStorage keys', () => {
    new TokenStore().set('access-1', 'refresh-1');

    expect(localStorage.getItem('cookbook.accessToken')).toBe('access-1');
    expect(localStorage.getItem('cookbook.refreshToken')).toBe('refresh-1');
  });

  it('UI-17 reads the pair back from localStorage', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    const store = new TokenStore();

    expect(store.get()).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    expect(store.getAccessToken()).toBe('access-1');
    expect(store.getRefreshToken()).toBe('refresh-1');
    expect(store.hasAccessToken()).toBe(true);
  });

  it('UI-17 reports null and no access token when nothing is stored', () => {
    const store = new TokenStore();

    expect(store.get()).toEqual({ accessToken: null, refreshToken: null });
    expect(store.hasAccessToken()).toBe(false);
  });

  it('AUTH-7 clear() removes both keys from localStorage', () => {
    const store = new TokenStore();
    store.set('access-1', 'refresh-1');

    store.clear();

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(store.hasAccessToken()).toBe(false);
  });

  it('UI-17 notifies subscribers with the new pair on set and on clear', () => {
    const store = new TokenStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set('access-1', 'refresh-1');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });

    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith({
      accessToken: null,
      refreshToken: null,
    });
  });

  it('UI-17 notifies every subscriber and stops after unsubscribe', () => {
    const store = new TokenStore();
    const stays = vi.fn();
    const leaves = vi.fn();
    store.subscribe(stays);
    const unsubscribe = store.subscribe(leaves);

    store.set('access-1', 'refresh-1');
    unsubscribe();
    store.set('access-2', 'refresh-2');

    expect(stays).toHaveBeenCalledTimes(2);
    expect(leaves).toHaveBeenCalledTimes(1);
  });

  it('UI-17 exports a shared store bound to the same localStorage keys', () => {
    tokenStore.set('access-shared', 'refresh-shared');

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-shared');
    tokenStore.clear();
    expect(tokenStore.hasAccessToken()).toBe(false);
  });
});

describe('TokenStore session end (UI-44)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('UI-44 starts with sessionEnded false', () => {
    expect(new TokenStore().sessionEnded).toBe(false);
  });

  it('UI-44 endSession() removes both keys and marks the session ended when tokens were stored', () => {
    const store = new TokenStore();
    store.set('access-1', 'refresh-1');

    store.endSession();

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(store.sessionEnded).toBe(true);
  });

  it('UI-44 endSession() marks the session ended when only one of the two tokens was stored', () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    const onlyRefresh = new TokenStore();
    onlyRefresh.endSession();
    expect(onlyRefresh.sessionEnded).toBe(true);

    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    const onlyAccess = new TokenStore();
    onlyAccess.endSession();
    expect(onlyAccess.sessionEnded).toBe(true);
  });

  it('UI-44 endSession() with no tokens stored (a wrong password) leaves sessionEnded false', () => {
    const store = new TokenStore();

    store.endSession();

    expect(store.sessionEnded).toBe(false);
  });

  it('UI-44 endSession() with no tokens stored keeps an earlier ended session ended', () => {
    const store = new TokenStore();
    store.set('access-1', 'refresh-1');
    store.endSession();

    // A wrong password on the sign-in screen that follows.
    store.endSession();

    expect(store.sessionEnded).toBe(true);
  });

  it('UI-44 clear() (a sign-out) resets sessionEnded', () => {
    const store = new TokenStore();
    store.set('access-1', 'refresh-1');
    store.endSession();

    store.clear();

    expect(store.sessionEnded).toBe(false);
  });

  it('UI-44 clear() of a live session never marks it ended', () => {
    const store = new TokenStore();
    store.set('access-1', 'refresh-1');

    store.clear();

    expect(store.sessionEnded).toBe(false);
  });

  it('UI-44 set() (the next sign-in) resets sessionEnded', () => {
    const store = new TokenStore();
    store.set('access-1', 'refresh-1');
    store.endSession();

    store.set('access-2', 'refresh-2');

    expect(store.sessionEnded).toBe(false);
  });

  it('UI-44 notifies subscribers on endSession() with sessionEnded already true', () => {
    const store = new TokenStore();
    store.set('access-1', 'refresh-1');
    const seen: boolean[] = [];
    store.subscribe(() => seen.push(store.sessionEnded));

    store.endSession();

    expect(seen).toEqual([true]);
  });

  it('UI-44 keeps sessionEnded in memory only, never in localStorage', () => {
    const store = new TokenStore();
    store.set('access-1', 'refresh-1');
    store.endSession();

    expect(localStorage.length).toBe(0);
    expect(new TokenStore().sessionEnded).toBe(false);
  });
});
