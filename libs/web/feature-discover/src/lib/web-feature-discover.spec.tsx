import { render } from '@testing-library/react';

import WebFeatureDiscover from './web-feature-discover';

describe('WebFeatureDiscover', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<WebFeatureDiscover />);
    expect(baseElement).toBeTruthy();
  });
});
