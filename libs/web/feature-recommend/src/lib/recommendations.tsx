// SPEC.md §8: the weather- and time-based recommendation strips. WX-2 puts one
// on Home (from the caller's saved recipes, WX-4) and one on Discover (from the
// community); both list their ranked picks (UI-18) and re-prompt with the
// shown ids excluded (WX-5).
import type { ReactElement } from 'react';
import type { WeatherContextDto } from '@rsn/shared/util-contracts';
import { Button, Icon } from '@rsn/web/ui';
import { RecommendationCard } from './recommendation-card';
import { useRecommendation } from './use-recommendation';

/** What the shell hands the home strip (UI-16: navigation is callbacks). */
export interface HomeRecommendationProps {
  onCook: (id: string) => void;
  onOpen: (id: string) => void;
  /** WX-2: the shell shows this weather line under the greeting. */
  onWeather: (weather: WeatherContextDto | null) => void;
  /**
   * UI-38: whether the caller has any own or saved recipe (from Home's
   * `GET /recipes`); null or omitted while unknown.
   */
  hasCandidates?: boolean | null;
}

/** UI-38: the Home card's line for a caller with nothing to rank. */
const NO_CANDIDATES_LINE =
  "Save or write a recipe and we'll suggest one for the weather.";

/** WX-2/WX-4: the home strip, ranked over the caller's own and saved recipes. */
export function HomeRecommendation({
  onCook,
  onOpen,
  onWeather,
  hasCandidates = null,
}: HomeRecommendationProps): ReactElement {
  // WX-10: with no candidates the API answers without a model call, so the
  // request still runs and still brings the greeting's weather line.
  const state = useRecommendation('home', onWeather);

  return (
    <RecommendationCard
      kicker="From your saved recipes"
      state={state}
      onOpen={onOpen}
      loadingText="Choosing from your recipes…"
      placeholder={hasCandidates === false ? NO_CANDIDATES_LINE : null}
      renderAction={(pick) => (
        <Button variant="primary" onClick={() => onCook(pick.recipe.id)}>
          <Icon.Play size={15} />
          Cook it
        </Button>
      )}
    />
  );
}

/** What the shell hands the discover strip. */
export interface DiscoverRecommendationProps {
  onOpen: (id: string) => void;
}

/** WX-2 + DISC-3: the same card over the newest public recipes (WX-10). */
export function DiscoverRecommendation({
  onOpen,
}: DiscoverRecommendationProps): ReactElement {
  const state = useRecommendation('discover');

  return (
    <RecommendationCard
      kicker="From the community"
      state={state}
      onOpen={onOpen}
      loadingText="Choosing from the community…"
      renderAction={(pick) => (
        <Button variant="primary" onClick={() => onOpen(pick.recipe.id)}>
          View recipe
        </Button>
      )}
    />
  );
}
