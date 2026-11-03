import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works both locally and under /ninth-seal/ on GitHub Pages.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
