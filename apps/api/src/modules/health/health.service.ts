import { CHECK_DOWN, CHECK_UP, type HealthChecks, type HealthResponse, overallStatus } from '@app/domain';
import type { HealthRepository } from './health.repository.ts';

interface HealthService {
  check(): Promise<HealthResponse>;
}

const createHealthService = (repository: HealthRepository): HealthService => ({
  check: async () => {
    const checks: HealthChecks = { database: (await repository.ping()) ? CHECK_UP : CHECK_DOWN };

    return { status: overallStatus(checks), checks };
  },
});

export type { HealthService };
export { createHealthService };
