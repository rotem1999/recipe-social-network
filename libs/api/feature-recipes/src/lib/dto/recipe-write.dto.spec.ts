// SPEC §3.1.1 "Upper limits": the create and update body (`POST /recipes`, `PUT /recipes/:id`)
// answers 400 outside the limits. The DTO is run through the same global ValidationPipe
// options apps/api/src/main.ts uses.
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import {
  INGREDIENT_NAME_MAX_LENGTH,
  INGREDIENT_NOTE_MAX_LENGTH,
  MAX_INGREDIENTS,
  MAX_INGREDIENT_QUANTITY,
  MAX_PREP_COOK_MINUTES,
  MAX_SERVINGS,
  MAX_STEPS,
  MAX_STEP_DURATION_MINUTES,
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
  STEP_TEXT_MAX_LENGTH,
} from '@rsn/shared/util-domain';
import { RecipeWriteDto } from './recipe-write.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const metadata: ArgumentMetadata = {
  type: 'body',
  metatype: RecipeWriteDto,
  data: '',
};

function validate(body: unknown): Promise<RecipeWriteDto> {
  return pipe.transform(body, metadata) as Promise<RecipeWriteDto>;
}

/** Narrows the rejection of a call that must fail, so its status can be asserted. */
async function failureOf(
  promise: Promise<unknown>,
): Promise<BadRequestException> {
  try {
    await promise;
  } catch (error) {
    return error as BadRequestException;
  }
  throw new Error('the call was expected to reject');
}

async function expect400(body: unknown): Promise<void> {
  const error = await failureOf(validate(body));
  expect(error).toBeInstanceOf(BadRequestException);
  expect(error.getStatus()).toBe(400);
}

interface IngredientBody {
  quantity?: number | null;
  unit: string;
  name: string;
  note?: string;
}

interface StepBody {
  text: string;
  durationMinutes?: number;
}

function ingredient(overrides: Partial<IngredientBody> = {}): IngredientBody {
  return { quantity: 4, unit: 'piece', name: 'egg', ...overrides };
}

function step(overrides: Partial<StepBody> = {}): StepBody {
  return { text: 'Crack the eggs into the sauce.', ...overrides };
}

/** §3.1.1: a body inside every limit. */
function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Shakshuka',
    category: 'Breakfast',
    servings: 2,
    ingredients: [ingredient()],
    steps: [step()],
    ...overrides,
  };
}

