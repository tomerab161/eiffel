import type { IncomingMessage, ServerResponse } from 'node:http';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type RawServerDefault } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { type AppConfig, STORAGE_MEMORY } from './config/index.ts';
import {
  createInMemoryHealthRepository,
  createMongoHealthRepository,
  type HealthRepository,
} from './modules/health/health.repository.ts';
import { healthRoutes } from './modules/health/health.routes.ts';
import { createHealthService } from './modules/health/health.service.ts';
import { errorHandlerPlugin, mongoPlugin, zodPlugin } from './plugins/index.ts';

/** Every repository the modules need. Tests pass in-memory fakes; production builds them on MongoDB. */
interface AppDependencies {
  health: HealthRepository;
}

interface BuildAppOptions {
  config: AppConfig;
  repositories?: AppDependencies;
}

type App = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, FastifyBaseLogger, ZodTypeProvider>;

const memoryRepositories = (): AppDependencies => ({ health: createInMemoryHealthRepository() });

const mongoRepositories = async (app: App, url: string): Promise<AppDependencies> => {
  await app.register(mongoPlugin, { url });

  return { health: createMongoHealthRepository(app.mongo.db) };
};

const repositoriesFor = (app: App, config: AppConfig): Promise<AppDependencies> | AppDependencies =>
  config.STORAGE === STORAGE_MEMORY ? memoryRepositories() : mongoRepositories(app, config.MONGO_URL);

/**
 * Composition root: registers plugins, then each module with its service and repository.
 * Never listens (server.ts does), so tests drive it with app.inject().
 */
const buildApp = async ({ config, repositories }: BuildAppOptions): Promise<App> => {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } }).withTypeProvider<ZodTypeProvider>();
  await app.register(zodPlugin);
  await app.register(errorHandlerPlugin);
  const deps = repositories ?? (await repositoriesFor(app, config));
  await app.register(healthRoutes, { service: createHealthService(deps.health) });

  return app;
};

export type { App, AppDependencies, BuildAppOptions };
export { buildApp };
