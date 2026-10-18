import type { Db } from 'mongodb';

/** What the health service needs from storage. Tests use an in-memory fake (health.support.ts). */
interface HealthRepository {
  /** True when the database answers. */
  ping(): Promise<boolean>;
}

const createMongoHealthRepository = (db: Db): HealthRepository => ({
  ping: () =>
    db.command({ ping: 1 }).then(
      () => true,
      () => false,
    ),
});

/** STORAGE=memory (e2e runs): nothing to connect to, so the database always answers. */
const createInMemoryHealthRepository = (): HealthRepository => ({ ping: async () => true });

export type { HealthRepository };
export { createInMemoryHealthRepository, createMongoHealthRepository };
