// SPEC §11.5 UI-43: the global ValidationPipe of apps/api/src/main.ts sends the
// DTO messages as they are, nested ones included, without the property path
// Nest would put in front ("Name this ingredient", not
// "ingredients.0.Name this ingredient"). `validationMessages` is not exported,
// so the bootstrap runs against a fake Nest application and the pipe it
// registers is exercised directly. No server listens, no database is opened.
import 'reflect-metadata';
import {
  BadRequestException,
  Logger,
  ValidationPipe,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
// jest.mock calls below are hoisted above these imports, so the real DTOs load
// without the ESM-only packages.
import { RecipeWriteDto } from '@rsn/api/feature-recipes';
import { CommentRequestDto } from '@rsn/api/feature-social';

/**
 * `@nestjs/typeorm` 12.0.2, `@nestjs/jwt` 12.0.2 and `@nestjs/config` 5.x are published as
 * ESM only (`"type": "module"`, no CommonJS build), which Jest 30 cannot `require`. The
 * feature DTOs imported below load those packages through their library entry points, so
 * the packages are replaced at their module boundary by the helpers touched when loaded.
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

/** The fake application the bootstrap receives instead of a real Nest app. */
const fakeApp = {
  setGlobalPrefix: jest.fn(),
  useGlobalPipes: jest.fn(),
  enableCors: jest.fn(),
  listen: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@nestjs/core', () => ({
  NestFactory: { create: jest.fn(async () => fakeApp) },
}));
jest.mock('./app/app.module', () => ({ AppModule: class AppModule {} }));

/** A two-level DTO: a list of groups, each with a list of named items. */
class ItemBody {
  @IsString({ message: 'Name this item' })
  @IsNotEmpty({ message: 'Name this item' })
  name!: string;

  @IsInt({ message: 'Count in whole numbers' })
  @Min(1, { message: 'Count at least 1' })
  count!: number;
}

class GroupBody {
  @IsString({ message: 'Name this group' })
  label!: string;

  @IsArray({ message: 'List the items' })
  @ValidateNested({ each: true })
  @Type(() => ItemBody)
  items!: ItemBody[];
}

class OuterBody {
  @IsString({ message: 'Give it a title' })
  title!: string;

  @IsArray({ message: 'List the groups' })
  @ValidateNested({ each: true })
  @Type(() => GroupBody)
  groups!: GroupBody[];
}

function bodyOf(metatype: ArgumentMetadata['metatype']): ArgumentMetadata {
  return { type: 'body', metatype, data: '' };
}

/** The message list of a pipe call that must fail with 400. */
async function messagesOf(
  pipe: PipeTransform,
  value: unknown,
  metatype: ArgumentMetadata['metatype'],
): Promise<string[]> {
  try {
    await pipe.transform(value, bodyOf(metatype));
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const exception = error as BadRequestException;
    expect(exception.getStatus()).toBe(400);
    return (exception.getResponse() as { message: string[] }).message;
  }
  throw new Error('the call was expected to reject');
}

describe('main.ts bootstrap: the global ValidationPipe (UI-43)', () => {
  let pipe: ValidationPipe;

  beforeAll(async () => {
    jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    await import('./main');
    // bootstrap() is started with `void`; let its awaits settle.
    for (let tick = 0; tick < 10 && fakeApp.listen.mock.calls.length === 0; tick++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const registered = fakeApp.useGlobalPipes.mock.calls.flat();
    expect(registered).toHaveLength(1);
    pipe = registered[0] as ValidationPipe;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('§11.6 registers one ValidationPipe before the app listens', () => {
    expect(pipe).toBeInstanceOf(ValidationPipe);
    expect(fakeApp.listen).toHaveBeenCalledTimes(1);
    expect(fakeApp.useGlobalPipes.mock.invocationCallOrder[0]).toBeLessThan(
      fakeApp.listen.mock.invocationCallOrder[0],
    );
  });

  it('UI-43 sends a top-level message as it is', async () => {
    const messages = await messagesOf(pipe, { groups: [] }, OuterBody);

    expect(messages).toEqual(['Give it a title']);
  });

  it('UI-43 sends a nested message without the property path', async () => {
    const messages = await messagesOf(
      pipe,
      { title: 'Box', groups: [{ label: 'Tools', items: [{ name: '', count: 2 }] }] },
      OuterBody,
    );

    expect(messages).toEqual(['Name this item']);
  });

  it('UI-43 flattens messages from every level, parents before children', async () => {
    const messages = await messagesOf(
      pipe,
      {
        groups: [
          { items: [{ name: 'hammer', count: 0 }] },
          { label: 'Paint', items: [{ name: '', count: 1 }] },
        ],
      },
      OuterBody,
    );

    expect(messages).toEqual([
      'Give it a title',
      'Name this group',
      'Count at least 1',
      'Name this item',
    ]);
  });

  it('UI-43 never puts a property path or index in front of a message', async () => {
    const messages = await messagesOf(
      pipe,
      { groups: [{ label: 3, items: [{ count: 'x' }] }] },
      OuterBody,
    );

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).not.toMatch(/^(title|groups|items|label|name|count)\b|\.\d+\./);
    }
  });

  it('UI-43 keeps whitelist and transform on: an unknown field is dropped and a valid body passes', async () => {
    const value = await pipe.transform(
      { title: 'Box', groups: [{ label: 'Tools', items: [{ name: 'saw', count: 1 }] }], extra: 'x' },
      bodyOf(OuterBody),
    );

    expect(value).toBeInstanceOf(OuterBody);
    expect(value).not.toHaveProperty('extra');
    expect(value.groups[0]).toBeInstanceOf(GroupBody);
  });

  it('UI-43 answers a nested RecipeWriteDto ingredient with "Name this ingredient"', async () => {
    const messages = await messagesOf(
      pipe,
      {
        title: 'Shakshuka',
        category: 'Breakfast',
        servings: 2,
        ingredients: [{ quantity: 4, unit: 'piece', name: '' }],
        steps: [{ text: 'Crack the eggs into the sauce.' }],
      },
      RecipeWriteDto,
    );

    expect(messages).toEqual(['Name this ingredient']);
  });

  it('UI-43 answers a nested RecipeWriteDto step with "Write this step"', async () => {
    const messages = await messagesOf(
      pipe,
      {
        title: 'Shakshuka',
        category: 'Breakfast',
        servings: 2,
        ingredients: [{ quantity: 4, unit: 'piece', name: 'egg' }],
        steps: [{ text: 'Crack the eggs.' }, { text: '' }],
      },
      RecipeWriteDto,
    );

    expect(messages).toEqual(['Write this step']);
  });

  it('UI-43 answers "Servings can be at most 6" and a blank comment "Write a comment"', async () => {
    const recipe = await messagesOf(
      pipe,
      {
        title: 'Shakshuka',
        category: 'Breakfast',
        servings: 7,
        ingredients: [{ quantity: 4, unit: 'piece', name: 'egg' }],
        steps: [{ text: 'Crack the eggs.' }],
      },
      RecipeWriteDto,
    );
    const comment = await messagesOf(pipe, { body: '   ' }, CommentRequestDto);

    expect(recipe).toEqual(['Servings can be at most 6']);
    expect(comment).toEqual(['Write a comment']);
  });
});
