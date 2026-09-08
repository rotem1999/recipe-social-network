import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // electron-vite output (SPEC §11.2.2); never linted.
    ignores: ['out'],
  },
];
