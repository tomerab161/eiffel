import { defineProject } from 'vitest/config';

const config = defineProject({ test: { name: 'api', environment: 'node', include: ['src/**/*.{test,steps}.ts'] } });

export default config;
