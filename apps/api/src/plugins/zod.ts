import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

/** Validates requests and serializes responses with the Zod schemas from @app/domain. */
const zodPlugin = fp(
  async (app: FastifyInstance) => {
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
  },
  { name: 'zod' },
);

export { zodPlugin };
