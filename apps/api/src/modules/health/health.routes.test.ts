import Fastify from 'fastify';
import { expect, it } from 'vitest';

import { zodPlugin } from '../../plugins/index.ts';
import { healthRoutes } from './health.routes.ts';
import { buildTestApp, fakeHealthRepository } from './health.support.ts';

it('answers 200 with the health report when the database is up', async () => {
  const app = await buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: 'ok', checks: { database: 'up' } });
});

it('answers 503 when the database is down', async () => {
  const app = await buildTestApp({ health: fakeHealthRepository(false) });
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  expect(res.statusCode).toBe(503);
  expect(res.json()).toEqual({ status: 'degraded', checks: { database: 'down' } });
});

it('never sends fields outside the response contract', async () => {
  for (const report of [
    { status: 'ok', checks: { database: 'up' } },
    { status: 'degraded', checks: { database: 'down' } },
  ] as const) {
    const app = Fastify();
    await app.register(zodPlugin);
    await app.register(healthRoutes, { service: { check: async () => ({ ...report, internal: 'secret' }) } });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual(report);
  }
});
