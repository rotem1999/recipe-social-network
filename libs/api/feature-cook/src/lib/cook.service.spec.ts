// SPEC §7 COOK-5, COOK-8, COOK-9, COOK-10: the fixed order of checks and the
// mapping of the OpenRouter result. No database, no network.
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RecipeEntity } from '@rsn/api/data-access-db';
import type {
  ChatResult,
  OpenRouterService,
} from '@rsn/api/data-access-openrouter';
import type { AuthUser } from '@rsn/api/feature-auth';
import type { RecipeAccessService } from '@rsn/api/feature-recipes';
import type { Ingredient, Step } from '@rsn/shared/util-domain';

import type { AiQuotaService } from './ai-quota.service';
import { CookPromptBuilder } from './cook-prompt.builder';
import { CookService } from './cook.service';

/**
 * `@nestjs/typeorm` 12.0.2, `@nestjs/jwt` 12.0.2 and `@nestjs/config` 5.x are published as
 * ESM only (`"type": "module"`, no CommonJS build), which Jest 30 cannot `require`. These
 * tests use plain constructor injection, so those packages are replaced at their module
 * boundary by the decorators and module helpers the files under test touch when loaded.
 */
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
  InjectDataSource: () => () => undefined,
  getRepositoryToken: (entity: { name: string }) => `${entity.name}Repository`,
  TypeOrmModule: {
    forRoot: () => ({}),
    forRootAsync: () => ({}),
    forFeature: () => ({}),
  },
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
  JwtModule: { register: () => ({}), registerAsync: () => ({}) },
}));
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
  ConfigModule: { forRoot: () => ({}), forFeature: () => ({}) },
}));


const USER: AuthUser = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'rotem',
} as AuthUser;

const RECIPE_ID = '11111111-1111-4111-8111-111111111111';

const INGREDIENTS: Ingredient[] = [
  { quantity: 200, unit: 'g', name: 'ramen noodles', note: 'fresh' },
];
const STEPS: Step[] = [{ text: 'Boil the broth' }, { text: 'Cook the noodles' }];

function recipeWithVersion(): RecipeEntity {
  return {
    id: RECIPE_ID,
    ownerId: USER.id,
    visibility: 'private',
    deletedAt: null,
    currentVersion: {
      title: 'Tonkotsu ramen',
      servings: 2,
      ingredients: INGREDIENTS,
      steps: STEPS,
    },
  } as RecipeEntity;
}

const CHAT_RESULT: ChatResult = {
  text: '  Stir the noodles so they do not clump.  ',
  model: 'minimax/minimax-m3',
  promptTokens: 210,
  completionTokens: 48,
  totalTokens: 258,
  cost: 0.000123,
  generationId: 'gen-abc',
  latencyMs: 640,
};

interface Harness {
  service: CookService;
  access: { loadOrThrow: jest.Mock; assertCanCook: jest.Mock };
  quota: { consume: jest.Mock; current: jest.Mock };
  openRouter: { chat: jest.Mock };
  calls: string[];
}

function makeHarness(recipe: RecipeEntity = recipeWithVersion()): Harness {
  const calls: string[] = [];

  const access = {
    loadOrThrow: jest.fn(async () => {
      calls.push('loadOrThrow');
      return recipe;
    }),
    assertCanCook: jest.fn(async () => {
      calls.push('assertCanCook');
    }),
  };
  const quota = {
    consume: jest.fn(async () => {
      calls.push('consume');
      return { used: 3, limit: 100, remaining: 97 };
    }),
    current: jest.fn(async () => {
      calls.push('current');
      return { used: 3, limit: 100, remaining: 97 };
    }),
  };
  const openRouter = {
    chat: jest.fn(async () => {
      calls.push('chat');
      return CHAT_RESULT;
    }),
  };

  const service = new CookService(
    access as unknown as RecipeAccessService,
    quota as unknown as AiQuotaService,
    new CookPromptBuilder(),
    openRouter as unknown as OpenRouterService,
  );

  return { service, access, quota, openRouter, calls };
}

