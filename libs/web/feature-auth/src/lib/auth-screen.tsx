// SPEC.md §11.5 UI-9: sign-in and sign-up are one screen with a segmented
// switch, fields per AUTH-5, errors inline under the form.
import { useId, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@rsn/shared/util-domain';
import { ApiError, useAuth } from '@rsn/web/data-access-api';
import {
  Button,
  Field,
  Icon,
  InlineError,
  Input,
  Segmented,
} from '@rsn/web/ui';

/** UI-9: the two halves of the one auth screen. */
export type AuthMode = 'sign-in' | 'sign-up';

const MODES: readonly { value: AuthMode; label: string }[] = [
  { value: 'sign-in', label: 'Sign in' },
  { value: 'sign-up', label: 'Sign up' },
];

/** UI-44: shown above the form when the client ended the session after a 401. */
export const SESSION_ENDED_MESSAGE = 'Your session ended. Sign in again.';

/** AUTH-5 message for a username that is not 3–32 of `[a-z0-9_.-]`. */
const USERNAME_MESSAGE =
  'Use 3 to 32 characters: letters, numbers, underscore, dot or hyphen.';

/**
 * A minimal `local@domain.tld` shape. AUTH-5 only requires an email to be
 * unique and lower-case; the API validates the address itself, so the form
 * rejects no more than an obviously malformed entry.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the form can say about each field before it is sent (UI-9). */
interface FieldErrors {
  username?: string;
  password?: string;
  email?: string;
}

/**
 * AUTH-5, checked on the stored form: the username is trimmed and lower-cased
 * before `USERNAME_PATTERN`, the password is measured against its length
 * limits, and the email (sign-up only, optional) is checked when it is filled.
 */
function validate(
  mode: AuthMode,
  username: string,
  password: string,
  email: string,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!USERNAME_PATTERN.test(username.trim().toLowerCase())) {
    errors.username = USERNAME_MESSAGE;
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  const trimmedEmail = email.trim();
  if (
    mode === 'sign-up' &&
    trimmedEmail.length > 0 &&
    !EMAIL_PATTERN.test(trimmedEmail)
  ) {
    errors.email = 'Enter an email address like you@example.com.';
  }

  return errors;
}

/**
 * UI-9: the screen shown whenever there is no valid token. Submits through
 * `useAuth().signIn` / `signUp` (AUTH-5..7); the API's message is shown inline
 * under the form.
 */
export function AuthScreen(): ReactElement {
  const { signIn, signUp, sessionEnded } = useAuth();
  const ids = useId();
  const usernameId = `${ids}-username`;
  const passwordId = `${ids}-password`;
  const emailId = `${ids}-email`;

  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Switching halves keeps what was typed but clears every message. */
  const changeMode = (next: AuthMode): void => {
    setMode(next);
    setErrors({});
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setFormError(null);

    const found = validate(mode, username, password, email);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    // AUTH-5: the username is stored lower-case, so it is sent lower-case.
    const credentials = { username: username.trim().toLowerCase(), password };
    const trimmedEmail = email.trim().toLowerCase();

    setSubmitting(true);
    try {
      if (mode === 'sign-up') {
        await signUp(
          trimmedEmail.length > 0
            ? { ...credentials, email: trimmedEmail }
            : credentials,
        );
      } else {
        await signIn(credentials);
      }
      // On success the shell swaps this screen out, so nothing is reset here.
    } catch (cause: unknown) {
      setFormError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : 'Something went wrong. Please try again.',
      );
      setSubmitting(false);
    }
  };

  return (
    <main className="screen screen-narrow">
      <div className="brand mb-1">
        <span className="nav-mark">
          <Icon.ChefHat size={18} />
        </span>
        {/* UI-2: the app is branded CookBook everywhere. */}
        <h1 className="m-0">CookBook</h1>
      </div>
      <p className="text-muted page-lead">
        Recipes for family and friends.
      </p>

      {/* UI-44: only after a session ended on a 401; a sign-out shows nothing. */}
      {sessionEnded ? (
        <InlineError className="mb-4">{SESSION_ENDED_MESSAGE}</InlineError>
      ) : null}

      <Segmented
        label="Sign in or sign up"
        options={MODES}
        value={mode}
        onChange={changeMode}
      />

      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        noValidate
        className="stack gap-4 mt-6"
      >
        <Field
          label="Username"
          htmlFor={usernameId}
          error={errors.username}
          hint={mode === 'sign-up' ? USERNAME_MESSAGE : undefined}
        >
          <Input
            id={usernameId}
            name="username"
            value={username}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={errors.username === undefined ? undefined : true}
            onChange={(event) => setUsername(event.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor={passwordId} error={errors.password}>
          <Input
            id={passwordId}
            name="password"
            type="password"
            value={password}
            autoComplete={
              mode === 'sign-up' ? 'new-password' : 'current-password'
            }
            aria-invalid={errors.password === undefined ? undefined : true}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {/* AUTH-5: the email is optional and belongs to sign-up only. */}
        {mode === 'sign-up' ? (
          <Field
            label="Email (optional)"
            htmlFor={emailId}
            error={errors.email}
            hint="Lets friends find you by email."
          >
            <Input
              id={emailId}
              name="email"
              type="email"
              value={email}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={errors.email === undefined ? undefined : true}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
        ) : null}

        <Button type="submit" variant="primary" block loading={submitting}>
          {mode === 'sign-up' ? 'Create account' : 'Sign in'}
        </Button>

        {/* UI-9: the API's own message, inline under the form. */}
        {formError === null ? null : <InlineError>{formError}</InlineError>}
      </form>
    </main>
  );
}
