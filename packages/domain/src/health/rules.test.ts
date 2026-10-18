import { expect, it } from 'vitest';

import { overallStatus } from './rules.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

it('is ok when the database is up', () => {
  expect(overallStatus({ database: 'up' })).toBe('ok');
});

it('is degraded when the database is down', () => {
  expect(overallStatus({ database: 'down' })).toBe('degraded');
});

it('is degraded when any one of several dependencies is down', () => {
  expect(overallStatus({ database: 'up', cache: 'down' })).toBe('degraded');
});
