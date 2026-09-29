// The design guide §2 "Recommendation card": a sage container with a 64px
// circle glyph, a kicker, then the ranked picks (UI-18), each with its title,
// the model's one-line reason and its action, and the WX-5 "Show another".
// Used by both scopes (SPEC §8 WX-2).
import type { ReactElement, ReactNode } from 'react';
import type { RecommendationDto } from '@rsn/shared/util-contracts';
import { Button, Icon, InlineError, Kicker } from '@rsn/web/ui';
import type { RecommendationState } from './use-recommendation';

/** Everything the two scopes differ in; the layout itself is shared. */
export interface RecommendationCardProps {
  /** "FROM YOUR SAVED RECIPES" (home) or "FROM THE COMMUNITY" (discover). */
  kicker: string;
  state: RecommendationState;
  /** Opens the picked recipe from its title. */
  onOpen: (id: string) => void;
  /** The primary button of one pick's row (UI-18). */
  renderAction: (pick: RecommendationDto) => ReactNode;
  /** UI-38: "Choosing from your recipes…" (home) / "Choosing from the community…" (discover). */
  loadingText: string;
  /**
   * UI-38: when set, the card shows only this line and hides "Show another"
   * (Home, for a caller with no own or saved recipe to rank).
   */
  placeholder?: string | null;
}

/** UI-3: the guide's recommendation strip, built from the theme tokens only. */
export function RecommendationCard({
  kicker,
  state,
  onOpen,
  renderAction,
  loadingText,
  placeholder = null,
}: RecommendationCardProps): ReactElement {
  const { picks, loading, message, notice, canShowAnother, showAnother } =
    state;
  const hasPlaceholder = placeholder !== null && placeholder !== '';

  return (
    <section className="recommendation">
      <span className="recommendation-glyph">
        <Icon.Utensils size={28} />
      </span>

      <div className="grow" style={{ minWidth: '220px' }}>
        <Kicker tone="accent-2" className="mb-1">
          {kicker}
        </Kicker>
        {hasPlaceholder ? (
          <p className="recommendation-reason">{placeholder}</p>
        ) : picks.length === 0 ? (
          <p
            className={
              loading ? 'recommendation-reason pulse' : 'recommendation-reason'
            }
          >
            {loading ? loadingText : (message ?? 'No recommendation right now')}
          </p>
        ) : (
          <>
            <ol className="list-reset stack gap-4">
              {picks.map((pick) => (
                <li key={pick.recipe.id} className="row gap-4 wrap">
                  <div className="grow" style={{ minWidth: '180px' }}>
                    <h3 className="mb-1">
                      {/* UI-41: `start`, so a right-to-left title lines up on the right. */}
                      <button
                        type="button"
                        onClick={() => onOpen(pick.recipe.id)}
                        className="plain-button inherit-font"
                        dir="auto"
                      >
                        {pick.recipe.title}
                      </button>
                    </h3>
                    {/* UI-41: the model's reason is AI-written text. */}
                    <p dir="auto" className="recommendation-reason">
                      {pick.reason}
                    </p>
                  </div>
                  {renderAction(pick)}
                </li>
              ))}
            </ol>
            {notice === null ? null : (
              <p className="text-muted text-body m-0 mt-3">{notice}</p>
            )}
            {message === null ? null : <InlineError>{message}</InlineError>}
          </>
        )}
      </div>

      {/* WX-5: re-prompts with every shown id excluded; UI-38 hides it with the placeholder. */}
      {hasPlaceholder ? null : (
        <Button
          variant="ghost"
          onClick={showAnother}
          disabled={!canShowAnother}
          loading={loading}
          className="recommendation-more"
        >
          Show another
        </Button>
      )}
    </section>
  );
}
