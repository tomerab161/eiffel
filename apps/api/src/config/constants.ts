/** Defaults for a local run. Every real environment sets its own values. */
const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_MONGO_URL = 'mongodb://127.0.0.1:27017/app';
const DEFAULT_LOG_LEVEL = 'info';
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** mongo in every real environment. memory keeps data in process: for the e2e (QA) run and local demos only. */
const STORAGE_MONGO = 'mongo';
const STORAGE_MEMORY = 'memory';
const STORAGES = [STORAGE_MONGO, STORAGE_MEMORY] as const;

export {
  DEFAULT_HOST,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MONGO_URL,
  DEFAULT_PORT,
  LOG_LEVELS,
  STORAGE_MEMORY,
  STORAGE_MONGO,
  STORAGES,
};
