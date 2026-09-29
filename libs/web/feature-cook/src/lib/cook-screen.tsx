// SPEC.md §7 (COOK-1..COOK-10) and §11.5 UI-15/UI-47/UI-50, laid out from the
// design guide §6 "Cook mode". The screen is full-width without the nav bar; the
// shell hides the bar on the cook route (UI-16).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import {
  COOK_QUESTION_MAX_LENGTH,
  // §3.1.1 / UI-15: cook mode offers a timer only up to 120 minutes; a longer
  // step shows its minutes without a timer button.
  MAX_COOK_TIMER_MINUTES,
} from '@rsn/shared/util-domain';
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
  Tag,
} from '@rsn/web/ui';
import { openChimeContext, playChime } from './cook-chime';
import { CookIngredients } from './cook-ingredients';
import { CookTimerPill, formatTimer } from './cook-timer-pill';

/** How often the running timers re-read the clock. */
const TIMER_TICK_MS = 250;

/**
 * UI-15: one timer per step. It counts to a wall-clock end time, so a throttled
 * background window never slows it down; `chimed` records that the zero chime
 * has played.
 */
interface CookTimer {
  stepIndex: number;
  endsAt: number;
  chimed: boolean;
}

function secondsUntil(endsAt: number, now: number): number {
  return Math.max(Math.ceil((endsAt - now) / 1000), 0);
}

/** UI-15: ← and → never fire while the user types (the question box). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/** What the shell hands cook mode (UI-16: navigation is callbacks, no router). */
export interface CookScreenProps {
  recipeId: string;
  /** Leaves cook mode — the exit button, and "Finish" on the last step. */
  onExit: () => void;
  /** UI-35: 0-based step to open on, read once (a restored step after a reload). */
  initialStep?: number;
  /** UI-35: told the 0-based step whenever it changes, so the shell can keep it. */
  onStepChange?: (stepIndex: number) => void;
}

/**
 * COOK-1: the live step tracker. COOK-2/4/9: one "Ask about this step" button
 * per step; the recipe context is attached server-side and the answer belongs
 * to the step that is on screen only.
 */
