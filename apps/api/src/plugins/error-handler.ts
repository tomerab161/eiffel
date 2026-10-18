import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

import type { ErrorResponse } from '@app/domain';
import { HTTP_BAD_REQUEST, HTTP_INTERNAL_ERROR, HTTP_NOT_FOUND } from '../shared/index.ts';

/** Maps every error to the shared ErrorResponse shape. Internal details never reach the client. */
const errorHandlerPlugin = fp(
  async (app: FastifyInstance) => {
    app.setErrorHandler((error: FastifyError, request, reply) => {
      const invalid = hasZodFastifySchemaValidationErrors(error);

      if (!invalid) {
        request.log.error(error);
      }

      const body: ErrorResponse = invalid
        ? { code: 'VALIDATION_FAILED', message: error.message }
        : { code: 'INTERNAL', message: 'Internal server error' };

      return reply.code(invalid ? HTTP_BAD_REQUEST : HTTP_INTERNAL_ERROR).send(body);
    });
    app.setNotFoundHandler((request, reply) => {
      const body: ErrorResponse = { code: 'NOT_FOUND', message: `${request.method} ${request.url} not found` };

      return reply.code(HTTP_NOT_FOUND).send(body);
    });
  },
  { name: 'error-handler' },
);

export { errorHandlerPlugin };