describe('CookService.ask (COOK-5, COOK-8, COOK-10)', () => {
  it('COOK-5 refuses a recipe the caller may not cook, before spending quota', async () => {
    const harness = makeHarness();
    harness.access.assertCanCook.mockRejectedValue(
      new ForbiddenException('Save this recipe before cooking it'),
    );

    await expect(
      harness.service.ask(USER, { recipeId: RECIPE_ID, stepIndex: 0 }),
    ).rejects.toThrow(ForbiddenException);
    expect(harness.quota.consume).not.toHaveBeenCalled();
    expect(harness.openRouter.chat).not.toHaveBeenCalled();
  });

  it('COOK-10 rejects a stepIndex past the last step with 400, before spending quota', async () => {
    const harness = makeHarness();

    await expect(
      harness.service.ask(USER, { recipeId: RECIPE_ID, stepIndex: 2 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      harness.service.ask(USER, { recipeId: RECIPE_ID, stepIndex: 2 }),
    ).rejects.toThrow('stepIndex is outside the recipe steps');
    expect(harness.quota.consume).not.toHaveBeenCalled();
    expect(harness.openRouter.chat).not.toHaveBeenCalled();
  });

  it('COOK-10 reports 404 when the recipe has no current version', async () => {
    const recipe = recipeWithVersion();
    recipe.currentVersion = null;
    const harness = makeHarness(recipe);

    await expect(
      harness.service.ask(USER, { recipeId: RECIPE_ID, stepIndex: 0 }),
    ).rejects.toThrow(NotFoundException);
    expect(harness.quota.consume).not.toHaveBeenCalled();
  });

  it('COOK-8 consumes the quota before the OpenRouter call is made', async () => {
    const harness = makeHarness();

    await harness.service.ask(USER, { recipeId: RECIPE_ID, stepIndex: 0 });

    expect(harness.calls).toEqual([
      'loadOrThrow',
      'assertCanCook',
      'consume',
      'chat',
    ]);
  });

  it('COOK-8 lets a 429 from the quota propagate without calling the model', async () => {
    const harness = makeHarness();
    harness.quota.consume.mockRejectedValue(
      new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Daily AI quota reached',
          quota: { used: 100, limit: 100, remaining: 0 },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );

    const error = await harness.service
      .ask(USER, { recipeId: RECIPE_ID, stepIndex: 0 })
      .catch((thrown: unknown) => thrown);

    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(harness.openRouter.chat).not.toHaveBeenCalled();
  });

  it('COOK-10 sends one cook-feature request with max_tokens 1500 and temperature 0.4', async () => {
    const harness = makeHarness();

    await harness.service.ask(USER, {
      recipeId: RECIPE_ID,
      stepIndex: 1,
      question: 'How do I know they are done?',
    });

    const [input] = harness.openRouter.chat.mock.calls[0];
    expect(input.feature).toBe('cook');
    expect(input.userId).toBe(USER.id);
    expect(input.maxTokens).toBe(1500);
    expect(input.temperature).toBe(0.4);
  });

  it('COOK-10 switches reasoning off with reasoning { effort: "none" }', async () => {
    const harness = makeHarness();

    await harness.service.ask(USER, { recipeId: RECIPE_ID, stepIndex: 0 });

    const [input] = harness.openRouter.chat.mock.calls[0];
    expect(input.reasoning).toEqual({ effort: 'none' });
    expect(input.responseFormatJson).toBeUndefined();
  });

  it('COOK-9 sends exactly the two built messages, carrying the current step', async () => {
    const harness = makeHarness();

    await harness.service.ask(USER, {
      recipeId: RECIPE_ID,
      stepIndex: 1,
      question: 'How do I know they are done?',
    });

    const [input] = harness.openRouter.chat.mock.calls[0];
    expect(input.messages).toHaveLength(2);
    expect(input.messages[0].role).toBe('system');
    expect(input.messages[1].content).toContain('Tonkotsu ramen');
    expect(input.messages[1].content).toContain('200 g ramen noodles (fresh)');
    expect(input.messages[1].content).toContain('>> 2. Cook the noodles');
    expect(input.messages[1].content).toContain(
      'Question: How do I know they are done?',
    );
  });

  it('COOK-10 returns the trimmed answer, the quota, the tokens and the cost', async () => {
    const harness = makeHarness();

    await expect(
      harness.service.ask(USER, { recipeId: RECIPE_ID, stepIndex: 0 }),
    ).resolves.toEqual({
      answer: 'Stir the noodles so they do not clump.',
      quota: { used: 3, limit: 100, remaining: 97 },
      model: 'minimax/minimax-m3',
      promptTokens: 210,
      completionTokens: 48,
      cost: 0.000123,
    });
  });

  it.each([
    { label: 'empty', text: '' },
    { label: 'whitespace-only', text: ' \n\t  ' },
  ])(
    'COOK-10 answers 503 "The assistant didn\'t answer. Ask again." for an $label answer',
    async ({ text }) => {
      const harness = makeHarness();
      harness.openRouter.chat.mockResolvedValue({ ...CHAT_RESULT, text });

      const error = await harness.service
        .ask(USER, { recipeId: RECIPE_ID, stepIndex: 0 })
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      expect((error as ServiceUnavailableException).message).toBe(
        "The assistant didn't answer. Ask again.",
      );
    },
  );

  it('COOK-8 an empty answer still spends the one quota unit counted before the call', async () => {
    const harness = makeHarness();
    harness.openRouter.chat.mockResolvedValue({ ...CHAT_RESULT, text: '' });

    await expect(
      harness.service.ask(USER, { recipeId: RECIPE_ID, stepIndex: 0 }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(harness.quota.consume).toHaveBeenCalledTimes(1);
    expect(harness.openRouter.chat).toHaveBeenCalledTimes(1);
  });

  it('§11.6 an OpenRouter failure reaches the client as the neutral 503', async () => {
    const harness = makeHarness();
    harness.openRouter.chat.mockRejectedValue(
      new ServiceUnavailableException('The assistant is unavailable right now'),
    );

    const error = await harness.service
      .ask(USER, { recipeId: RECIPE_ID, stepIndex: 0 })
      .catch((thrown: unknown) => thrown);

    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect((error as ServiceUnavailableException).message).toBe(
      'The assistant is unavailable right now',
    );
  });
});

describe('CookService.quotaFor (COOK-10)', () => {
  it('COOK-10 returns today (UTC) used, limit and remaining', async () => {
    const harness = makeHarness();

    await expect(harness.service.quotaFor(USER)).resolves.toEqual({
      used: 3,
      limit: 100,
      remaining: 97,
    });
    expect(harness.quota.current).toHaveBeenCalledWith(USER.id);
  });
});
