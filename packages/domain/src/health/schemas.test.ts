import { expect, it } from 'vitest';

import { HealthResponseSchema } from './schemas.ts';

it('accepts a well-formed health response', () => {
  const health = { status: 'ok', checks: { database: 'up' } };
  expect(HealthResponseSchema.parse(health)).toEqual(health);
});

it('rejects an unknown status', () => {
  expect(HealthResponseSchema.safeParse({ status: 'fine', checks: { database: 'up' } }).success).toBe(false);
});

it('rejects an unknown check state', () => {
  expect(HealthResponseSchema.safeParse({ status: 'ok', checks: { database: 'maybe' } }).success).toBe(false);
});
