import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';

import type { Demand, Position } from '@app/domain';
import { demand, rectangle } from './demands-map.support.ts';
import { INITIAL_SELECTION, isSelected, type Selection, selectAtPoint, selectDemand } from './lib/index.ts';

const feature = await loadFeature('apps/web/src/features/demands-map/selection.feature');

// Step bodies are named functions or factories, so each scenario nests only two callbacks deep (max-nested-callbacks).
const world: { demands: Demand[]; selection: Selection } = { demands: [], selection: INITIAL_SELECTION };

// Demand 1 covers x 0–10, demand 2 x 5–15, demand 3 the upper half (y 5–10) of x 7–20.
const threeDemands = (): Demand[] => [
  demand('North Field Survey', rectangle(0, 0, 10, 10)),
  demand('Delta Irrigation', rectangle(5, 0, 15, 10)),
  demand('Harbor Expansion', rectangle(7, 5, 20, 10)),
];

const pointsCoveredBy: Record<string, Position> = {
  'demand 2 only': [12, 2],
  'demands 2 and 3': [12, 7],
  'demands 1, 2 and 3': [8, 7],
  'demand 1 only': [2, 2],
};

/** Steps count demands from 1, the list from 0. */
const indexOf = (demandNumber: number): number => demandNumber - 1;

const givenDemands = (_: unknown, count: number): void => {
  world.demands = threeDemands().slice(0, count);
  world.selection = INITIAL_SELECTION;
};

const givenDepots = (_: unknown, ...[count, first, second, name]: [number, number, number, string]): void => {
  givenDemands(_, count);
  world.demands = world.demands.map((each, index) =>
    [indexOf(first), indexOf(second)].includes(index) ? { ...each, name } : each,
  );
};

const nothingYet = (): void => {
  world.selection = INITIAL_SELECTION;
};

const select = (_: unknown, demandNumber: number): void => {
  world.selection = selectDemand(world.selection, indexOf(demandNumber));
};

const pick =
  (covering: string | undefined): (() => void) =>
  () => {
    const point = pointsCoveredBy[covering ?? ''];

    if (!point) {
      throw new Error(`no point covered by ${covering}`);
    }

    world.selection = selectAtPoint(world.selection, world.demands, point);
  };

const selectedIs = (demandNumber: number, selected: boolean): void => {
  expect(isSelected(world.selection, indexOf(demandNumber))).toBe(selected);
};

const isSelectedStep = (_: unknown, demandNumber: number): void => {
  selectedIs(demandNumber, true);
};

const notSelected = (_: unknown, ...demandNumbers: number[]): void => {
  for (const demandNumber of demandNumbers) {
    selectedIs(demandNumber, false);
  }
};

const resultIs =
  (result: string | undefined): (() => void) =>
  () => {
    selectedIs(Number(/demand (\d+) is selected/.exec(result ?? '')?.[1]), true);
  };

const noneSelected = (): void => {
  expect(world.demands.filter((_, index) => isSelected(world.selection, index))).toEqual([]);
};

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  Scenario('Nothing is selected at first', ({ Given, When, Then }) => {
    Given('{int} demands', givenDemands);
    When('nothing has been selected yet', nothingYet);
    Then('no demand is selected', noneSelected);
  });

  Scenario('Selecting a demand makes it the selected one', ({ Given, When, Then, And }) => {
    Given('{int} demands', givenDemands);
    When('I select demand {int}', select);
    Then('demand {int} is selected', isSelectedStep);
    And('demands {int} and {int} are not selected', notSelected);
  });

  Scenario('Selecting another demand replaces the selection', ({ Given, When, Then, And }) => {
    Given('{int} demands', givenDemands);
    And('demand {int} is selected', select);
    When('I select demand {int}', select);
    Then('demand {int} is selected', isSelectedStep);
    And('demands {int} and {int} are not selected', notSelected);
  });

  Scenario('Selecting the selected demand again keeps it selected', ({ Given, When, Then, And }) => {
    Given('{int} demands', givenDemands);
    And('demand {int} is selected', select);
    When('I select demand {int}', select);
    Then('demand {int} is selected', isSelectedStep);
  });

  ScenarioOutline('Picking a point selects the latest-listed demand under it', ({ Given, When, Then, And }, vars) => {
    Given('{int} demands', givenDemands);
    And('demand {int} is selected', select);
    When('I pick a point covered by <covering>', pick(vars.covering));
    Then('<result>', resultIs(vars.result));
  });

  Scenario('Demands that share a name are told apart', ({ Given, When, Then, And }) => {
    Given('{int} demands, where demands {int} and {int} are both named {string}', givenDepots);
    When('I select demand {int}', select);
    Then('demand {int} is selected', isSelectedStep);
    And('demand {int} is not selected', notSelected);
  });
});
