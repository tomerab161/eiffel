import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';

import {
  polygonOf,
  type RawRing,
  rawCollection,
  rawDemand,
  square,
  unquote,
  validProperties,
} from './demands.support.ts';
import { type Demand, DemandCollectionSchema } from './index.ts';

const feature = await loadFeature('packages/domain/src/demands/demands.feature');

// Step bodies are named functions or factories, so each scenario nests only two callbacks deep (max-nested-callbacks).
const world: { input?: unknown; read?: ReturnType<typeof DemandCollectionSchema.safeParse> } = {};

type Row = Record<string, string>;
type Variables = Record<string, string>;

const given =
  (input: unknown): (() => void) =>
  () => {
    world.input = input;
  };

const oneDemand = (demand: unknown): (() => void) => given(rawCollection([demand]));

const withGeometry = (geometry: unknown): (() => void) =>
  oneDemand({ type: 'Feature', properties: validProperties(), geometry });

const withOutline = (outline: RawRing): (() => void) => withGeometry(polygonOf(outline));

const withDemands = (_: unknown, rows: Row[]): void => {
  world.input = rawCollection(rows.map((row) => rawDemand({ properties: { ...row } })));
};

const withExtra = (_: unknown, key: string, value: string): void => {
  world.input = rawCollection([rawDemand({ properties: { ...validProperties(), [key]: value } })]);
};

const read = (): void => {
  world.read = DemandCollectionSchema.safeParse(world.input);
};

const demands = (): Demand[] => {
  if (!world.read?.success) {
    throw new Error(`the collection was rejected: ${world.read?.error?.message}`);
  }

  return world.read.data;
};

const holds = (_: unknown, count: number): void => {
  expect(demands()).toHaveLength(count);
};

const isOutcome =
  (outcome: string | undefined): (() => void) =>
  () => {
    expect(world.read?.success).toBe(outcome === 'accepted');
  };

const rejected = isOutcome('rejected');

const namesInOrder = (_: unknown, first: string, second: string): void => {
  expect(demands().map((demand) => demand.name)).toEqual([first, second]);
};

const keepsEverything = (): void => {
  expect(demands()).toEqual([
    { name: 'North Field Survey', country: 'Norway', customer: 'Acme Energy', polygon: [square(0, 0, 1)] },
    { name: 'Delta Irrigation', country: 'Egypt', customer: 'Nile Farms', polygon: [square(0, 0, 1)] },
  ]);
};

const customersInOrder = (_: unknown, first: string, second: string): void => {
  expect(demands().map((demand) => demand.customer)).toEqual([first, second]);
};

const onlyTheFourDetails = (): void => {
  expect(Object.keys(demands()[0] ?? {}).sort()).toEqual(['country', 'customer', 'name', 'polygon']);
};

const noDemandsRead = (): void => {
  expect(world.read?.data).toBeUndefined();
};

const propertyIs = (variables: Variables): (() => void) =>
  oneDemand(
    rawDemand({ properties: { ...validProperties(), [variables.property ?? '']: unquote(variables.value ?? '') } }),
  );

const propertyMissing = (variables: Variables): (() => void) =>
  oneDemand(
    rawDemand({
      properties: Object.fromEntries(Object.entries(validProperties()).filter(([key]) => key !== variables.property)),
    }),
  );

const shapes: Record<string, unknown> = {
  'a polygon': polygonOf(square(0, 0, 1)),
  'a point': { type: 'Point', coordinates: [0, 0] },
  'a line': {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [1, 1],
    ],
  },
  'a multi-polygon': { type: 'MultiPolygon', coordinates: [[square(0, 0, 1)]] },
  missing: undefined,
};

/** A closed ring of exactly `count` positions (count ≥ 3), the last back at the first. */
const closedRing = (count: string | undefined): RawRing => [
  ...Array.from({ length: Number(count) - 1 }, (_, i): number[] => [i, i * i]),
  [0, 0],
];

/** Four positions whose last is not the first. */
const openRing = (): RawRing => Array.from({ length: 4 }, (_, i): number[] => [i, i * i]);

const outerSquare = (): RawRing => square(0, 0, 10);

const cornerAt = (lon: number, lat: number): RawRing => [
  [lon, lat],
  [0, 0],
  [0, 1],
  [lon, lat],
];

const positionsOfSize = (size: string | undefined): RawRing =>
  square(0, 0, 1).map((position) => [...position, 0, 0].slice(0, Number(size)));

