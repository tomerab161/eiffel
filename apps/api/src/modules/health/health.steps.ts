import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { LightMyRequestResponse } from 'fastify';
import { expect } from 'vitest';

import { buildTestApp, fakeHealthRepository } from './health.support.ts';

const feature = await loadFeature('apps/api/src/modules/health/health.feature');

// Step bodies are named functions, so each scenario nests only two callbacks deep (max-nested-callbacks).
const repository = fakeHealthRepository();
const state: { response?: LightMyRequestResponse } = {};

const databaseIs =
  (up: boolean): (() => void) =>
  () => {
    repository.databaseUp = up;
  };

const ask = async (): Promise<void> => {
  state.response = await (await buildTestApp({ health: repository })).inject({ method: 'GET', url: '/api/health' });
};

const response = (): LightMyRequestResponse => {
  if (!state.response) {
    throw new Error('no request was made yet');
  }

  return state.response;
};

const statusIs =
  (code: number): (() => void) =>
  () => {
    expect(response().statusCode).toBe(code);
  };

const reportedStatusIs =
  (status: string): (() => void) =>
  () => {
    expect(response().json().status).toBe(status);
  };

describeFeature(feature, ({ Scenario }) => {
  Scenario('The database answers', ({ Given, When, Then, And }) => {
    Given('the database is up', databaseIs(true));
    When('a client asks for GET /api/health', ask);
    Then('the response status is 200', statusIs(200));
    And('the reported status is "ok"', reportedStatusIs('ok'));
  });

  Scenario('The database does not answer', ({ Given, When, Then, And }) => {
    Given('the database is down', databaseIs(false));
    When('a client asks for GET /api/health', ask);
    Then('the response status is 503', statusIs(503));
    And('the reported status is "degraded"', reportedStatusIs('degraded'));
  });
});
