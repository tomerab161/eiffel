import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { HEALTH_HTTP_DEGRADED, HEALTH_HTTP_OK, HEALTH_OK, HEALTH_PATH, HealthResponseSchema } from '@app/domain';
import type { HealthService } from './health.service.ts';

/** HTTP only: validate, call the service, pick the status code. No business rules here. */
const healthRoutes: FastifyPluginAsyncZod<{ service: HealthService }> = async (app, { service }) => {
  app.get(
    HEALTH_PATH,
    { schema: { response: { [HEALTH_HTTP_OK]: HealthResponseSchema, [HEALTH_HTTP_DEGRADED]: HealthResponseSchema } } },
    async (_, reply) => {
      const health = await service.check();

      return reply.code(health.status === HEALTH_OK ? HEALTH_HTTP_OK : HEALTH_HTTP_DEGRADED).send(health);
    },
  );
};

export { healthRoutes };
