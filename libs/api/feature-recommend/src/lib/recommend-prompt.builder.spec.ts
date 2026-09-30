// SPEC §8 WX-3, WX-4, WX-10: the recommendation prompt. Pure, no I/O.
import type { WeatherSnapshot } from '@rsn/api/data-access-weather';

import {
  MAX_PICKS,
  RecommendPromptBuilder,
  type RecommendCandidate,
} from './recommend-prompt.builder';

const SNAPSHOT: WeatherSnapshot = {
  city: 'Tel Aviv',
  temperatureC: 8.6,
  isDay: false,
  condition: 'clear',
  weatherCode: 0,
  localHour: 21,
};

const CANDIDATES: RecommendCandidate[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Tonkotsu ramen',
    category: 'Pasta',
    minutes: 45,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Garden salad',
    category: 'Vegan',
    minutes: undefined,
  },
];

describe('RecommendPromptBuilder.build (WX-4, WX-10)', () => {
  const builder = new RecommendPromptBuilder();

  it('WX-10 builds one system and one user message', () => {
    const messages = builder.build({
      scope: 'home',
      weather: SNAPSHOT,
      candidates: CANDIDATES,
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('WX-10 asks for strict JSON of the shape {"picks":[{"id":"…","reason":"…"}]}', () => {
    const [system] = builder.build({
      scope: 'home',
      weather: SNAPSHOT,
      candidates: CANDIDATES,
    });

    expect(system.content).toContain(
      'Answer with strict JSON only: {"picks":[{"id":"…","reason":"…"}]}',
    );
    expect(system.content).toContain('No prose, no markdown, no code fence.');
    expect(system.content).toContain(
      'Use only ids copied from the list; never invent or alter an id.',
    );
  });

  it('WX-4 asks for 3 picks, best first, or every recipe when the list has fewer than 3', () => {
    const [system] = builder.build({
      scope: 'home',
      weather: SNAPSHOT,
      candidates: CANDIDATES,
    });

    expect(system.content).toContain(
      'Answer with strict JSON only: {"picks":[{"id":"…","reason":"…"}]} with 3 picks, best first, or every recipe in the list when it has fewer than 3.',
    );
    expect(system.content).not.toContain('at most');
    expect(MAX_PICKS.home).toBe(3);
  });

  it('WX-10 Discover keeps asking for exactly 1 pick, without the "every recipe" clause', () => {
    const [system] = builder.build({
      scope: 'discover',
      weather: SNAPSHOT,
      candidates: CANDIDATES,
    });

    expect(system.content).toContain(
      'Answer with strict JSON only: {"picks":[{"id":"…","reason":"…"}]} with exactly 1 pick.',
    );
    expect(system.content).not.toContain('every recipe in the list');
  });

  it('WX-10 asks for exactly 1 pick in Discover', () => {
    const [system] = builder.build({
      scope: 'discover',
      weather: SNAPSHOT,
      candidates: CANDIDATES,
    });

    expect(system.content).toContain('exactly 1 pick');
    expect(MAX_PICKS.discover).toBe(1);
  });

  it('WX-10 writes candidates as `id | title | category | N min`', () => {
    const lines = builder
      .build({ scope: 'home', weather: SNAPSHOT, candidates: CANDIDATES })[1]
      .content.split('\n');

    expect(lines).toContain('Recipes (id | title | category | time):');
    expect(lines).toContain(
      '11111111-1111-4111-8111-111111111111 | Tonkotsu ramen | Pasta | 45 min',
    );
  });

  it('WX-10 drops the time from the candidate line when it is unknown', () => {
    const lines = builder
      .build({ scope: 'home', weather: SNAPSHOT, candidates: CANDIDATES })[1]
      .content.split('\n');

    expect(lines).toContain(
      '22222222-2222-4222-8222-222222222222 | Garden salad | Vegan',
    );
  });

  it('WX-10 opens the user message with the temperature, condition, day flag, hour and city', () => {
    const lines = builder
      .build({ scope: 'home', weather: SNAPSHOT, candidates: CANDIDATES })[1]
      .content.split('\n');

    expect(lines[0]).toBe('Weather: 9°C, clear, night, hour 21, Tel Aviv');
  });

  it('WX-10 says "day" when Open-Meteo reports is_day', () => {
    const lines = builder
      .build({
        scope: 'home',
        weather: { ...SNAPSHOT, isDay: true, temperatureC: 31.2, localHour: 14 },
        candidates: CANDIDATES,
      })[1]
      .content.split('\n');

    expect(lines[0]).toBe('Weather: 31°C, clear, day, hour 14, Tel Aviv');
  });

  it('WX-10 says "Weather unknown" for a city Open-Meteo cannot geocode', () => {
    const lines = builder
      .build({ scope: 'home', weather: null, candidates: CANDIDATES })[1]
      .content.split('\n');

    expect(lines[0]).toBe('Weather unknown');
  });
});
