import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { cleanup, screen } from '@testing-library/react';
import { expect, vi } from 'vitest';

import { StatusPage } from './components/index.ts';
import { fakeApi, renderWithQuery } from './status.support.tsx';

const feature = await loadFeature('apps/web/src/features/status/status.feature');
const reports = new Map([
  ['ok', { code: 200, body: { status: 'ok', checks: { database: 'up' } } }],
  ['degraded', { code: 503, body: { status: 'degraded', checks: { database: 'down' } } }],
]);

// Step bodies are named functions, so each scenario nests only two callbacks deep (max-nested-callbacks).
const apiReports = (_: unknown, status: string): void => {
  const report = reports.get(status);

  if (!report) {
    throw new Error(`no fake report for status "${status}"`);
  }

  fakeApi(report.code, report.body);
};

const openStatusPage = (): void => {
  renderWithQuery(<StatusPage />);
};

const seeText = async (_: unknown, text: string): Promise<void> => {
  expect(await screen.findByText(text)).toBeDefined();
};

const cleanUp = (): void => {
  cleanup();
  vi.unstubAllGlobals();
};

describeFeature(feature, ({ Scenario, AfterEachScenario }) => {
  // Steps run as separate tests, so clean up per scenario, not per test.
  AfterEachScenario(cleanUp);

  for (const name of ['The API is healthy', 'The database is down']) {
    Scenario(name, ({ Given, When, Then }) => {
      Given('the API reports status {string}', apiReports);
      When('I open the status page', openStatusPage);
      Then('I see {string}', seeText);
    });
  }
});
