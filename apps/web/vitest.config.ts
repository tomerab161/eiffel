import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

const config = defineProject({
  plugins: [react()],
  test: { name: 'web', environment: 'happy-dom', include: ['src/**/*.{test,steps}.{ts,tsx}'] },
});

export default config;
