// SPEC.md §7 (COOK-1..COOK-10) and §11.5 UI-15, laid out from the design guide
// §6 "Cook mode". The screen is full-width without the nav bar; the shell hides
// the bar on the cook route (UI-16).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { COOK_QUESTION_MAX_LENGTH } from '@rsn/shared/util-domain';
import { ApiError, useApi, useRequest } from '@rsn/web/data-access-api';
import {
  Button,
  EmptyState,
  Icon,
  InlineError,
  Input,
  Kicker,
  ProgressBar,
  ProgressDots,
} from '@rsn/web/ui';

/** What the shell hands cook mode (UI-16: navigation is callbacks, no router). */
export interface CookScreenProps {
  recipeId: string;
  /** Leaves cook mode — the exit button, and "Finish" on the last step. */
  onExit: () => void;
}

/** The guide's countdown pill: "6:59", and "Done — 0:00" once it runs out. */
function formatTimer(seconds: number): string {
  const total = Math.max(seconds, 0);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/**
 * COOK-1: the live step tracker. COOK-2/4/9: one "Ask about this step" button
 * per step; the recipe context is attached server-side and the answer belongs
 * to the step that is on screen only.
 */
export function CookScreen({
  recipeId,
  onExit,
}: CookScreenProps): ReactElement {
  const api = useApi();
  const {
    data: recipe,
    loading: recipeLoading,
    error: recipeError,
  } = useRequest(() => api.getRecipe(recipeId), [recipeId]);
  // UI-15: the quota is read on entry and replaced from every ask response.
  const { data: quota, setData: setQuota } = useRequest(
    () => api.cookQuota(),
    [],
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // Lets a late `POST /cook/ask` recognise that the user has moved on (COOK-9).
  const stepIndexRef = useRef(stepIndex);
  stepIndexRef.current = stepIndex;

  const steps = recipe?.steps ?? [];
  const stepCount = steps.length;
  const safeIndex = stepCount === 0 ? 0 : Math.min(stepIndex, stepCount - 1);
  const step = steps[safeIndex];
  const isLastStep = stepCount > 0 && safeIndex === stepCount - 1;

  // COOK-9: nothing is kept between steps — the answer, the question and the
  // step's timer are all discarded when the step changes (UI-15).
  useEffect(() => {
    setSecondsLeft(null);
    setTimerRunning(false);
    setAnswer(null);
    setAskError(null);
    setAsking(false);
    setQuestion('');
  }, [stepIndex]);

  // UI-15: the timer belongs to the current step. The interval is keyed on the
  // step index and is cleared on a step change and on unmount (exit).
  useEffect(() => {
    if (!timerRunning) {
      return undefined;
    }
    const handle = setInterval(() => {
      setSecondsLeft((value) => (value === null || value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => {
      clearInterval(handle);
    };
  }, [stepIndex, timerRunning]);

  // The countdown stops itself at 0:00; the pill then reads "Done — 0:00".
  useEffect(() => {
    if (secondsLeft === 0) {
      setTimerRunning(false);
    }
  }, [secondsLeft]);

  const goToStep = useCallback(
    (index: number): void => {
      setStepIndex(Math.min(Math.max(index, 0), Math.max(stepCount - 1, 0)));
    },
    [stepCount],
  );

  const startTimer = useCallback((): void => {
    setSecondsLeft((step?.durationMinutes ?? 0) * 60);
    setTimerRunning(true);
  }, [step]);

  const stopTimer = useCallback((): void => {
    setTimerRunning(false);
    setSecondsLeft(null);
  }, []);

  // COOK-2/COOK-10: one request per question, carrying only the recipe id and
  // the current step; the backend builds the prompt and counts the quota.
  const ask = useCallback(async (): Promise<void> => {
    const forStep = safeIndex;
    setAsking(true);
    setAskError(null);
    setAnswer(null);
    try {
      const trimmed = question.trim();
      const response = await api.cookAsk({
        recipeId,
        stepIndex: forStep,
        question: trimmed.length > 0 ? trimmed : undefined,
      });
      if (stepIndexRef.current !== forStep) {
        return;
      }
      setAnswer(response.answer);
      setQuota(response.quota);
      setAsking(false);
    } catch (cause) {
      if (stepIndexRef.current !== forStep) {
        return;
      }
      // COOK-8: the daily quota is refused server-side with 429.
      setAskError(
        cause instanceof ApiError && cause.status === 429
          ? "You've used today's AI asks"
          : cause instanceof Error
            ? cause.message
            : 'The assistant could not be reached.',
      );
      setAsking(false);
    }
  }, [api, question, recipeId, safeIndex, setQuota]);

  if (recipe === null) {
    return (
      <main className="screen screen-cook">
        {recipeLoading ? (
          <p className="text-muted pulse">Loading…</p>
        ) : (
          <>
            <InlineError>
              {recipeError === null
                ? 'This recipe could not be opened.'
                : recipeError.message}
            </InlineError>
            <Button onClick={onExit}>Back to the recipe</Button>
          </>
        )}
      </main>
    );
  }

  if (step === undefined) {
    return (
      <main className="screen screen-cook">
        <EmptyState
          text="This recipe has no steps to cook yet."
          action={<Button onClick={onExit}>Back to the recipe</Button>}
        />
      </main>
    );
  }

  return (
    <main
      className="screen screen-cook"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Guide §6 top row: exit, title, and the quota COOK-8 counts server-side. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <Button variant="icon" onClick={onExit} title="Leave cook mode">
          <Icon.X size={15} />
        </Button>
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-heading)',
            fontSize: '17px',
          }}
        >
          {recipe.title}
        </span>
        {quota === null ? null : (
          <span className="text-muted" style={{ fontSize: '12px' }}>
            {`${quota.remaining} of ${quota.limit} AI asks left today`}
          </span>
        )}
      </div>

      <div style={{ marginTop: 'var(--space-4)' }}>
        <ProgressBar
          value={safeIndex + 1}
          max={stepCount}
          label="Cook progress"
        />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 'var(--space-8) 0',
        }}
      >
        <Kicker style={{ marginBottom: 'var(--space-3)' }}>
          {`Step ${safeIndex + 1} of ${stepCount}`}
        </Kicker>
        {/* UI-3: the step text is the screen's heading, so it takes the h1 token. */}
        <h1 style={{ maxWidth: '600px', marginBottom: 'var(--space-6)' }}>
          {step.text}
        </h1>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          {/* §3.1.1: a step with durationMinutes gets the guide's timer. */}
          {step.durationMinutes !== undefined && secondsLeft === null ? (
            <Button onClick={startTimer}>
              <Icon.Timer size={15} />
              {`Start ${step.durationMinutes} min timer`}
            </Button>
          ) : null}
          {secondsLeft === null ? null : (
            <Button
              onClick={stopTimer}
              title="Stop the timer"
              style={{
                background: 'var(--color-accent-2-200)',
                color: 'var(--color-accent-2-900)',
                fontSize: '15px',
              }}
            >
              <span
                className="pulse"
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--color-accent-2-700)',
                }}
              />
              {`${secondsLeft === 0 ? 'Done — ' : ''}${formatTimer(secondsLeft)}`}
            </Button>
          )}

          <Button onClick={ask} loading={asking}>
            <Icon.Sparkles size={15} />
            Ask about this step
          </Button>
          {/* COOK-10: the question is optional and capped at 500 characters. */}
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={COOK_QUESTION_MAX_LENGTH}
            placeholder="Ask something about this step (optional)"
            aria-label="Question about this step"
            style={{ maxWidth: '320px' }}
          />
        </div>

        {asking ? (
          <div
            className="pulse"
            style={{
              marginTop: 'var(--space-6)',
              fontSize: '14px',
              color: 'var(--color-accent-2-700)',
            }}
          >
            Reading the recipe…
          </div>
        ) : null}
        {askError === null ? null : <InlineError>{askError}</InlineError>}
        {answer === null ? null : (
          <div
            style={{
              marginTop: 'var(--space-6)',
              maxWidth: '560px',
              padding: 'var(--space-4) var(--space-6)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-accent-2-100)',
            }}
          >
            <Kicker tone="accent-2" style={{ marginBottom: 'var(--space-1)' }}>
              Tip for this step
            </Kicker>
            <div
              style={{
                fontSize: '15px',
                lineHeight: 1.55,
                color: 'var(--color-accent-2-900)',
              }}
            >
              {answer}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 'var(--space-3)',
        }}
      >
        <Button
          variant="ghost"
          onClick={() => goToStep(safeIndex - 1)}
          disabled={safeIndex === 0}
          style={{ opacity: safeIndex === 0 ? 0.35 : undefined }}
        >
          Back
        </Button>
        <ProgressDots
          count={stepCount}
          current={safeIndex}
          onSelect={goToStep}
        />
        <Button
          variant="primary"
          onClick={() => {
            if (isLastStep) {
              onExit();
            } else {
              goToStep(safeIndex + 1);
            }
          }}
          style={{
            fontSize: '15px',
            padding: 'var(--space-2) var(--space-6)',
          }}
        >
          {isLastStep ? 'Finish' : 'Next step'}
        </Button>
      </div>
    </main>
  );
}
