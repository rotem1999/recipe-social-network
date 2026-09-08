import { render } from '@testing-library/react';

import WebFeatureCook from './web-feature-cook';

describe('WebFeatureCook', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<WebFeatureCook />);
    expect(baseElement).toBeTruthy();
  });
});
