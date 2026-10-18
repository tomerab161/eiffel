import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// /api goes to the API in dev and preview. API_URL lets the e2e run point at its own API instance.
const proxy = { '/api': process.env.API_URL ?? 'http://127.0.0.1:3000' };

const config = defineConfig({ plugins: [react()], server: { proxy }, preview: { proxy } });

export default config;
