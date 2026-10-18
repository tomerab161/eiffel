import { expect, it } from 'vitest';

import { loadConfig } from './env.ts';

it('uses defaults for a local run', () => {
  expect(loadConfig({})).toEqual({
    PORT: 3000,
    HOST: '127.0.0.1',
    MONGO_URL: 'mongodb://127.0.0.1:27017/app',
    STORAGE: 'mongo',
    LOG_LEVEL: 'info',
  });
});

it('reads values from the environment', () => {
  const config = loadConfig({ PORT: '8080', MONGO_URL: 'mongodb+srv://db.example/app', LOG_LEVEL: 'silent' });
  expect(config.PORT).toBe(8080);
  expect(config.MONGO_URL).toBe('mongodb+srv://db.example/app');
  expect(config.LOG_LEVEL).toBe('silent');
});

it('rejects a non-numeric port', () => {
  expect(() => loadConfig({ PORT: 'eighty' })).toThrow();
});

it('rejects a database url that is not MongoDB', () => {
  expect(() => loadConfig({ MONGO_URL: 'postgres://db/app' })).toThrow();
});

it('accepts in-memory storage and rejects unknown storage', () => {
  expect(loadConfig({ STORAGE: 'memory' }).STORAGE).toBe('memory');
  expect(() => loadConfig({ STORAGE: 'redis' })).toThrow();
});
