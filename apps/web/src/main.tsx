// UI-3/UI-4: the design system is imported first so its global stylesheet
// (tokens, component classes, bundled fonts) is in place before anything renders.
import '@rsn/web/ui';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './app/app';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('CookBook: #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
