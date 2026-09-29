// SPEC §7 COOK-4, COOK-9, COOK-10: the engineered cook-mode prompt. Pure, no I/O.
import type { Ingredient, Step } from '@rsn/shared/util-domain';

import { CookPromptBuilder, type CookPromptInput } from './cook-prompt.builder';

const INGREDIENTS: Ingredient[] = [
  { quantity: 200, unit: 'g', name: 'ramen noodles', note: 'fresh' },
  { quantity: null, unit: 'ml', name: 'chili oil' },
  { quantity: 2, unit: 'none', name: 'eggs' },
];

const STEPS: Step[] = [
  { text: 'Boil the broth' },
  { text: 'Cook the noodles', durationMinutes: 3 },
  { text: 'Assemble the bowl' },
];

function input(overrides: Partial<CookPromptInput> = {}): CookPromptInput {
  return {
    title: 'Tonkotsu ramen',
    servings: 2,
    ingredients: INGREDIENTS,
    steps: STEPS,
    stepIndex: 1,
    ...overrides,
  };
}

describe('CookPromptBuilder.build (COOK-4, COOK-9, COOK-10)', () => {
  const builder = new CookPromptBuilder();

  it('COOK-9 builds exactly two messages, a system one and a user one', () => {
    const messages = builder.build(input());

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('COOK-10 uses the fixed concise system prompt with the 120-word limit', () => {
    const [system] = builder.build(input());

    expect(system.content).toBe(
      'You are a concise cooking assistant. Answer only about the recipe below and the ' +
        'step marked ">>". Keep the answer under 120 words, plain text, no markdown.',
    );
  });

  it('COOK-4 attaches the title and the servings without the user pasting them', () => {
    const lines = builder.build(input())[1].content.split('\n');

    expect(lines[0]).toBe('Tonkotsu ramen');
    expect(lines[1]).toBe('Servings: 2');
    expect(lines[2]).toBe('Ingredients:');
  });

  it('COOK-4 writes a quantity, unit, name and note as `200 g ramen noodles (fresh)`', () => {
    const lines = builder.build(input())[1].content.split('\n');

    expect(lines).toContain('200 g ramen noodles (fresh)');
  });

  it('COOK-4 writes an empty quantity as `to taste chili oil`', () => {
    const lines = builder.build(input())[1].content.split('\n');

    expect(lines).toContain('to taste chili oil');
  });

  it('COOK-4 leaves the `none` unit out of the ingredient line', () => {
    const lines = builder.build(input())[1].content.split('\n');

    expect(lines).toContain('2 eggs');
  });

  it('COOK-10 numbers the steps from 1 and prefixes the current one with `>> `', () => {
    const lines = builder.build(input({ stepIndex: 1 }))[1].content.split('\n');

    expect(lines).toContain('1. Boil the broth');
    expect(lines).toContain('>> 2. Cook the noodles');
    expect(lines).toContain('3. Assemble the bowl');
  });

  it('COOK-10 moves the `>> ` marker with the step index', () => {
    const lines = builder.build(input({ stepIndex: 0 }))[1].content.split('\n');

    expect(lines).toContain('>> 1. Boil the broth');
    expect(lines).toContain('2. Cook the noodles');
  });

  it('COOK-10 falls back to the fixed question when the user typed none', () => {
    const lines = builder.build(input({ question: undefined }))[1].content.split(
      '\n',
    );

    expect(lines[lines.length - 1]).toBe(
      'Give one useful tip for the current step',
    );
  });

  it('COOK-10 falls back to the fixed question for a blank question', () => {
    const lines = builder.build(input({ question: '   ' }))[1].content.split(
      '\n',
    );

    expect(lines[lines.length - 1]).toBe(
      'Give one useful tip for the current step',
    );
  });

  it('COOK-10 sends the trimmed question when the user typed one', () => {
    const lines = builder
      .build(input({ question: '  Can I use dried noodles?  ' }))[1]
      .content.split('\n');

    expect(lines[lines.length - 1]).toBe(
      'Question: Can I use dried noodles?',
    );
  });

  it('COOK-4 reads nothing but its input: the same input gives the same messages', () => {
    expect(builder.build(input())).toEqual(builder.build(input()));
  });
});
