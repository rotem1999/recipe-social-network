import { Injectable } from '@nestjs/common';
import type { ChatMessage } from '@rsn/api/data-access-openrouter';
import type { WeatherSnapshot } from '@rsn/api/data-access-weather';
import type { RecommendScope } from '@rsn/shared/util-contracts';

/** WX-10: one candidate line of the prompt, `id | title | category | N min`. */
export interface RecommendCandidate {
  id: string;
  title: string;
  category: string;
  minutes: number | undefined;
}

/** Everything the WX-10 prompt is built from. */
export interface RecommendPromptInput {
  scope: RecommendScope;
  weather: WeatherSnapshot | null;
  candidates: RecommendCandidate[];
}

/** WX-10: up to 3 picks in the personal space (WX-4), 1 in Discover. */
export const MAX_PICKS: Record<RecommendScope, number> = {
  home: 3,
  discover: 1,
};

/**
 * WX-3/WX-10: builds the recommendation prompt. Pure: no I/O, no state, so the
 * exact wording sent to OpenRouter is testable on its own. COOK-4 keeps it
 * short to conserve tokens.
 */
@Injectable()
export class RecommendPromptBuilder {
  /** WX-10: system + user message for one recommendation request. */
  build(input: RecommendPromptInput): ChatMessage[] {
    return [
      { role: 'system', content: systemMessage(input.scope) },
      { role: 'user', content: userMessage(input) },
    ];
  }
}

/** WX-10: strict JSON, ids only from the list, reasons under 20 words. */
function systemMessage(scope: RecommendScope): string {
  const max = MAX_PICKS[scope];
  const picks =
    max === 1
      ? 'exactly 1 pick'
      : // WX-4: with reasoning off the model tends to stop at one pick unless told
        // to fill the list (2026-09-30).
        `${max} picks, best first, or every recipe in the list when it has fewer than ${max}`;
  return [
    'You pick recipes from a fixed list to suit the weather and the time of day.',
    `Answer with strict JSON only: {"picks":[{"id":"…","reason":"…"}]} with ${picks}.`,
    'Use only ids copied from the list; never invent or alter an id.',
    'Each reason is under 20 words and says why the dish suits the weather and hour.',
    'No prose, no markdown, no code fence.',
  ].join('\n');
}

/** WX-10: weather context, then one candidate per line. */
function userMessage(input: RecommendPromptInput): string {
  const lines = [
    weatherContextLine(input.weather),
    'Recipes (id | title | category | time):',
    ...input.candidates.map(candidateLine),
  ];
  return lines.join('\n');
}

/**
 * WX-10: temperature, condition word, day/night, local hour and city. A city
 * Open-Meteo cannot geocode leaves the model without weather context.
 */
function weatherContextLine(weather: WeatherSnapshot | null): string {
  if (weather === null) return 'Weather unknown';
  const parts = [
    `${Math.round(weather.temperatureC)}°C`,
    weather.condition,
    weather.isDay ? 'day' : 'night',
    `hour ${weather.localHour}`,
    weather.city,
  ];
  return `Weather: ${parts.join(', ')}`;
}

/** WX-10: `id | title | category | N min`; the time is dropped when unknown. */
function candidateLine(candidate: RecommendCandidate): string {
  const parts = [candidate.id, candidate.title, candidate.category];
  if (candidate.minutes !== undefined) parts.push(`${candidate.minutes} min`);
  return parts.join(' | ');
}
