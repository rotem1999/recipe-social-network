// The design guide §2 "Recommendation card": a sage container with a 64px
// circle glyph, a kicker, the recipe title, the model's one-line reason and the
// WX-5 "Show another" / primary action pair. Used by both scopes (SPEC §8 WX-2).
import type { ReactElement, ReactNode } from 'react';
import { Button, Icon, InlineError, Kicker } from '@rsn/web/ui';
import type { RecommendationState } from './use-recommendation';

/** Everything the two scopes differ in; the layout itself is shared. */
export interface RecommendationCardProps {
  /** "FROM YOUR SAVED RECIPES" (home) or "FROM THE COMMUNITY" (discover). */
  kicker: string;
  state: RecommendationState;
  /** Opens the picked recipe from its title. */
  onOpen: (id: string) => void;
  /** The primary button, rendered only when there is a pick. */
  action: ReactNode;
}

/** UI-3: the guide's recommendation strip, built from the theme tokens only. */
export function RecommendationCard({
  kicker,
  state,
  onOpen,
  action,
}: RecommendationCardProps): ReactElement {
  const { pick, loading, message, canShowAnother, showAnother } = state;

  return (
    <section
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-6)',
        padding: 'var(--space-6) var(--space-8)',
        borderRadius: 'calc(var(--radius-lg) * 1.15)',
        background: 'var(--color-accent-2-100)',
      }}
    >
      <span
        style={{
          width: '64px',
          height: '64px',
          flex: 'none',
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-accent-2-200)',
          color: 'var(--color-accent-2-700)',
        }}
      >
        <Icon.Utensils size={28} />
      </span>

      <div style={{ flex: 1, minWidth: '220px' }}>
        <Kicker tone="accent-2" style={{ marginBottom: 'var(--space-1)' }}>
          {kicker}
        </Kicker>
        {pick === null ? (
          <p
            className={loading ? 'pulse' : undefined}
            style={{
              margin: 0,
              fontSize: '14px',
              color: 'var(--color-accent-2-800)',
            }}
          >
            {loading
              ? 'Reading the weather…'
              : (message ?? 'No recommendation right now')}
          </p>
        ) : (
          <>
            <h3 style={{ marginBottom: 'var(--space-1)' }}>
              <button
                type="button"
                onClick={() => onOpen(pick.recipe.id)}
                style={{
                  font: 'inherit',
                  color: 'inherit',
                  background: 'none',
                  border: 0,
                  padding: 0,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {pick.recipe.title}
              </button>
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: '14px',
                color: 'var(--color-accent-2-800)',
              }}
            >
              {pick.reason}
            </p>
            {message === null ? null : <InlineError>{message}</InlineError>}
          </>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
        }}
      >
        {/* WX-5: re-prompts with every shown id excluded. */}
        <Button
          variant="ghost"
          onClick={showAnother}
          disabled={!canShowAnother}
          loading={loading}
          style={{ color: 'var(--color-accent-2-700)' }}
        >
          Show another
        </Button>
        {pick === null ? null : action}
      </div>
    </section>
  );
}
