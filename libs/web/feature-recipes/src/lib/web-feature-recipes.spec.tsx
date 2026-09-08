import { render } from '@testing-library/react';

import WebFeatureRecipes from './web-feature-recipes';

describe('WebFeatureRecipes', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<WebFeatureRecipes />);
    expect(baseElement).toBeTruthy();
  });
});
