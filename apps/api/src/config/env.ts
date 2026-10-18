import { z } from 'zod';

import {
  DEFAULT_HOST,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MONGO_URL,
  DEFAULT_PORT,
  LOG_LEVELS,
  STORAGE_MONGO,
  STORAGES,
} from './constants.ts';

/** Every environment variable the API reads, parsed once at startup. Nothing else reads process.env. */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  HOST: z.string().min(1).default(DEFAULT_HOST),
  MONGO_URL: z.string().startsWith('mongodb').default(DEFAULT_MONGO_URL),
  STORAGE: z.enum(STORAGES).default(STORAGE_MONGO),
  LOG_LEVEL: z.enum(LOG_LEVELS).default(DEFAULT_LOG_LEVEL),
});
type AppConfig = z.infer<typeof EnvSchema>;

const loadConfig = (env: Record<string, string | undefined> = process.env): AppConfig => EnvSchema.parse(env);

export type { AppConfig };
export { EnvSchema, loadConfig };
