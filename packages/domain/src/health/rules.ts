import { CHECK_UP, HEALTH_DEGRADED, HEALTH_OK } from './constants.ts';
import type { CheckState, HealthStatus } from './schemas.ts';

/** The service is ok only when every dependency is up. */
const overallStatus = (checks: Readonly<Record<string, CheckState>>): HealthStatus =>
  Object.values(checks).every((state) => state === CHECK_UP) ? HEALTH_OK : HEALTH_DEGRADED;

export { overallStatus };
