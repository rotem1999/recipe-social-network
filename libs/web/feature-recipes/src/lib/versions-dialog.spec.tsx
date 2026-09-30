// SPEC.md UI-12 (a "vN" tag opens the version list with dates, "Current"
// marked), UI-46 (version dates as "29 Sep 2026, 01:07", independent of the
// system locale) and UI-50 (the version title is its own bidi-text element).
// `@rsn/web/data-access-api` is mocked at the module boundary.
import { render, screen, within } from '@testing-library/react';
import type { RecipeVersionsResponse } from '@rsn/shared/util-contracts';
import { VersionsDialog } from './versions-dialog';

const mocks = vi.hoisted(() => ({
  api: { listVersions: vi.fn(), getVersion: vi.fn() },
}));

vi.mock('@rsn/web/data-access-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@rsn/web/data-access-api')>();
  return {
    ...actual,
    useApi: () => mocks.api,
  };
});

/** Built from local time, so the expected text holds in any time zone. */
const V1_CREATED = new Date(2026, 8, 29, 1, 7).toISOString();
const V2_CREATED = new Date(2026, 9, 2, 18, 30).toISOString();

const VERSIONS: RecipeVersionsResponse = {
  versions: [
    { versionNumber: 2, title: 'שקשוקה', createdAt: V2_CREATED, isCurrent: true },
    {
      versionNumber: 1,
      title: 'Shakshuka',
      createdAt: V1_CREATED,
      isCurrent: false,
    },
  ],
};

function rowOf(versionNumber: number): HTMLElement {
  const row = screen.getByText(`v${versionNumber}`).closest('.version-row');
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no row for v${versionNumber}`);
  }
  return row;
}

describe('VersionsDialog', () => {
  beforeEach(() => {
    mocks.api.listVersions.mockReset().mockResolvedValue(VERSIONS);
    mocks.api.getVersion.mockReset();
  });

  it('UI-46 writes each version date as "29 Sep 2026, 01:07"', async () => {
    render(
      <VersionsDialog recipeId="r1" onPick={vi.fn()} onClose={vi.fn()} />,
    );

    await screen.findByText('v1');
    expect(mocks.api.listVersions).toHaveBeenCalledWith('r1');
    expect(
      rowOf(1).querySelector('.version-date')?.textContent,
    ).toBe('29 Sep 2026, 01:07');
    expect(
      rowOf(2).querySelector('.version-date')?.textContent,
    ).toBe('2 Oct 2026, 18:30');
  });

  it('UI-12 marks the current version "Current"', async () => {
    render(
      <VersionsDialog recipeId="r1" onPick={vi.fn()} onClose={vi.fn()} />,
    );

    await screen.findByText('v2');
    expect(within(rowOf(2)).getByText('Current')).toBeTruthy();
    expect(within(rowOf(1)).queryByText('Current')).toBeNull();
  });

  it('UI-50 puts each version title in its own bidi-text element', async () => {
    render(
      <VersionsDialog recipeId="r1" onPick={vi.fn()} onClose={vi.fn()} />,
    );

    const title = await screen.findByText('שקשוקה');
    expect(title.getAttribute('dir')).toBe('auto');
    expect(title.classList.contains('bidi-text')).toBe(true);
    // The date sits outside the directional title.
    const date = rowOf(2).querySelector('.version-date');
    expect(date).not.toBeNull();
    expect(title.contains(date)).toBe(false);
    expect(rowOf(2).hasAttribute('dir')).toBe(false);
  });
});
