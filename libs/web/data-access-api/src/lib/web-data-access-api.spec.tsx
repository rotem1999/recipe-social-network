import { render } from '@testing-library/react';

import WebDataAccessApi from './web-data-access-api';

describe('WebDataAccessApi', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<WebDataAccessApi />);
    expect(baseElement).toBeTruthy();
  });
});
