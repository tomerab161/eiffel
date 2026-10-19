import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { expect, vi } from 'vitest';

import {
  bodyRows,
  boxCenter,
  clickMapAt,
  demandsFile,
  expectFrames,
  extentOfBoxes,
  highlightedPolygons,
  highlightedRows,
  openDemandsPage,
  panMap,
  type SampleDemand,
  type ShownView,
  sample,
  serveJson,
  shownView,
  sideBySide,
} from './demands-page.support.tsx';

const feature = await loadFeature('apps/web/src/features/demands-map/adapters/map-table-sync.feature');

// Step bodies are named functions or factories, so each scenario nests only two callbacks deep (max-nested-callbacks).
const world: { served: SampleDemand[]; viewBefore?: ShownView; scrolled: Element[] } = { served: [], scrolled: [] };

// Vitest clears a spy's call record between tests, and each step is a test, so scrolls are recorded here.
const recorder = {
  scrollIntoView(this: Element): void {
    world.scrolled.push(this);
  },
};

const show = async (demands: SampleDemand[]): Promise<void> => {
  world.served = demands;
  world.scrolled = [];
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(recorder.scrollIntoView);
  serveJson(demandsFile(demands));
  openDemandsPage();
  await screen.findAllByRole('cell', { name: demands[0]?.name ?? '' });
};

const showsThree = async (_: unknown, ...names: string[]): Promise<void> => {
  await show(sideBySide(names.map((name) => sample(name))));
};

const showsOverlapping = async (_: unknown, first: string, second: string): Promise<void> => {
  await show([
    { ...sample(first), box: [0, 0, 10, 10] },
    { ...sample(second), box: [5, 5, 15, 15] },
  ]);
};

const showsTwoDepots = async (_: unknown, ...[name, first, second]: [string, string, string]): Promise<void> => {
  await show(sideBySide([sample(name, first), sample(name, second)]));
};

const indexOf = (name: string, customer?: string): number => {
  const index = world.served.findIndex(
    (demand) => demand.name === name && (customer === undefined || demand.customer === customer),
  );

  expect(index).toBeGreaterThanOrEqual(0);

  return index;
};

const rowOf = (name: string, customer?: string): HTMLElement => {
  const row = bodyRows()[indexOf(name, customer)];

  if (!row) {
    throw new Error(`no row for ${name}`);
  }

  return row;
};

const rememberView = (): void => {
  world.viewBefore = shownView();
};

const clickPolygon = (_: unknown, name: string): void => {
  rememberView();
  clickMapAt(boxCenter(world.served[indexOf(name)] as SampleDemand));
};

const clickRow = (_: unknown, name: string): void => {
  fireEvent.click(rowOf(name));
};

const clickRowFor = (_: unknown, name: string, customer: string): void => {
  fireEvent.click(rowOf(name, customer));
};

const clickRowThenPan = (_: unknown, name: string): void => {
  clickRow(_, name);
  rememberView();
  panMap();
  expect(shownView()).not.toEqual(world.viewBefore);
};

const enterOnRow = (_: unknown, name: string): void => {
  const row = rowOf(name);

  row.focus();
  expect(document.activeElement).toBe(row);
  fireEvent.keyDown(row, { key: 'Enter' });
};

const clickWhere = (target: string | undefined): ((_: unknown, name: string) => void) =>
  target === 'row' ? clickRow : clickPolygon;

const clickOverlap = (): void => {
  clickMapAt([7.5, 7.5]);
};

const onlyRow = (_: unknown, name: string, customer?: string): void => {
  expect(highlightedRows()).toEqual([indexOf(name, customer)]);
};

const onlyPolygon = (_: unknown, name: string, customer?: string): void => {
  expect(highlightedPolygons()).toEqual([indexOf(name, customer)]);
};

const scrolledTo = (_: unknown, name: string): void => {
  const row = rowOf(name);

  expect(world.scrolled).toContain(row);
};

const viewStays = (): void => {
  expect(shownView()).toEqual(world.viewBefore);
};

const framesDemand = (_: unknown, name: string): void => {
  expectFrames(extentOfBoxes([world.served[indexOf(name)] as SampleDemand]));
};

const cleanUp = (): void => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
};

const SHOWS_THREE = '/demands shows {string}, {string} and {string}';

describeFeature(feature, ({ Scenario, ScenarioOutline, AfterEachScenario }) => {
  AfterEachScenario(cleanUp);

  Scenario('Clicking a polygon highlights its row and scrolls the table to it', ({ Given, When, Then, And }) => {
    Given(SHOWS_THREE, showsThree);
    When('I click the polygon of {string} on the map', clickPolygon);
    Then('only the row {string} is highlighted in the table', onlyRow);
    And('the table scrolls the row {string} into view', scrolledTo);
    And('only the polygon of {string} is highlighted on the map', onlyPolygon);
    And('the map view does not move', viewStays);
  });

  Scenario('Clicking a row highlights its polygon and frames the map on it', ({ Given, When, Then, And }) => {
    Given(SHOWS_THREE, showsThree);
    When('I click the row {string} in the table', clickRow);
    Then('only the row {string} is highlighted in the table', onlyRow);
    And('only the polygon of {string} is highlighted on the map', onlyPolygon);
    And('the map view frames the extent of {string}', framesDemand);
  });

  Scenario('Pressing Enter on a focused row selects it like a click', ({ Given, When, Then, And }) => {
    Given(SHOWS_THREE, showsThree);
    When('I move keyboard focus to the row {string} and press Enter', enterOnRow);
    Then('only the row {string} is highlighted in the table', onlyRow);
    And('only the polygon of {string} is highlighted on the map', onlyPolygon);
    And('the map view frames the extent of {string}', framesDemand);
  });

  ScenarioOutline(
    'A second selection replaces the first, wherever each was made',
    ({ Given, When, Then, And }, vars) => {
      Given(SHOWS_THREE, showsThree);
      When('I click the <first> of {string}', clickWhere(vars.first));
      And('I click the <second> of {string}', clickWhere(vars.second));
      Then('only the row {string} is highlighted in the table', onlyRow);
      And('only the polygon of {string} is highlighted on the map', onlyPolygon);
    },
  );

  Scenario('Clicking the selected row again keeps it selected', ({ Given, When, Then, And }) => {
    Given(SHOWS_THREE, showsThree);
    And('I clicked the row {string} and then panned the map away', clickRowThenPan);
    When('I click the row {string} in the table', clickRow);
    Then('only the row {string} is highlighted in the table', onlyRow);
    And('the map view frames the extent of {string}', framesDemand);
  });

  Scenario('Clicking where two polygons overlap selects the one listed later', ({ Given, When, Then, And }) => {
    Given('/demands shows {string} and then {string}, whose polygons overlap', showsOverlapping);
    When('I click the map where both polygons cover the point', clickOverlap);
    Then('only the row {string} is highlighted in the table', onlyRow);
    And('only the polygon of {string} is highlighted on the map', onlyPolygon);
  });

  Scenario('Rows that share a name are told apart', ({ Given, When, Then, And }) => {
    Given(
      '/demands shows two demands named {string}, the first for {string} and the second for {string}',
      showsTwoDepots,
    );
    When('I click the row {string} for {string}', clickRowFor);
    Then('only the row {string} for {string} is highlighted in the table', onlyRow);
    And('only the polygon of the {string} for {string} is highlighted on the map', onlyPolygon);
  });
});