describe('RecipeWriteDto', () => {
  it('§3.1.1 accepts a body inside every limit', async () => {
    await expect(validate(body())).resolves.toBeInstanceOf(RecipeWriteDto);
  });

  it('§3.1.1 accepts every value exactly at its upper limit', async () => {
    await expect(
      validate(
        body({
          title: 't'.repeat(RECIPE_TITLE_MAX_LENGTH),
          description: 'd'.repeat(RECIPE_DESCRIPTION_MAX_LENGTH),
          servings: MAX_SERVINGS,
          prepMinutes: MAX_PREP_COOK_MINUTES,
          cookMinutes: MAX_PREP_COOK_MINUTES,
          ingredients: Array.from({ length: MAX_INGREDIENTS }, () =>
            ingredient({
              quantity: MAX_INGREDIENT_QUANTITY,
              name: 'n'.repeat(INGREDIENT_NAME_MAX_LENGTH),
              note: 'o'.repeat(INGREDIENT_NOTE_MAX_LENGTH),
            }),
          ),
          steps: Array.from({ length: MAX_STEPS }, () =>
            step({
              text: 's'.repeat(STEP_TEXT_MAX_LENGTH),
              durationMinutes: MAX_STEP_DURATION_MINUTES,
            }),
          ),
        }),
      ),
    ).resolves.toBeInstanceOf(RecipeWriteDto);
  });

  it('§3.1.1 accepts the lower bounds: servings 1, prep and cook 0, step duration 1', async () => {
    await expect(
      validate(
        body({
          servings: 1,
          prepMinutes: 0,
          cookMinutes: 0,
          steps: [step({ durationMinutes: 1 })],
        }),
      ),
    ).resolves.toBeInstanceOf(RecipeWriteDto);
  });

  describe('title and description', () => {
    it('§3.1.1 answers 400 for a title over 200 characters', async () => {
      await expect400(body({ title: 't'.repeat(RECIPE_TITLE_MAX_LENGTH + 1) }));
    });

    it('§3.1.1 answers 400 for a description over 500 characters', async () => {
      await expect400(
        body({ description: 'd'.repeat(RECIPE_DESCRIPTION_MAX_LENGTH + 1) }),
      );
    });
  });

  describe('servings and times', () => {
    it('§3.1.1 answers 400 for 7 servings', async () => {
      await expect400(body({ servings: MAX_SERVINGS + 1 }));
    });

    it('§3.1.1 answers 400 for 0 servings', async () => {
      await expect400(body({ servings: 0 }));
    });

    it('§3.1.1 answers 400 for prepMinutes over 1440', async () => {
      await expect400(body({ prepMinutes: MAX_PREP_COOK_MINUTES + 1 }));
    });

    it('§3.1.1 answers 400 for cookMinutes over 1440', async () => {
      await expect400(body({ cookMinutes: MAX_PREP_COOK_MINUTES + 1 }));
    });

    it('§3.1.1 answers 400 for negative prepMinutes', async () => {
      await expect400(body({ prepMinutes: -1 }));
    });
  });

  describe('ingredients', () => {
    it('§3.1.1 answers 400 for 51 ingredients', async () => {
      await expect400(
        body({
          ingredients: Array.from({ length: MAX_INGREDIENTS + 1 }, () =>
            ingredient(),
          ),
        }),
      );
    });

    it('§3.1.1 answers 400 for a quantity of 0', async () => {
      await expect400(body({ ingredients: [ingredient({ quantity: 0 })] }));
    });

    it('§3.1.1 answers 400 for a negative quantity', async () => {
      await expect400(body({ ingredients: [ingredient({ quantity: -1 })] }));
    });

    it('§3.1.1 answers 400 for a quantity over 10000', async () => {
      await expect400(
        body({
          ingredients: [ingredient({ quantity: MAX_INGREDIENT_QUANTITY + 1 })],
        }),
      );
    });

    it('§3.1.1 accepts a small fractional quantity above 0', async () => {
      await expect(
        validate(body({ ingredients: [ingredient({ quantity: 0.25 })] })),
      ).resolves.toBeInstanceOf(RecipeWriteDto);
    });

    it('§3.1.1 accepts an empty (null) quantity, the "to taste" case', async () => {
      const dto = await validate(
        body({ ingredients: [ingredient({ quantity: null, unit: 'none' })] }),
      );

      expect(dto.ingredients[0].quantity).toBeNull();
    });

    it('§3.1.1 answers 400 for an ingredient name over 120 characters', async () => {
      await expect400(
        body({
          ingredients: [
            ingredient({ name: 'n'.repeat(INGREDIENT_NAME_MAX_LENGTH + 1) }),
          ],
        }),
      );
    });

    it('§3.1.1 answers 400 for an empty ingredient name', async () => {
      await expect400(body({ ingredients: [ingredient({ name: '' })] }));
    });

    it('§3.1.1 answers 400 for an ingredient note over 120 characters', async () => {
      await expect400(
        body({
          ingredients: [
            ingredient({ note: 'o'.repeat(INGREDIENT_NOTE_MAX_LENGTH + 1) }),
          ],
        }),
      );
    });
  });

  describe('steps', () => {
    it('§3.1.1 answers 400 for 61 steps', async () => {
      await expect400(
        body({ steps: Array.from({ length: MAX_STEPS + 1 }, () => step()) }),
      );
    });

    it('§3.1.1 answers 400 for step text over 1000 characters', async () => {
      await expect400(
        body({ steps: [step({ text: 's'.repeat(STEP_TEXT_MAX_LENGTH + 1) })] }),
      );
    });

    it('§3.1.1 answers 400 for an empty step text', async () => {
      await expect400(body({ steps: [step({ text: '' })] }));
    });

    it('§3.1.1 answers 400 for a step duration over 1440 minutes', async () => {
      await expect400(
        body({
          steps: [step({ durationMinutes: MAX_STEP_DURATION_MINUTES + 1 })],
        }),
      );
    });

    it('§3.1.1 answers 400 for a step duration of 0', async () => {
      await expect400(body({ steps: [step({ durationMinutes: 0 })] }));
    });

    it('§3.1.1, UI-15 accepts a 150-minute step, above the 120-minute cook timer', async () => {
      await expect(
        validate(body({ steps: [step({ durationMinutes: 150 })] })),
      ).resolves.toBeInstanceOf(RecipeWriteDto);
    });
  });
});
