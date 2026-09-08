import { render } from '@testing-library/react';

import WebFeatureFriends from './web-feature-friends';

describe('WebFeatureFriends', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<WebFeatureFriends />);
    expect(baseElement).toBeTruthy();
  });
});
