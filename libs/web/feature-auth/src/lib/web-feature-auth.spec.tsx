import { render } from '@testing-library/react';

import WebFeatureAuth from './web-feature-auth';

describe('WebFeatureAuth', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<WebFeatureAuth />);
    expect(baseElement).toBeTruthy();
  });
});
