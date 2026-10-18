import { type App, type AppDependencies, buildApp } from '../../app.ts';
import { loadConfig } from '../../config/index.ts';
import type { HealthRepository } from './health.repository.ts';

type FakeHealthRepository = HealthRepository & { databaseUp: boolean };

/** In-memory fake: tests decide whether the database answers. */
const fakeHealthRepository = (databaseUp: boolean = true): FakeHealthRepository => {
  const fake: FakeHealthRepository = { databaseUp, ping: async () => fake.databaseUp };

  return fake;
};

/** The real app with fake repositories, so tests need no live MongoDB. */
const buildTestApp = (overrides: Partial<AppDependencies> = {}): Promise<App> =>
  buildApp({
    config: loadConfig({ LOG_LEVEL: 'silent' }),
    repositories: { health: fakeHealthRepository(), ...overrides },
  });

export { buildTestApp, fakeHealthRepository };
