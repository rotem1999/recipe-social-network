// SPEC.md §4 (FR-1..FR-4) and the design guide §4: one screen that finds
// people, answers the requests they sent, and lists the friends recipes can be
// shared with without publishing them.
import { useCallback, useEffect, useId, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type {
  FriendDto,
  FriendRequestDto,
  FriendsResponse,
  UserSearchResultDto,
} from '@rsn/shared/util-contracts';
import { ApiError, useApi, useRequest } from '@rsn/web/data-access-api';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  InlineError,
  Input,
  Tag,
} from '@rsn/web/ui';

/** FR-4: the search only runs once the box holds something worth matching. */
const MIN_QUERY_LENGTH = 2;
/** Keystrokes settle for this long before `GET /users/search` is called. */
const SEARCH_DEBOUNCE_MS = 300;

const ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  padding: '13px 4px',
  borderBottom:
    '1px solid color-mix(in srgb, var(--color-text) 8%, transparent)',
} as const;

const AVATAR_STYLE = {
  width: '38px',
  height: '38px',
  flex: 'none',
  borderRadius: '50%',
  background: 'var(--color-accent-2-200)',
  color: 'var(--color-accent-2-800)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: '14px',
} as const;

const SECTION_STYLE = { marginTop: 'var(--space-8)' } as const;

/** Whatever the API said went wrong, as one line for {@link InlineError}. */
function messageOf(cause: unknown): string {
  if (cause instanceof ApiError || cause instanceof Error) {
    return cause.message;
  }
  return 'Something went wrong. Please try again.';
}

/** The guide's 38px circle: the first letter of the username. */
function initialOf(username: string): string {
  return username.slice(0, 1).toUpperCase();
}

/** "Friends since 3 May 2026" for a FriendDto's ISO `since` (invalid dates are dropped). */
function sinceLine(since: string): string | null {
  const date = new Date(since);
  return Number.isNaN(date.getTime())
    ? null
    : `Friends since ${date.toLocaleDateString()}`;
}

interface PersonRowProps {
  username: string;
  subLine?: string | null;
  /** Tags and buttons on the right of the row (guide §4). */
  children?: ReactNode;
}

