import { defineProject } from 'vitest/config';

const config = defineProject({
  test: { name: 'domain', environment: 'node', include: ['src/**/*.{test,steps}.ts'], passWithNoTests: true },
});

export default config;
