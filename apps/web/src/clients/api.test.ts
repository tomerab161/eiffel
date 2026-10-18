import { expect, it } from 'vitest';

import { HealthResponseSchema } from '@app/domain';
import { ApiError, getJson } from './api.ts';

const respond =
  (status: number, body: unknown): (() => Promise<Response>) =>
  async () =>
    new Response(JSON.stringify(body), { status });
const healthy = { status: 'ok', checks: { database: 'up' } };

it('returns the parsed body of a 2xx answer', async () => {
  expect(await getJson('/api/health', HealthResponseSchema, { fetchFn: respond(200, healthy) })).toEqual(healthy);
});

it('accepts a listed non-2xx status whose body matches the schema', async () => {
  const degraded = { status: 'degraded', checks: { database: 'down' } };
  const fetchFn = respond(503, degraded);
  expect(await getJson('/api/health', HealthResponseSchema, { acceptStatuses: [503], fetchFn })).toEqual(degraded);
});

it('throws ApiError with the shared error code otherwise', async () => {
  const fetchFn = respond(404, { code: 'NOT_FOUND', message: 'nope' });
  await expect(getJson('/api/x', HealthResponseSchema, { fetchFn })).rejects.toEqual(new ApiError(404, 'NOT_FOUND'));
});

it('uses UNKNOWN when the error body is not the shared shape', async () => {
  const fetchFn = async (): Promise<Response> => new Response('oops', { status: 502 });
  await expect(getJson('/api/x', HealthResponseSchema, { fetchFn })).rejects.toMatchObject({
    status: 502,
    code: 'UNKNOWN',
  });
});

it('rejects a 2xx body that breaks the contract', async () => {
  await expect(
    getJson('/api/health', HealthResponseSchema, { fetchFn: respond(200, { status: 'fine' }) }),
  ).rejects.toThrow();
});
