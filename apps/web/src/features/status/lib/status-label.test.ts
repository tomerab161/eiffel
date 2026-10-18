import { expect, it } from 'vitest';

import { statusLabel } from './status-label.ts';

it('says the API is unreachable when the request failed', () => {
  expect(statusLabel({ status: 'ok', checks: { database: 'up' } }, true)).toBe('API unreachable');
});

it('says it is checking before the first answer', () => {
  expect(statusLabel(undefined, false)).toBe('Checking…');
});

it('says all is well when the API is ok', () => {
  expect(statusLabel({ status: 'ok', checks: { database: 'up' } }, false)).toBe('All systems operational');
});

it('names the failing dependency when degraded', () => {
  expect(statusLabel({ status: 'degraded', checks: { database: 'down' } }, false)).toBe('Degraded: database down');
});
