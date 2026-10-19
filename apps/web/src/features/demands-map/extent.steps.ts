import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';

import type { Demand } from '@app/domain';
import { demand, positionsIn } from './demands-map.support.ts';
import { demandExtent, type Extent, extentOfAll } from './lib/index.ts';

const feature = await loadFeature('apps/web/src/features/demands-map/extent.feature');

// Step bodies are named functions or factories, so each scenario nests only two callbacks deep (max-nested-callbacks).
const world: { demands: Demand[]; extent?: Extent | undefined } = { demands: [] };

const OUTLINE_A = 'a demand whose outline runs through (10, 50), (13, 51), (12, 53), (9, 52) and back to (10, 50)';
const OUTLINE_SQUARE = 'a demand whose outline runs through (0, 0), (4, 0), (4, 4), (0, 4) and back to (0, 0)';
const HOLE = 'the demand has a hole running through (1, 1), (2, 1), (2, 2), (1, 2) and back to (1, 1)';
const OUTLINE_NORTH = 'a demand whose outline runs through (10, 50), (12, 50), (12, 52), (10, 52) and back to (10, 50)';
const OUTLINE_SOUTH = 'a demand whose outline runs through (-5, 30), (-3, 30), (-3, 31), (-5, 31) and back to (-5, 30)';

const startFresh = (): void => {
  world.demands = [];
  world.extent = undefined;
};

const addDemand =
  (text: string): (() => void) =>
  () => {
    world.demands.push(demand(`demand ${world.demands.length + 1}`, positionsIn(text)));
  };

const addHole =
  (text: string): (() => void) =>
  () => {
    world.demands.at(-1)?.polygon.push(positionsIn(text));
  };

const askOne = (): void => {
  const [only] = world.demands;

  world.extent = only && demandExtent(only);
};

const askAll = (): void => {
  world.extent = extentOfAll(world.demands);
};

const extentIs = (_: unknown, ...[west, east, south, north]: [number, number, number, number]): void => {
  expect(world.extent).toEqual({ west, south, east, north });
};

const noExtent = (): void => {
  expect(world.extent).toBeUndefined();
};

const EXTENT_IS = 'the extent runs from longitude {int} to {int} and from latitude {int} to {int}';

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  BeforeEachScenario(startFresh);

  Scenario('The extent of one demand is the box around its outline', ({ Given, When, Then }) => {
    Given(OUTLINE_A, addDemand(OUTLINE_A));
    When('I ask for its extent', askOne);
    Then(EXTENT_IS, extentIs);
  });

  Scenario("A hole does not change a demand's extent", ({ Given, And, When, Then }) => {
    Given(OUTLINE_SQUARE, addDemand(OUTLINE_SQUARE));
    And(HOLE, addHole(HOLE));
    When('I ask for its extent', askOne);
    Then(EXTENT_IS, extentIs);
  });

  Scenario('The extent of all demands holds every demand', ({ Given, And, When, Then }) => {
    Given(OUTLINE_NORTH, addDemand(OUTLINE_NORTH));
    And(OUTLINE_SOUTH, addDemand(OUTLINE_SOUTH));
    When('I ask for the extent of all demands', askAll);
    Then(EXTENT_IS, extentIs);
  });

  Scenario('Without demands there is no extent', ({ Given, When, Then }) => {
    Given('no demands', startFresh);
    When('I ask for the extent of all demands', askAll);
    Then('there is no extent', noExtent);
  });
});