const notCollections: Record<string, unknown> = {
  'a single demand on its own': rawDemand(),
  'a collection without a list of demands': { type: 'FeatureCollection' },
  'a collection whose demands list is not a list': { type: 'FeatureCollection', features: 'North Field Survey' },
  'nothing at all': undefined,
};

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  Scenario('A collection of valid demands is read in order', ({ Given, When, Then, And }) => {
    Given('a collection with the demands:', withDemands);
    When('the collection is read', read);
    Then('it holds {int} demands', holds);
    And('the demands are, in order, {string} then {string}', namesInOrder);
    And('each demand keeps its name, country, customer and polygon', keepsEverything);
  });

  Scenario('An empty collection holds no demands', ({ Given, When, Then }) => {
    Given('a collection with no demands', given(rawCollection([])));
    When('the collection is read', read);
    Then('it holds {int} demands', holds);
  });

  ScenarioOutline("A demand's name, country and customer must have a visible value", ({ Given, When, Then }, vars) => {
    Given('a collection with one demand whose <property> is <value>', propertyIs(vars));
    When('the collection is read', read);
    Then('the collection is <outcome>', isOutcome(vars.outcome));
  });

  ScenarioOutline('A demand without a name, country or customer is rejected', ({ Given, When, Then }, vars) => {
    Given('a collection with one demand that has no <property>', propertyMissing(vars));
    When('the collection is read', read);
    Then('the collection is rejected', rejected);
  });

  Scenario('A demand whose name is not text is rejected', ({ Given, When, Then }) => {
    Given(
      'a collection with one demand whose name is the number 42',
      oneDemand(rawDemand({ properties: { ...validProperties(), name: 42 } })),
    );
    When('the collection is read', read);
    Then('the collection is rejected', rejected);
  });

  Scenario('Extra details on a demand are ignored', ({ Given, When, Then, And }) => {
    Given('a collection with one valid demand that also has a {string} of {string}', withExtra);
    When('the collection is read', read);
    Then('it holds {int} demand', holds);
    And('that demand has only a name, a country, a customer and a polygon', onlyTheFourDetails);
  });

  ScenarioOutline("Only a polygon describes a demand's area", ({ Given, When, Then }, vars) => {
    Given('a collection with one demand whose area is <shape>', withGeometry(shapes[vars.shape ?? '']));
    When('the collection is read', read);
    Then('the collection is <outcome>', isOutcome(vars.outcome));
  });

  ScenarioOutline("A polygon's outline needs at least four positions", ({ Given, When, Then }, vars) => {
    Given(
      'a collection with one demand whose closed outline has <count> positions',
      withOutline(closedRing(vars.count)),
    );
    When('the collection is read', read);
    Then('the collection is <outcome>', isOutcome(vars.outcome));
  });

  Scenario('An outline that does not end where it starts is rejected', ({ Given, When, Then }) => {
    Given(
      'a collection with one demand whose outline has 4 positions and ends away from its start',
      withOutline(openRing()),
    );
    When('the collection is read', read);
    Then('the collection is rejected', rejected);
  });

  Scenario('A polygon with no outline is rejected', ({ Given, When, Then }) => {
    Given('a collection with one demand whose polygon has no outline', withGeometry(polygonOf()));
    When('the collection is read', read);
    Then('the collection is rejected', rejected);
  });

  Scenario('A polygon with a hole is accepted', ({ Given, When, Then }) => {
    Given(
      'a collection with one demand whose polygon has an outline and one closed hole inside it',
      withGeometry(polygonOf(outerSquare(), square(2, 2, 1))),
    );
    When('the collection is read', read);
    Then('it holds {int} demand', holds);
  });

  ScenarioOutline('A hole needs at least four positions, like the outline', ({ Given, When, Then }, vars) => {
    Given(
      'a collection with one demand whose polygon has a valid outline and a closed hole of <count> positions',
      withGeometry(polygonOf(outerSquare(), closedRing(vars.count))),
    );
    When('the collection is read', read);
    Then('the collection is <outcome>', isOutcome(vars.outcome));
  });

  Scenario('A hole that does not end where it starts is rejected', ({ Given, When, Then }) => {
    Given(
      'a collection with one demand whose polygon has a valid outline and a hole of 4 positions that ends away from its start',
      withGeometry(polygonOf(outerSquare(), openRing())),
    );
    When('the collection is read', read);
    Then('the collection is rejected', rejected);
  });

  ScenarioOutline('Longitude stays between -180 and 180', ({ Given, When, Then }, vars) => {
    Given(
      'a collection with one demand whose outline has a corner at longitude <longitude>',
      withOutline(cornerAt(Number(vars.longitude), 0)),
    );
    When('the collection is read', read);
    Then('the collection is <outcome>', isOutcome(vars.outcome));
  });

  ScenarioOutline('Latitude stays between -90 and 90', ({ Given, When, Then }, vars) => {
    Given(
      'a collection with one demand whose outline has a corner at latitude <latitude>',
      withOutline(cornerAt(0, Number(vars.latitude))),
    );
    When('the collection is read', read);
    Then('the collection is <outcome>', isOutcome(vars.outcome));
  });

  ScenarioOutline('A position is a longitude, a latitude and an optional altitude', ({ Given, When, Then }, vars) => {
    Given(
      'a collection with one demand whose positions each have <size> numbers',
      withOutline(positionsOfSize(vars.size)),
    );
    When('the collection is read', read);
    Then('the collection is <outcome>', isOutcome(vars.outcome));
  });

  Scenario('One invalid demand rejects the whole collection', ({ Given, When, Then, And }) => {
    Given(
      'a collection with 2 valid demands and a third whose name is ""',
      given(rawCollection([rawDemand(), rawDemand(), rawDemand({ properties: { ...validProperties(), name: '' } })])),
    );
    When('the collection is read', read);
    Then('the collection is rejected', rejected);
    And('no demands are read from it', noDemandsRead);
  });

  ScenarioOutline('Something that is not a collection of demands is rejected', ({ Given, When, Then }, vars) => {
    Given('<input>', given(notCollections[vars.input ?? '']));
    When('the collection is read', read);
    Then('the collection is rejected', rejected);
  });

  Scenario('Demands may share a name', ({ Given, When, Then, And }) => {
    Given('a collection with the demands:', withDemands);
    When('the collection is read', read);
    Then('it holds {int} demands', holds);
    And('the first is for {string} and the second for {string}', customersInOrder);
  });
});
