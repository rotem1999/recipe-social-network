import { Injectable } from '@nestjs/common';
import type { Ingredient, Step } from '@rsn/shared/util-domain';
import type { ChatMessage } from '@rsn/api/data-access-openrouter';

/** COOK-10: the fixed system prompt — concise, under 120 words, plain text. */
const SYSTEM_PROMPT =
  'You are a concise cooking assistant. Answer only about the recipe below and the ' +
  'step marked ">>". Keep the answer under 120 words, plain text, no markdown.';

/** COOK-10: used when the user pressed the button without typing a question. */
const DEFAULT_QUESTION = 'Give one useful tip for the current step';

/** COOK-4/COOK-10: everything the model needs about the recipe and the current step. */
export interface CookPromptInput {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  steps: Step[];
  stepIndex: number;
  question?: string;
}

/**
 * COOK-4: the engineered prompt. The user never pastes the recipe, and the wording is
 * kept short on purpose because every token is billed (COOK-7).
 * Pure: it reads nothing but its input.
 */
@Injectable()
export class CookPromptBuilder {
  /** COOK-9/COOK-10: exactly two messages, no history. */
  build(input: CookPromptInput): ChatMessage[] {
    const lines: string[] = [
      input.title,
      `Servings: ${input.servings}`,
      'Ingredients:',
      ...input.ingredients.map(ingredientLine),
      'Steps:',
      ...input.steps.map((step, index) =>
        stepLine(step, index, input.stepIndex),
      ),
      questionLine(input.question),
    ];

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: lines.join('\n') },
    ];
  }
}

/**
 * §3.1.1: one line per ingredient, `200 g ramen noodles (fresh)`. A null quantity means
 * "to taste"; the `none` unit is left out so nothing is spent on an empty word.
 */
function ingredientLine(ingredient: Ingredient): string {
  const note =
    ingredient.note !== undefined && ingredient.note.trim() !== ''
      ? ` (${ingredient.note.trim()})`
      : '';
  if (ingredient.quantity === null) {
    return `to taste ${ingredient.name}${note}`;
  }
  const unit = ingredient.unit === 'none' ? '' : `${ingredient.unit} `;
  return `${ingredient.quantity} ${unit}${ingredient.name}${note}`;
}

/** COOK-10: steps are numbered from 1 and the current one is prefixed `>> `. */
function stepLine(step: Step, index: number, currentIndex: number): string {
  const marker = index === currentIndex ? '>> ' : '';
  return `${marker}${index + 1}. ${step.text}`;
}

/** COOK-10: the question, or the fixed fallback. */
function questionLine(question?: string): string {
  const asked = question?.trim() ?? '';
  return asked === '' ? DEFAULT_QUESTION : `Question: ${asked}`;
}
