// SPEC.md §3 and §6 end to end: a private recipe (REC-1) that no one else may read,
// publishing it (REC-3), saving the copy (SAVE-1, SAVE-2), rating it (RATE-1, RATE-2),
// commenting and voting (COM-1, COM-2) and the version history of an edit (REC-7).
import type {
  CommentDto,
  CommentsResponse,
  RatingSummaryDto,
  RecipeDetailDto,
  RecipeListResponse,
  RecipeVersionsResponse,
} from '@rsn/shared/util-contracts';
import {
  allowErrors,
  recipeBody,
  signUp,
  uniqueUsername,
  type TestUser,
} from '../support/api-helpers';

describe('recipes end to end', () => {
  // `owner` writes and publishes; `reader` is the second account that saves and rates.
  let owner: TestUser;
  let reader: TestUser;
  let recipe: RecipeDetailDto;
  let savedCopy: RecipeDetailDto;
  let comment: CommentDto;

  beforeAll(async () => {
    owner = await signUp(uniqueUsername('owner'));
    reader = await signUp(uniqueUsername('reader'));
  }, 30_000);

  it('REC-1 creates a private recipe with version 1 from the §3.1.1 fields', async () => {
    const body = recipeBody();

    const response = await owner.client.post<RecipeDetailDto>('/recipes', body);
    recipe = response.data;

    expect(recipe.title).toBe(body.title);
    expect(recipe.category).toBe(body.category);
    expect(recipe.servings).toBe(body.servings);
    expect(recipe.prepMinutes).toBe(body.prepMinutes);
    expect(recipe.cookMinutes).toBe(body.cookMinutes);
    expect(recipe.ingredients).toEqual(body.ingredients);
    expect(recipe.steps).toEqual(body.steps);
    expect(recipe.visibility).toBe('private');
    expect(recipe.versionNumber).toBe(1);
    expect(recipe.versionCount).toBe(1);
    expect(recipe.relation).toBe('own');
    expect(recipe.ownerUsername).toBe(owner.username);
    expect(recipe.canEdit).toBe(true);
    // SAVE-2 / COOK-5: the owner may cook their own recipe.
    expect(recipe.canCook).toBe(true);
  });

  it('SAVE-3 lists the new recipe on the owner\'s GET /recipes as `own`', async () => {
    const response =
      await owner.client.get<RecipeListResponse>('/recipes');

    const card = response.data.recipes.find((one) => one.id === recipe.id);
    expect(card).toBeDefined();
    expect(card?.relation).toBe('own');
  });

  it('REC-1 hides the private recipe from another user with 403', async () => {
    const response = await reader.client.get(
      `/recipes/${recipe.id}`,
      allowErrors,
    );

    expect(response.status).toBe(403);
  });

  it('REC-1 keeps the private recipe out of the other user\'s GET /recipes', async () => {
    const response =
      await reader.client.get<RecipeListResponse>('/recipes');

    expect(
      response.data.recipes.some((one) => one.id === recipe.id),
    ).toBe(false);
  });

  it('REC-3 publishes the recipe when the owner patches its visibility', async () => {
    const response = await owner.client.patch<RecipeDetailDto>(
      `/recipes/${recipe.id}/visibility`,
      { visibility: 'public' },
    );
    recipe = response.data;

    expect(recipe.visibility).toBe('public');
  });

  it('REC-4 lets the other user read the published recipe without saving it', async () => {
    const response = await reader.client.get<RecipeDetailDto>(
      `/recipes/${recipe.id}`,
    );

    expect(response.data.id).toBe(recipe.id);
    expect(response.data.relation).toBe('public');
    expect(response.data.canEdit).toBe(false);
    // SAVE-2: a public recipe seen in Discover must be saved before cook mode opens.
    expect(response.data.canCook).toBe(false);
  });

  it('REC-6 refuses an edit by anyone but the owner with 403', async () => {
    const response = await reader.client.put(
      `/recipes/${recipe.id}`,
      recipeBody({ title: 'Not my recipe' }),
      allowErrors,
    );

    expect(response.status).toBe(403);
  });

  it('SAVE-1 copies the public recipe to the saving user, SAVE-2 makes it cookable', async () => {
    const response = await reader.client.post<RecipeDetailDto>(
      `/recipes/${recipe.id}/save`,
    );
    savedCopy = response.data;

    // SAVE-4: a copy, not a link — its own id, owned by the saver, private again.
    expect(savedCopy.id).not.toBe(recipe.id);
    expect(savedCopy.relation).toBe('saved');
    expect(savedCopy.visibility).toBe('private');
    expect(savedCopy.ownerUsername).toBe(reader.username);
    expect(savedCopy.title).toBe(recipe.title);
    expect(savedCopy.ingredients).toEqual(recipe.ingredients);
    expect(savedCopy.steps).toEqual(recipe.steps);
    expect(savedCopy.savedFrom?.recipeId).toBe(recipe.id);
    expect(savedCopy.canCook).toBe(true);
  });

  it('SAVE-3 lists the saved copy on the saving user\'s GET /recipes', async () => {
    const response =
      await reader.client.get<RecipeListResponse>('/recipes');

    const card = response.data.recipes.find((one) => one.id === savedCopy.id);
    expect(card).toBeDefined();
    expect(card?.relation).toBe('saved');
  });

  it('RATE-1 records a 4-star grade and RATE-2 stores the average with two decimals', async () => {
    const response = await reader.client.put<RatingSummaryDto>(
      `/recipes/${recipe.id}/rating`,
      { stars: 4 },
    );

    expect(response.data.mine).toBe(4);
    expect(response.data.count).toBe(1);
    expect(response.data.average).toBe(4);
    expect(response.data.average?.toFixed(2)).toBe('4.00');
  });

  it('RATE-4 shows the owner the same average with no grade of their own', async () => {
    const response = await owner.client.get<RatingSummaryDto>(
      `/recipes/${recipe.id}/rating`,
    );

    expect(response.data.average).toBe(4);
    expect(response.data.count).toBe(1);
    expect(response.data.mine).toBeNull();
  });

  it('RATE-1 rejects a grade outside 1–5 with 400', async () => {
    const response = await reader.client.put(
      `/recipes/${recipe.id}/rating`,
      { stars: 6 },
      allowErrors,
    );

    expect(response.status).toBe(400);
  });

  it('COM-1 accepts a comment on the public recipe', async () => {
    const response = await reader.client.post<CommentDto>(
      `/recipes/${recipe.id}/comments`,
      { body: 'Cooked this twice already.' },
    );
    comment = response.data;

    expect(comment.recipeId).toBe(recipe.id);
    expect(comment.body).toBe('Cooked this twice already.');
    expect(comment.authorUsername).toBe(reader.username);
    expect(comment.points).toBe(0);
    expect(comment.myVote).toBe(0);
  });

  it('COM-2 counts an up-vote as one integer point', async () => {
    const response = await reader.client.put<CommentDto>(
      `/comments/${comment.id}/vote`,
      { value: 1 },
    );

    expect(response.data.id).toBe(comment.id);
    expect(response.data.points).toBe(1);
    expect(response.data.myVote).toBe(1);
  });

  it('COM-2 enables votes on the public recipe and lists the comment', async () => {
    const response = await owner.client.get<CommentsResponse>(
      `/recipes/${recipe.id}/comments`,
    );

    expect(response.data.votesEnabled).toBe(true);
    const listed = response.data.comments.find((one) => one.id === comment.id);
    expect(listed?.points).toBe(1);
    // The owner did not vote, so their own vote is 0 (COM-3).
    expect(listed?.myVote).toBe(0);
  });

  it('COM-1 refuses a comment on a private recipe with 403', async () => {
    const response = await reader.client.get(
      `/recipes/${savedCopy.id}/comments`,
      allowErrors,
    );

    expect(response.status).toBe(403);
  });

  it('REC-7 turns an owner edit into version 2', async () => {
    const response = await owner.client.put<RecipeDetailDto>(
      `/recipes/${recipe.id}`,
      recipeBody({ title: 'Spaghetti with tomato, basil and garlic' }),
    );

    expect(response.data.versionNumber).toBe(2);
    expect(response.data.versionCount).toBe(2);
    expect(response.data.title).toBe(
      'Spaghetti with tomato, basil and garlic',
    );
  });

  it('REC-7 lists both versions, the newest marked current', async () => {
    const response = await owner.client.get<RecipeVersionsResponse>(
      `/recipes/${recipe.id}/versions`,
    );

    expect(response.data.versions).toHaveLength(2);
    expect(response.data.versions.map((one) => one.versionNumber)).toEqual([
      1, 2,
    ]);
    expect(response.data.versions[0].isCurrent).toBe(false);
    expect(response.data.versions[1].isCurrent).toBe(true);
  });

  it('REC-7 shows every version of a public recipe to another user', async () => {
    const versions = await reader.client.get<RecipeVersionsResponse>(
      `/recipes/${recipe.id}/versions`,
    );
    const first = await reader.client.get<RecipeDetailDto>(
      `/recipes/${recipe.id}/versions/1`,
    );

    expect(versions.data.versions).toHaveLength(2);
    expect(first.data.versionNumber).toBe(1);
    expect(first.data.title).toBe(recipeBody().title);
  });
});
