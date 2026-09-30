// SPEC.md §11.5 UI-35: the current route (UI-16) and the cook-mode step are
// kept in sessionStorage under `cookbook.route` as { userId, route, step? } and
// restored only for the same user id; anything malformed is ignored. UI-23:
// recipe, preview, editor and cook routes carry the tab they were opened from.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROUTE_STORAGE_KEY, readSavedRoute, writeSavedRoute } from './route-storage';
import type { Route } from './route-storage';

/** Puts a raw value under the UI-35 key, as a reload would find it. */
function store(value: unknown): void {
  sessionStorage.setItem(
    ROUTE_STORAGE_KEY,
    typeof value === 'string' ? value : JSON.stringify(value),
  );
}

function stored(): unknown {
  const text = sessionStorage.getItem(ROUTE_STORAGE_KEY);
  return text === null ? null : JSON.parse(text);
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('route-storage', () => {
  it('UI-35 keeps the route under the sessionStorage key cookbook.route', () => {
    expect(ROUTE_STORAGE_KEY).toBe('cookbook.route');

    writeSavedRoute('u1', { name: 'discover' }, undefined);

    expect(stored()).toEqual({ userId: 'u1', route: { name: 'discover' } });
  });

  it.each<Route>([
    { name: 'home' },
    { name: 'discover' },
    { name: 'friends' },
    { name: 'recipe', id: 'r1', from: 'discover' },
    { name: 'catalogue', mealId: '52772', from: 'discover' },
    { name: 'editor' },
    { name: 'editor', id: 'r1', from: 'home' },
    { name: 'cook', id: 'r1', from: 'home' },
  ])('UI-35 restores the %o route written for the same user', (route) => {
    writeSavedRoute('u1', route, undefined);

    expect(readSavedRoute('u1')).toEqual({ route, step: undefined });
  });

  it('UI-35 keeps and restores the cook-mode step on a cook route', () => {
    writeSavedRoute('u1', { name: 'cook', id: 'r1', from: 'discover' }, 3);

    expect(stored()).toEqual({
      userId: 'u1',
      route: { name: 'cook', id: 'r1', from: 'discover' },
      step: 3,
    });
    expect(readSavedRoute('u1')).toEqual({
      route: { name: 'cook', id: 'r1', from: 'discover' },
      step: 3,
    });
  });

  it('UI-35 keeps step 0 (the first step) on a cook route', () => {
    writeSavedRoute('u1', { name: 'cook', id: 'r1', from: 'home' }, 0);

    expect(readSavedRoute('u1')?.step).toBe(0);
  });

  it('UI-35 writes no step for a route other than cook', () => {
    writeSavedRoute('u1', { name: 'recipe', id: 'r1', from: 'home' }, 4);

    expect(stored()).toEqual({
      userId: 'u1',
      route: { name: 'recipe', id: 'r1', from: 'home' },
    });
  });

  it('UI-35 writes no step for a cook route whose step is unknown', () => {
    writeSavedRoute('u1', { name: 'cook', id: 'r1', from: 'home' }, undefined);

    expect(stored()).toEqual({
      userId: 'u1',
      route: { name: 'cook', id: 'r1', from: 'home' },
    });
  });

  it('UI-35 returns null when nothing is stored', () => {
    expect(readSavedRoute('u1')).toBeNull();
  });

  it("UI-35 ignores another user's saved route", () => {
    writeSavedRoute('u2', { name: 'friends' }, undefined);

    expect(readSavedRoute('u1')).toBeNull();
  });

  it('UI-35 ignores a saved route without a user id', () => {
    store({ route: { name: 'friends' } });

    expect(readSavedRoute('u1')).toBeNull();
  });

  it.each([
    ['text that is not JSON', '{not json'],
    ['a JSON number', '42'],
    ['JSON null', 'null'],
    ['a JSON string', '"discover"'],
  ])('UI-35 ignores %s', (_label, raw) => {
    store(raw);

    expect(readSavedRoute('u1')).toBeNull();
  });

  it.each<[string, unknown]>([
    ['no route', undefined],
    ['a null route', null],
    ['a route that is not an object', 'discover'],
    ['an unknown route name', { name: 'settings' }],
    ['a recipe route without an id', { name: 'recipe', from: 'home' }],
    ['a recipe route with an empty id', { name: 'recipe', id: '', from: 'home' }],
    ['a recipe route with a numeric id', { name: 'recipe', id: 7, from: 'home' }],
    ['a recipe route without its origin tab', { name: 'recipe', id: 'r1' }],
    ['a recipe route from an unknown tab', { name: 'recipe', id: 'r1', from: 'settings' }],
    ['a catalogue route without a meal id', { name: 'catalogue', from: 'discover' }],
    ['a catalogue route without its origin tab', { name: 'catalogue', mealId: '52772' }],
    ['a cook route without an id', { name: 'cook', from: 'home' }],
    ['a cook route without its origin tab', { name: 'cook', id: 'r1' }],
    ['an editor route with a numeric id', { name: 'editor', id: 3 }],
    ['an editor route with an empty id', { name: 'editor', id: '' }],
    ['an editor route from an unknown tab', { name: 'editor', from: 'auth' }],
  ])('UI-35 ignores %s', (_label, route) => {
    store({ userId: 'u1', route });

    expect(readSavedRoute('u1')).toBeNull();
  });

  it('UI-35 drops fields a route does not carry', () => {
    store({ userId: 'u1', route: { name: 'home', id: 'r1', from: 'discover' } });

    expect(readSavedRoute('u1')).toEqual({
      route: { name: 'home' },
      step: undefined,
    });
  });

  it('UI-35 restores an editor route with only a recipe id', () => {
    store({ userId: 'u1', route: { name: 'editor', id: 'r1' } });

    expect(readSavedRoute('u1')).toEqual({
      route: { name: 'editor', id: 'r1' },
      step: undefined,
    });
  });

  it.each<[string, unknown]>([
    ['negative', -1],
    ['fractional', 1.5],
    ['a string', '2'],
    ['null', null],
  ])('UI-35 restores a cook route without a %s step', (_label, step) => {
    store({ userId: 'u1', route: { name: 'cook', id: 'r1', from: 'home' }, step });

    expect(readSavedRoute('u1')).toEqual({
      route: { name: 'cook', id: 'r1', from: 'home' },
      step: undefined,
    });
  });

  it('UI-35 ignores a step stored with a route other than cook', () => {
    store({ userId: 'u1', route: { name: 'discover' }, step: 2 });

    expect(readSavedRoute('u1')).toEqual({
      route: { name: 'discover' },
      step: undefined,
    });
  });

  it('UI-35 overwrites the previous route on every write', () => {
    writeSavedRoute('u1', { name: 'discover' }, undefined);
    writeSavedRoute('u1', { name: 'friends' }, undefined);

    expect(readSavedRoute('u1')?.route).toEqual({ name: 'friends' });
  });

  it('UI-35 returns null when sessionStorage throws on read', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });

    expect(readSavedRoute('u1')).toBeNull();
  });

  it('UI-35 does not throw when sessionStorage throws on write', () => {
    vi.stubGlobal('sessionStorage', {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });

    expect(() =>
      writeSavedRoute('u1', { name: 'discover' }, undefined),
    ).not.toThrow();
  });

  it('UI-35 reads null and writes nothing when sessionStorage is unavailable', () => {
    vi.stubGlobal('sessionStorage', undefined);

    expect(() =>
      writeSavedRoute('u1', { name: 'discover' }, undefined),
    ).not.toThrow();
    expect(readSavedRoute('u1')).toBeNull();
  });
});
