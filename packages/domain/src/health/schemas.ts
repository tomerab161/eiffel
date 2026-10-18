import { z } from 'zod';

import { CHECK_STATES, HEALTH_STATUSES } from './constants.ts';

const CheckStateSchema = z.enum(CHECK_STATES);
type CheckState = z.infer<typeof CheckStateSchema>;

const HealthChecksSchema = z.object({ database: CheckStateSchema });
type HealthChecks = z.infer<typeof HealthChecksSchema>;

const HealthResponseSchema = z.object({
  status: z.enum(HEALTH_STATUSES),
  checks: HealthChecksSchema,
});
type HealthResponse = z.infer<typeof HealthResponseSchema>;
type HealthStatus = HealthResponse['status'];

export type { CheckState, HealthChecks, HealthResponse, HealthStatus };
export { CheckStateSchema, HealthChecksSchema, HealthResponseSchema };
