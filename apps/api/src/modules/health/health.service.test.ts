import { expect, it } from 'vitest';

import { createHealthService } from './health.service.ts';
import { fakeHealthRepository } from './health.support.ts';

it('reports ok when the database answers', async () => {
  const service = createHealthService(fakeHealthRepository(true));
  expect(await service.check()).toEqual({ status: 'ok', checks: { database: 'up' } });
});

it('reports degraded when the database does not answer', async () => {
  const service = createHealthService(fakeHealthRepository(false));
  expect(await service.check()).toEqual({ status: 'degraded', checks: { database: 'down' } });
});
