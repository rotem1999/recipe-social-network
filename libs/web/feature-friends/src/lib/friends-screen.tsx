// SPEC.md §4 (FR-1..FR-4), §11.5 UI-26, UI-34, UI-38 and the design guide §4:
// one screen that finds people, answers the requests they sent, and lists the
// friends recipes can be shared with without publishing them.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
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

/** Whatever the API said went wrong, as one line for {@link InlineError}. */
function messageOf(cause: unknown): string {
  if (cause instanceof ApiError || cause instanceof Error) {
    return cause.message;
  }
  return 'Something went wrong. Please try again.';
}

/** FR-4 / UI-34: where the caller stands with one search row. */
type SearchRelation =
  | { kind: 'self' | 'friend' | 'none' }
  | { kind: 'incoming' | 'outgoing'; requestId: string };

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
    <div className="person-row">
      <span className="person-avatar" aria-hidden={true}>
        {initialOf(username)}
      </span>
      <div className="grow shrink">
        <div className="person-name">{username}</div>
        {subLine === undefined || subLine === null ? null : (
          <div className="text-muted text-small">
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
    <section className="mt-8">
      <h4 className="mb-2">{title}</h4>
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
  const { data, setData, reload } = friends;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResultDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // UI-34: bumped after every friends mutation so the search runs again.
  const [searchRound, setSearchRound] = useState(0);
  // The query of the last search that ran; a re-run of the same query skips the debounce.
  const lastSearched = useRef<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<FriendDto | null>(null);

  // FR-3/FR-4: debounced `GET /users/search?q=`; under two characters there is
  // nothing to match, so no request is made.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      lastSearched.current = null;
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    const delay = lastSearched.current === trimmed ? 0 : SEARCH_DEBOUNCE_MS;
    const timer = setTimeout(() => {
      lastSearched.current = trimmed;
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
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, query, searchRound]);

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
        // UI-34: the search rows are re-read after every mutation.
        setSearchRound((round) => round + 1);
      }
    },
    [setData],
  );

  const sendRequest = (user: UserSearchResultDto): void => {
    void mutate(user.id, () => api.sendFriendRequest(user.id));
  };

  const acceptRequest = (requestId: string): void => {
    void mutate(requestId, () => api.acceptRequest(requestId));
  };

  const declineRequest = (requestId: string): void => {
    void mutate(requestId, () => api.declineRequest(requestId));
  };

  const removeFriend = (friend: FriendDto): void => {
    setConfirmRemove(null);
    void mutate(friend.userId, () => api.removeFriend(friend.userId));
  };

  const incoming: FriendRequestDto[] = data?.incoming ?? [];
  const outgoing: FriendRequestDto[] = data?.outgoing ?? [];
  const list: FriendDto[] = data?.friends ?? [];

  /**
   * FR-4 / UI-34: where the caller stands with a search row. The latest
   * FriendsResponse (every mutation returns one) wins over the search's own flags,
   * so a row is right at once and the re-run search only confirms it.
   */
  const relationOf = (user: UserSearchResultDto): SearchRelation => {
    if (user.isSelf) {
      return { kind: 'self' };
    }
    if (data === null) {
      if (user.isFriend) {
        return { kind: 'friend' };
      }
      return user.pendingRequestId === null
        ? { kind: 'none' }
        : { kind: 'outgoing', requestId: user.pendingRequestId };
    }
    if (list.some((friend) => friend.userId === user.id)) {
      return { kind: 'friend' };
    }
    const received = incoming.find((request) => request.fromUserId === user.id);
    if (received !== undefined) {
      return { kind: 'incoming', requestId: received.id };
    }
    const sent = outgoing.find((request) => request.toUserId === user.id);
    if (sent !== undefined) {
      return { kind: 'outgoing', requestId: sent.id };
    }
    return { kind: 'none' };
  };

  const searched = query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <main className="screen screen-narrow">
      <h1 className="page-title">Friends</h1>
      <p className="text-muted text-body">
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
        className="mt-4"
      />

      {searchError === null ? null : <InlineError>{searchError}</InlineError>}

      {searched ? (
        <Section title="Search results">
          {searching && results.length === 0 ? (
            <p className="text-muted text-body">
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="text-muted text-body">
              No one found.
            </p>
          ) : (
            <div className="stack">
              {results.map((user) => {
                const relation = relationOf(user);
                return (
                  <PersonRow
                    key={user.id}
                    username={user.username}
                    subLine={
                      relation.kind === 'incoming'
                        ? 'Wants to be friends'
                        : null
                    }
                  >
                    {relation.kind === 'self' ? (
                      <Tag tone="neutral">You</Tag>
                    ) : relation.kind === 'friend' ? (
                      <Tag tone="accent-2">Friends</Tag>
                    ) : relation.kind === 'outgoing' ? (
                      <Tag tone="neutral">Request sent</Tag>
                    ) : relation.kind === 'incoming' ? (
                      // UI-34: an incoming request is answered from its search row too.
                      <>
                        <Button
                          variant="primary"
                          loading={busyId === relation.requestId}
                          onClick={() => acceptRequest(relation.requestId)}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={busyId === relation.requestId}
                          onClick={() => declineRequest(relation.requestId)}
                        >
                          Decline
                        </Button>
                      </>
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

      {/* FR-2: one user sends a request, the other accepts. */}
      {incoming.length > 0 ? (
        <Section title="Friend requests">
          <div className="stack">
            {incoming.map((request) => (
              <PersonRow
                key={request.id}
                username={request.fromUsername}
                subLine="Wants to be friends"
              >
                <Button
                  variant="primary"
                  loading={busyId === request.id}
                  onClick={() => acceptRequest(request.id)}
                >
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  disabled={busyId === request.id}
                  onClick={() => declineRequest(request.id)}
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
          <div className="stack">
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
        {/* UI-26: the empty state only after GET /friends succeeded. */}
        {friends.loading && data === null ? (
          <p className="text-muted text-body">
            Loading…
          </p>
        ) : friends.error !== null ? (
          <div>
            <InlineError>{messageOf(friends.error)}</InlineError>
            <Button variant="ghost" onClick={reload} className="mt-2">
              Try again
            </Button>
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Icon.Users size={28} />}
            text="No friends yet — find someone by username or email above."
          />
        ) : (
          <div className="stack">
            {list.map((friend) => (
              <PersonRow
                key={friend.userId}
                username={friend.username}
                subLine={sinceLine(friend.since)}
              >
                {/* UI-38: no "Friends" tag under "Your friends". */}
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
          <p className="m-0">
            You will both stop seeing the recipes you shared with each other.
          </p>
        </ConfirmDialog>
      )}
    </main>
  );
}
