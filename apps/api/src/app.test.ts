import { expect, it } from 'vitest';
import { z } from 'zod';

import { buildApp } from './app.ts';
import { loadConfig } from './config/index.ts';
import { buildTestApp } from './modules/health/health.support.ts';

it('answers 404 in the shared error shape for an unknown route', async () => {
  const app = await buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/api/nope' });
  expect(res.statusCode).toBe(404);
  expect(res.json()).toEqual({ code: 'NOT_FOUND', message: 'GET /api/nope not found' });
});

it('hides internal errors behind the shared error shape', async () => {
  const app = await buildTestApp();
  app.get('/boom', () => {
    throw new Error('secret detail');
  });
  const res = await app.inject({ method: 'GET', url: '/boom' });
  expect(res.statusCode).toBe(500);
  expect(res.json()).toEqual({ code: 'INTERNAL', message: 'Internal server error' });
});

it('answers 400 in the shared error shape when a request fails its schema', async () => {
  const app = await buildTestApp();
  app.get('/echo', { schema: { querystring: z.object({ n: z.coerce.number() }) } }, (request) => request.query);
  const res = await app.inject({ method: 'GET', url: '/echo?n=abc' });
  expect(res.statusCode).toBe(400);
  expect(res.json().code).toBe('VALIDATION_FAILED');
});

it('serves from in-memory storage when STORAGE=memory, with no database', async () => {
  const app = await buildApp({ config: loadConfig({ STORAGE: 'memory', LOG_LEVEL: 'silent' }) });
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  expect(res.json()).toEqual({ status: 'ok', checks: { database: 'up' } });
});