/** The guide's §4 row: initial circle, username, muted sub-line, right-hand status. */
function PersonRow({
  username,
  subLine,
  children,
}: PersonRowProps): ReactElement {
  return (
    <div style={ROW_STYLE}>
      <span style={AVATAR_STYLE} aria-hidden={true}>
        {initialOf(username)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '14px' }}>{username}</div>
        {subLine === undefined || subLine === null ? null : (
          <div className="text-muted" style={{ fontSize: '12px' }}>
            {subLine}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

function Section({ title, children }: SectionProps): ReactElement {
  return (
    <section style={SECTION_STYLE}>
      <h4 style={{ marginBottom: 'var(--space-2)' }}>{title}</h4>
      {children}
    </section>
  );
}

/**
 * FR-1..FR-4: search for people, send and answer friend requests, and remove a
 * friend. Every mutation returns the whole {@link FriendsResponse}, which
 * replaces the one on screen.
 */
export function FriendsScreen(): ReactElement {
  const api = useApi();
  const searchId = useId();

  const friends = useRequest<FriendsResponse>(
    useCallback(() => api.getFriends(), [api]),
    [api],
  );
  const { data, setData } = friends;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResultDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  /** Rows whose request was sent in this session, so the label flips at once. */
  const [sentIds, setSentIds] = useState<readonly string[]>([]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<FriendDto | null>(null);

  // FR-3/FR-4: debounced `GET /users/search?q=`; under two characters there is
  // nothing to match, so no request is made.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    const timer = setTimeout(() => {
      api.searchUsers(trimmed).then(
        (response) => {
          if (!cancelled) {
            setResults(response.users);
            setSearching(false);
          }
        },
        (cause: unknown) => {
          if (!cancelled) {
            setResults([]);
            setSearchError(messageOf(cause));
            setSearching(false);
          }
        },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, query]);

  /** Runs one mutation and adopts the FriendsResponse it returns. */
  const mutate = useCallback(
    async (id: string, call: () => Promise<FriendsResponse>): Promise<void> => {
      setBusyId(id);
      setActionError(null);
      try {
        setData(await call());
      } catch (cause: unknown) {
        setActionError(messageOf(cause));
      } finally {
        setBusyId(null);
      }
    },
    [setData],
  );

  const sendRequest = (user: UserSearchResultDto): void => {
    void mutate(user.id, async () => {
      const response = await api.sendFriendRequest(user.id);
      setSentIds((ids) => [...ids, user.id]);
      return response;
    });
  };

  const removeFriend = (friend: FriendDto): void => {
    setConfirmRemove(null);
    void mutate(friend.userId, () => api.removeFriend(friend.userId));
  };

  const incoming: FriendRequestDto[] = data?.incoming ?? [];
  const outgoing: FriendRequestDto[] = data?.outgoing ?? [];
  const list: FriendDto[] = data?.friends ?? [];

  /** FR-4: a pending request between the two, seen from the caller's side. */
  const pendingDirection = (
    user: UserSearchResultDto,
  ): 'incoming' | 'outgoing' | null => {
    if (user.pendingRequestId === null) {
      return null;
    }
    return incoming.some((request) => request.id === user.pendingRequestId)
      ? 'incoming'
      : 'outgoing';
  };

  const searched = query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <main className="screen screen-narrow">
      <h1 style={{ marginBottom: 'var(--space-1)' }}>Friends</h1>
      <p className="text-muted" style={{ fontSize: '14px' }}>
        Share recipes without publishing them.
      </p>

      {/* FR-3: found by username, or by email when they have one on record. */}
      <Input
        id={searchId}
        type="search"
        value={query}
        placeholder="Find by username or email"
        aria-label="Find by username or email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.target.value)}
        style={{ width: '100%', marginTop: 'var(--space-4)' }}
      />

      {searchError === null ? null : <InlineError>{searchError}</InlineError>}

      {searched ? (
        <Section title="Search results">
          {searching && results.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '14px' }}>
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '14px' }}>
              No one found.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {results.map((user) => {
                const direction = pendingDirection(user);
                const sent = sentIds.includes(user.id);
                return (
                  <PersonRow key={user.id} username={user.username}>
                    {user.isSelf ? (
                      <Tag tone="neutral">You</Tag>
                    ) : user.isFriend ? (
                      <Tag tone="accent-2">Friends</Tag>
                    ) : sent || direction === 'outgoing' ? (
                      <Tag tone="neutral">Request sent</Tag>
                    ) : direction === 'incoming' ? (
                      <Tag tone="neutral">Wants to be friends</Tag>
                    ) : (
                      <Button
                        variant="primary"
                        loading={busyId === user.id}
                        onClick={() => sendRequest(user)}
                      >
                        Send request
                      </Button>
                    )}
                  </PersonRow>
                );
              })}
            </div>
          )}
        </Section>
      ) : null}

      {actionError === null ? null : <InlineError>{actionError}</InlineError>}

      {friends.error !== null ? (
        <InlineError>{messageOf(friends.error)}</InlineError>
      ) : null}

      {/* FR-2: one user sends a request, the other accepts. */}
      {incoming.length > 0 ? (
        <Section title="Friend requests">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {incoming.map((request) => (
              <PersonRow
                key={request.id}
                username={request.fromUsername}
                subLine="Wants to be friends"
              >
                <Button
                  variant="primary"
                  loading={busyId === request.id}
                  onClick={() => {
                    void mutate(request.id, () =>
                      api.acceptRequest(request.id),
                    );
                  }}
                >
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  disabled={busyId === request.id}
                  onClick={() => {
                    void mutate(request.id, () =>
                      api.declineRequest(request.id),
                    );
                  }}
                >
                  Decline
                </Button>
              </PersonRow>
            ))}
          </div>
        </Section>
      ) : null}

      {/* FR-4: either side can cancel a pending request. */}
      {outgoing.length > 0 ? (
        <Section title="Sent requests">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {outgoing.map((request) => (
              <PersonRow
                key={request.id}
                username={request.toUsername}
                subLine="Waiting for them to accept"
              >
                <Button
                  variant="secondary"
                  loading={busyId === request.id}
                  onClick={() => {
                    void mutate(request.id, () =>
                      api.cancelRequest(request.id),
                    );
                  }}
                >
                  Cancel
                </Button>
              </PersonRow>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Your friends">
        {list.length === 0 ? (
          friends.loading ? (
            <p className="text-muted" style={{ fontSize: '14px' }}>
              Loading…
            </p>
          ) : (
            <EmptyState
              icon={<Icon.Users size={28} />}
              text="No friends yet — find someone by username or email above."
            />
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {list.map((friend) => (
              <PersonRow
                key={friend.userId}
                username={friend.username}
                subLine={sinceLine(friend.since)}
              >
                <Tag tone="accent-2">Friends</Tag>
                {/* FR-4: removing a friend also removes every share between them. */}
                <Button
                  variant="secondary"
                  loading={busyId === friend.userId}
                  onClick={() => setConfirmRemove(friend)}
                >
                  Remove
                </Button>
              </PersonRow>
            ))}
          </div>
        )}
      </Section>

      {confirmRemove === null ? null : (
        <ConfirmDialog
          title={`Remove ${confirmRemove.username}?`}
          confirmLabel="Remove"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => removeFriend(confirmRemove)}
        >
          <p style={{ margin: 0 }}>
            You will both stop seeing the recipes you shared with each other.
          </p>
        </ConfirmDialog>
      )}
    </main>
  );
}