export function CookScreen({
  recipeId,
  onExit,
  initialStep,
  onStepChange,
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

  // UI-35: a restored step is clamped to the recipe's steps by `safeIndex`.
  const [stepIndex, setStepIndex] = useState(() =>
    Math.max(initialStep ?? 0, 0),
  );
  // UI-15: timers outlive step changes; they all go when cook mode unmounts.
  const [timers, setTimers] = useState<CookTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  // UI-15: the chime's AudioContext, opened from the "Start timer" click.
  const audioRef = useRef<AudioContext | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  // UI-47: whether the shown answer replies to a typed question ("Answer") or
  // is the no-question tip ("Tip for this step").
  const [answerForQuestion, setAnswerForQuestion] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // Lets a late `POST /cook/ask` recognise that the user has moved on (COOK-9).
  const stepIndexRef = useRef(stepIndex);
  stepIndexRef.current = stepIndex;
  // Kept in a ref so a new callback identity never re-runs the step effect.
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;

  const steps = recipe?.steps ?? [];
  const stepCount = steps.length;
  const safeIndex = stepCount === 0 ? 0 : Math.min(stepIndex, stepCount - 1);
  const step = steps[safeIndex];
  const isLastStep = stepCount > 0 && safeIndex === stepCount - 1;

  // COOK-9: the answer, the question and any error are discarded when the step
  // changes. Timers are not: they keep running across steps (UI-15).
  useEffect(() => {
    setAnswer(null);
    setAskError(null);
    setAsking(false);
    setQuestion('');
    onStepChangeRef.current?.(stepIndex);
  }, [stepIndex]);

  // UI-15: one clock for every timer, running only while a timer has yet to
  // reach zero; the interval is cleared on unmount, which stops all timers.
  const anyRunning = timers.some((timer) => !timer.chimed);
  useEffect(() => {
    if (!anyRunning) {
      return undefined;
    }
    const handle = setInterval(() => {
      setNow(Date.now());
    }, TIMER_TICK_MS);
    return () => {
      clearInterval(handle);
    };
  }, [anyRunning]);

  // UI-15: a timer that reaches zero chimes once; its pill then flashes.
  useEffect(() => {
    if (!timers.some((timer) => !timer.chimed && timer.endsAt <= now)) {
      return;
    }
    playChime(audioRef.current);
    setTimers((current) =>
      current.map((timer) =>
        !timer.chimed && timer.endsAt <= now
          ? { ...timer, chimed: true }
          : timer,
      ),
    );
  }, [now, timers]);

  // UI-15: leaving cook mode releases the chime's audio context.
  useEffect(
    () => () => {
      void audioRef.current?.close().catch(() => undefined);
      audioRef.current = null;
    },
    [],
  );

  const goToStep = useCallback(
    (index: number): void => {
      setStepIndex(Math.min(Math.max(index, 0), Math.max(stepCount - 1, 0)));
    },
    [stepCount],
  );

  // UI-15: ← and → move to the previous and next step (→ never finishes).
  useEffect(() => {
    if (stepCount === 0) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') ||
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      goToStep(safeIndex + (event.key === 'ArrowLeft' ? -1 : 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [goToStep, safeIndex, stepCount]);

  const startTimer = useCallback((): void => {
    const minutes = step?.durationMinutes;
    if (minutes === undefined || minutes > MAX_COOK_TIMER_MINUTES) {
      return;
    }
    // The click is the user gesture browsers require before Web Audio may play.
    audioRef.current = openChimeContext(audioRef.current);
    const startedAt = Date.now();
    setNow(startedAt);
    setTimers((current) => [
      ...current.filter((timer) => timer.stepIndex !== safeIndex),
      {
        stepIndex: safeIndex,
        endsAt: startedAt + minutes * 60_000,
        chimed: false,
      },
    ]);
  }, [safeIndex, step]);

  const dismissTimer = useCallback((forStep: number): void => {
    setTimers((current) =>
      current.filter((timer) => timer.stepIndex !== forStep),
    );
  }, []);

  // UI-15: Ask is disabled once the day's quota is spent (COOK-8).
  const outOfAsks = quota !== null && quota.remaining <= 0;

  // COOK-2/COOK-10: one request per question, carrying only the recipe id and
  // the current step; the backend builds the prompt and counts the quota.
  const ask = useCallback(async (): Promise<void> => {
    if (outOfAsks) {
      return;
    }
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
      setAnswerForQuestion(trimmed.length > 0);
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
  }, [api, outOfAsks, question, recipeId, safeIndex, setQuota]);

  // UI-15: Enter in the question box asks, unless an ask is running or none are
  // left; an IME composition's Enter only confirms the composed text.
  const onQuestionKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ): void => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    if (!asking && !outOfAsks) {
      void ask();
    }
  };

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

  // UI-15: the current step's timer, if one was started here and not dismissed.
  const stepTimer = timers.find((timer) => timer.stepIndex === safeIndex);
  const stepSecondsLeft =
    stepTimer === undefined ? null : secondsUntil(stepTimer.endsAt, now);
  const minutes = step.durationMinutes;

  return (
    <main className="screen screen-cook cook-screen">
      {/* Guide §6 top row: exit, title, the timer pills (UI-15) and the quota
          COOK-8 counts server-side. */}
      <div className="row gap-3 wrap">
        <Button variant="icon" onClick={onExit} title="Leave cook mode">
          <Icon.X size={15} />
        </Button>
        <span dir="auto" className="cook-title bidi-text">
          {recipe.title}
        </span>
        {timers.length === 0 ? null : (
          <span className="row wrap">
            {[...timers]
              .sort((a, b) => a.stepIndex - b.stepIndex)
              .map((timer) => (
                <CookTimerPill
                  key={timer.stepIndex}
                  stepIndex={timer.stepIndex}
                  secondsLeft={secondsUntil(timer.endsAt, now)}
                  onOpen={() => goToStep(timer.stepIndex)}
                  onDismiss={() => dismissTimer(timer.stepIndex)}
                />
              ))}
          </span>
        )}
        {quota === null ? null : (
          <span className="text-muted text-small">
            {`${quota.remaining} of ${quota.limit} AI asks left today`}
          </span>
        )}
      </div>

      <div className="mt-4">
        <ProgressBar
          value={safeIndex + 1}
          max={stepCount}
          label="Cook progress"
        />
      </div>

      <CookIngredients
        ingredients={recipe.ingredients}
        servings={recipe.servings}
      />
      <div className="cook-stage">
        <Kicker className="mb-3">
          {`Step ${safeIndex + 1} of ${stepCount}`}
        </Kicker>
        {/* UI-3: the step text is the screen's heading, so it takes the h1 token. */}
        {/* UI-41/UI-50: user-written text reads in its own direction; the
            stage keeps the page's left alignment. */}
        <h1 dir="auto" className="cook-step bidi-text">
          {step.text}
        </h1>

        <div className="row gap-3 wrap">
          {/* §3.1.1: a step with durationMinutes gets the guide's timer, up to
              120 minutes; a longer step shows its minutes only (UI-15). */}
          {minutes !== undefined && minutes > MAX_COOK_TIMER_MINUTES ? (
            <Tag tone="accent-2">
              <Icon.Timer size={11} />
              &nbsp;{minutes} min
            </Tag>
          ) : null}
          {minutes !== undefined &&
          minutes <= MAX_COOK_TIMER_MINUTES &&
          stepSecondsLeft === null ? (
            <Button onClick={startTimer}>
              <Icon.Timer size={15} />
              {`Start ${minutes} min timer`}
            </Button>
          ) : null}
          {stepSecondsLeft === null ? null : (
            <Button
              onClick={() => dismissTimer(safeIndex)}
              title="Stop the timer"
              className="cook-timer-running"
            >
              <span className="pulse cook-timer-dot" />
              {`${stepSecondsLeft === 0 ? 'Done — ' : ''}${formatTimer(stepSecondsLeft)}`}
            </Button>
          )}

          <Button onClick={ask} loading={asking} disabled={outOfAsks}>
            <Icon.Sparkles size={15} />
            {outOfAsks ? 'No AI asks left today' : 'Ask about this step'}
          </Button>
          {/* COOK-10: the question is optional and capped at 500 characters;
              Enter asks (UI-15); dir="auto" follows the typed text (UI-41). */}
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={onQuestionKeyDown}
            dir="auto"
            maxLength={COOK_QUESTION_MAX_LENGTH}
            placeholder="Ask something about this step (optional)"
            aria-label="Question about this step"
            style={{ maxWidth: '320px' }}
          />
        </div>

        {asking ? (
          <div className="pulse cook-reading">Reading the recipe…</div>
        ) : null}
        {askError === null ? null : <InlineError>{askError}</InlineError>}
        {answer === null ? null : (
          // UI-15: at most 40% of the window high; a long answer scrolls inside.
          <div className="cook-answer">
            <Kicker tone="accent-2" className="mb-1">
              {answerForQuestion ? 'Answer' : 'Tip for this step'}
            </Kicker>
            {/* UI-41/UI-50: AI text, directional inside the left-aligned panel. */}
            <div dir="auto" className="cook-answer-text bidi-text">
              {answer}
            </div>
          </div>
        )}
      </div>

      <div className="cook-footer">
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
          className="cook-next"
        >
          {isLastStep ? 'Finish' : 'Next step'}
        </Button>
      </div>
    </main>
  );
}
