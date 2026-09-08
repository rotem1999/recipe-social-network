import { render } from '@testing-library/react';

import WebFeatureRecommend from './web-feature-recommend';

describe('WebFeatureRecommend', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<WebFeatureRecommend />);
    expect(baseElement).toBeTruthy();
  });
});
