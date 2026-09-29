// SPEC.md §4 end to end: finding a user (FR-3), the mutual request (FR-2), sharing a
// private recipe with the new friend (REC-2, REC-8) and the removal that takes every
// share with it (FR-4).
import type {
  FriendsResponse,
  RecipeDetailDto,
  RecipeListResponse,
  UserSearchResponse,
} from '@rsn/shared/util-contracts';
import {
  allowErrors,
  recipeBody,
  signUp,
  uniqueUsername,
  type TestUser,
} from '../support/api-helpers';

describe('friends end to end', () => {
  // `sender` asks, `receiver` accepts; the recipe is shared from sender to receiver.
  let sender: TestUser;
  let receiver: TestUser;
  let requestId: string;
  let shared: RecipeDetailDto;

  beforeAll(async () => {
    sender = await signUp(uniqueUsername('sender'));
    receiver = await signUp(uniqueUsername('receiver'));
  }, 30_000);

  it('FR-3 finds the other user by username and marks them as not yet a friend', async () => {
    const response = await sender.client.get<UserSearchResponse>(
      `/users/search?q=${encodeURIComponent(receiver.username)}`,
    );

    const found = response.data.users.find((one) => one.id === receiver.id);
    expect(found).toBeDefined();
    expect(found?.username).toBe(receiver.username);
    expect(found?.isSelf).toBe(false);
    expect(found?.isFriend).toBe(false);
    expect(found?.pendingRequestId).toBeNull();
    // FR-4: at most 10 results.
    expect(response.data.users.length).toBeLessThanOrEqual(10);
  });

  it('FR-2 sends a request that is pending on both sides', async () => {
    const response = await sender.client.post<FriendsResponse>(
      '/friends/requests',
      { userId: receiver.id },
    );

    expect(response.data.friends).toEqual([]);
    expect(response.data.outgoing).toHaveLength(1);
    expect(response.data.outgoing[0].toUserId).toBe(receiver.id);
    expect(response.data.outgoing[0].fromUserId).toBe(sender.id);

    const incoming = await receiver.client.get<FriendsResponse>('/friends');
    const waiting = incoming.data.incoming.find(
      (one) => one.fromUserId === sender.id,
    );
    expect(waiting).toBeDefined();
    expect(waiting?.fromUsername).toBe(sender.username);
    requestId = waiting?.id ?? '';
  });

  it('FR-2 refuses to accept a request addressed to somebody else with 403', async () => {
    const response = await sender.client.post(
      `/friends/requests/${requestId}/accept`,
      undefined,
      allowErrors,
    );

    expect(response.status).toBe(403);
  });

  it('FR-2 makes the friendship mutual once the receiver accepts', async () => {
    const response = await receiver.client.post<FriendsResponse>(
      `/friends/requests/${requestId}/accept`,
    );

    expect(response.data.incoming).toEqual([]);
    expect(
      response.data.friends.map((friend) => friend.userId),
    ).toContain(sender.id);

    const senderSide = await sender.client.get<FriendsResponse>('/friends');
    expect(senderSide.data.outgoing).toEqual([]);
    expect(
      senderSide.data.friends.map((friend) => friend.userId),
    ).toContain(receiver.id);
  });

  it('REC-2 shares a private recipe with the friend without publishing it', async () => {
    const created = await sender.client.post<RecipeDetailDto>(
      '/recipes',
      recipeBody({ title: 'Family shakshuka', category: 'Breakfast' }),
    );

    const response = await sender.client.patch<RecipeDetailDto>(
      `/recipes/${created.data.id}/visibility`,
      { visibility: 'shared', sharedWithUserIds: [receiver.id] },
    );
    shared = response.data;

    expect(shared.visibility).toBe('shared');
    expect(shared.sharedWithUserIds).toEqual([receiver.id]);
  });

  it('REC-8 lets the friend read the shared recipe, and COOK-5 lets them cook it', async () => {
    const response = await receiver.client.get<RecipeDetailDto>(
      `/recipes/${shared.id}`,
    );

    expect(response.data.id).toBe(shared.id);
    expect(response.data.relation).toBe('shared');
    expect(response.data.canCook).toBe(true);
    // REC-8: view-only, it stays the sharer's recipe.
    expect(response.data.canEdit).toBe(false);
    expect(response.data.ownerUsername).toBe(sender.username);
  });

  it('REC-8 lists the shared recipe on the friend\'s GET /recipes', async () => {
    const response =
      await receiver.client.get<RecipeListResponse>('/recipes');

    const card = response.data.recipes.find((one) => one.id === shared.id);
    expect(card).toBeDefined();
    expect(card?.relation).toBe('shared');
  });

  it('REC-2 refuses to share with a user who is not a friend with 400', async () => {
    const stranger = await signUp(uniqueUsername('stranger'));

    const response = await sender.client.patch(
      `/recipes/${shared.id}/visibility`,
      { visibility: 'shared', sharedWithUserIds: [stranger.id] },
      allowErrors,
    );

    expect(response.status).toBe(400);
  });

  it('FR-4 removes the friend and every share between the two users', async () => {
    const response = await sender.client.delete<FriendsResponse>(
      `/friends/${receiver.id}`,
    );

    expect(response.data.friends).toEqual([]);

    const otherSide = await receiver.client.get<FriendsResponse>('/friends');
    expect(otherSide.data.friends).toEqual([]);

    const blocked = await receiver.client.get(
      `/recipes/${shared.id}`,
      allowErrors,
    );
    expect(blocked.status).toBe(403);
  });
});
