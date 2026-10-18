import { defineConfig } from 'vitest/config';

// One test run for the whole monorepo. Each package/app is a Vitest project with its own environment.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.{test,steps,support}.{ts,tsx}', '**/*.d.ts', '**/index.ts', '**/main.tsx', '**/server.ts'],
    },
  },
});
