// SPEC.md §8: the weather- and time-based recommendation strips. WX-2 puts one
// on Home (from the caller's saved recipes, WX-4) and one on Discover (from the
// community); both re-prompt with the shown ids excluded (WX-5).
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
}

/** WX-2/WX-4: the home strip, ranked over the caller's own and saved recipes. */
export function HomeRecommendation({
  onCook,
  onOpen,
  onWeather,
}: HomeRecommendationProps): ReactElement {
  const state = useRecommendation('home', onWeather);

  return (
    <RecommendationCard
      kicker="From your saved recipes"
      state={state}
      onOpen={onOpen}
      action={
        <Button
          variant="primary"
          onClick={() => {
            if (state.pick !== null) {
              onCook(state.pick.recipe.id);
            }
          }}
        >
          <Icon.Play size={15} />
          Cook it
        </Button>
      }
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
      action={
        <Button
          variant="primary"
          onClick={() => {
            if (state.pick !== null) {
              onOpen(state.pick.recipe.id);
            }
          }}
        >
          View recipe
        </Button>
      }
    />
  );
}
