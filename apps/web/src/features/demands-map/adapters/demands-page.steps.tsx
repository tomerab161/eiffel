import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { cleanup, screen } from '@testing-library/react';
import { expect, vi } from 'vitest';

import { type Demand, DemandCollectionSchema } from '@app/domain';
import {
  bodyRows,
  demandsFile,
  expectFrames,
  extentOfBoxes,
  highlightedPolygons,
  highlightedRows,
  mapElement,
  openDemandsPage,
  polygons,
  type SampleDemand,
  serveDemandsFile,
  serveJson,
  shippedFileText,
  shownView,
  sideBySide,
} from './demands-page.support.tsx';

const feature = await loadFeature('apps/web/src/features/demands-map/adapters/demands-page.feature');

// Step bodies are named functions or factories, so each scenario nests only two callbacks deep (max-nested-callbacks).
const world: { served: SampleDemand[]; read: Demand[] } = { served: [], read: [] };

type Row = { name: string; country: string; customer: string };

const SAMPLE_ROWS: Row[] = [
  { name: 'North Field Survey', country: 'Norway', customer: 'Acme Energy' },
  { name: 'Delta Irrigation', country: 'Egypt', customer: 'Nile Farms' },
  { name: 'Harbor Expansion', country: 'Netherlands', customer: 'Port Logistics' },
];

const serve = (rows: Row[]): void => {
  world.served = sideBySide(rows);
  serveJson(demandsFile(world.served));
};

const holdsTable = (_: unknown, rows: Row[]): void => {
  serve(rows);
};

const holdsCount = (_: unknown, count: number): void => {
  serve(SAMPLE_ROWS.slice(0, count));
};

const notAnswered = (): void => {
  serveDemandsFile(() => new Promise<Response>(() => undefined));
};

const holdsNoDemands = (): void => {
  serve([]);
};

const problems: Record<string, () => void> = {
  'answers with status 404': () => serveJson({ message: 'Not Found' }, 404),
  'answers with status 500': () => serveJson({ message: 'Internal Server Error' }, 500),
  'cannot be reached and the request fails with no answer': () =>
    serveDemandsFile(() => Promise.reject(new TypeError('Failed to fetch'))),
  'answers with a body that is not JSON': () =>
    serveDemandsFile(async () => new Response('<html>not json</html>', { status: 200 })),
  'holds 2 valid demands and one with an empty name': () =>
    serveJson(demandsFile(sideBySide([...SAMPLE_ROWS.slice(0, 2), { ...SAMPLE_ROWS[0], name: '' } as Row]))),
};

const hasProblem =
  (problem: string | undefined): (() => void) =>
  () => {
    const serveProblem = problems[problem ?? ''];

    if (!serveProblem) {
      throw new Error(`unknown problem: ${problem}`);
    }

    serveProblem();
  };

const shippedFile = (): void => {
  const text = shippedFileText();

  serveDemandsFile(async () => new Response(text, { status: 200 }));
};

const open = async (): Promise<void> => {
  openDemandsPage();
  await screen.findByRole('img', { name: 'Map of demands' });
};

const openAndWait = async (): Promise<void> => {
  await open();
  await vi.waitFor(() => {
    expect(screen.queryByText('Loading demands…')).toBeNull();
  });
};

const openInWindow = async (_: unknown, width: number, height: number): Promise<void> => {
  (window as unknown as { happyDOM: { setViewport: (size: object) => void } }).happyDOM.setViewport({ width, height });
  await openAndWait();
};

const seeText = async (_: unknown, text: string): Promise<void> => {
  expect(await screen.findByText(text)).toBeDefined();
};

const columnsAre = (_: unknown, ...names: string[]): void => {
  expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(names);
};

const rowCells = (): string[][] =>
  bodyRows().map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? ''));

const rowsInOrder = (_: unknown, ...names: string[]): void => {
  expect(rowCells()).toEqual(
    names.map((name) => {
      const served = world.served.find((demand) => demand.name === name);

      return [name, served?.country, served?.customer];
    }),
  );
};

const showsPolygons = (_: unknown, count: number): void => {
  expect(polygons()).toHaveLength(count);
};

const noPolygons = (): void => {
  expect(polygons()).toHaveLength(0);
};

const noRows = (): void => {
  expect(bodyRows()).toHaveLength(0);
};

const noRowHighlighted = (): void => {
  expect(highlightedRows()).toEqual([]);
};

const noPolygonHighlighted = (): void => {
  expect(highlightedPolygons()).toEqual([]);
};

const framesAll = (_: unknown, count: number): void => {
  expect(world.served).toHaveLength(count);
  expectFrames(extentOfBoxes(world.served));
};

const worldView = (): void => {
  expect(shownView()).toMatchObject({ centerX: 0, centerY: 0, zoom: 0 });
};

const style = (element: Element | null): CSSStyleDeclaration => {
  if (!element) {
    throw new Error('element not found');
  }

  return window.getComputedStyle(element);
};

const scrollArea = (): Element | null => screen.getByRole('table').closest('[data-table-scroll-area]');

const sideBySideLayout = (): void => {
  const layout = mapElement().closest('[data-layout]');
  const parts = [...(layout?.children ?? [])];

  expect(style(layout).display).toBe('flex');
  expect(style(layout).flexDirection).toBe('row');
  expect(parts.some((part) => part.contains(mapElement()))).toBe(true);
  expect(parts).toContain(scrollArea());
};

const ownScrollArea = (_: unknown, count: number): void => {
  const rowHeight = Number.parseFloat(style(bodyRows()[0] ?? null).height);

  expect(bodyRows()).toHaveLength(count);
  expect(style(scrollArea()).overflowY).toBe('auto');
  expect(style(scrollArea()).minHeight).toBe('0px');
  expect(rowHeight * count).toBeGreaterThan(window.innerHeight);
};

const pageDoesNotScroll = (): void => {
  const page = screen.getByRole('main');

  const { position, top, right, bottom, left, overflow } = style(page);

  expect({ position, top, right, bottom, left, overflow }).toEqual({
    position: 'fixed',
    top: '0px',
    right: '0px',
    bottom: '0px',
    left: '0px',
    overflow: 'hidden',
  });
};

const listsCount = (_: unknown, count: number): void => {
  expect(bodyRows()).toHaveLength(count);
};

const rowIs =
  (which: 'first' | 'last'): ((_: unknown, ...cells: string[]) => void) =>
  (_: unknown, ...cells: string[]) => {
    expect(which === 'first' ? rowCells()[0] : rowCells().at(-1)).toEqual(cells);
  };

const readShippedFile = (): void => {
  world.read = DemandCollectionSchema.parse(JSON.parse(shippedFileText()));
};

/** Each side runs along a meridian or a parallel: exactly one of the two coordinates changes. */
const isAxisAligned = (from: number[], to: number[] | undefined): boolean =>
  (from[0] === to?.[0]) !== (from[1] === to?.[1]);

/** Four distinct corners on two longitudes and two latitudes, joined side by side and closed back to the first. */
const isRectangle = (ring: number[][]): boolean => {
  const corners = new Set(ring.slice(0, 4).map((position) => position.join(',')));
  const sides = ring.slice(0, 4).every((position, index) => isAxisAligned(position, ring[index + 1]));

  return (
    ring.length === 5 &&
    ring[4]?.join(',') === ring[0]?.join(',') &&
    corners.size === 4 &&
    new Set(ring.map((position) => position[0])).size === 2 &&
    new Set(ring.map((position) => position[1])).size === 2 &&
    sides
  );
};

const allRectangles = (): void => {
  expect(world.read).toHaveLength(20);
  expect(
    world.read.filter((demand) => demand.polygon.length === 1 && isRectangle(demand.polygon[0] ?? [])),
  ).toHaveLength(20);
};

type Box = [west: number, south: number, east: number, north: number];

const boxOf = (demand: Demand): Box => {
  const ring = demand.polygon[0] ?? [];
  const lons = ring.map((position) => position[0]);
  const lats = ring.map((position) => position[1]);

  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
};

/** Boxes that touch count as overlapping too: the sample rectangles must stand apart. */
const overlap = ([aw, as, ae, an]: Box, [bw, bs, be, bn]: Box): boolean => aw <= be && bw <= ae && as <= bn && bs <= an;

const noneOverlap = (): void => {
  const boxes = world.read.map(boxOf);
  const overlapping = boxes.flatMap((box, i) => boxes.slice(i + 1).filter((other) => overlap(box, other)));

  expect(overlapping).toEqual([]);
};

const cleanUp = (): void => {
  cleanup();
  vi.unstubAllGlobals();
};

describeFeature(feature, ({ Scenario, ScenarioOutline, AfterEachScenario }) => {
  AfterEachScenario(cleanUp);

  Scenario('Every demand is listed in file order and drawn on the map', ({ Given, When, Then, And }) => {
    Given('/demands.geojson holds the valid demands:', holdsTable);
    When('I open /demands', openAndWait);
    Then('the table has the columns {string}, {string} and {string}', columnsAre);
    And('the table rows are, in order, {string}, {string} and {string} with their country and customer', rowsInOrder);
    And('the map shows {int} demand polygons', showsPolygons);
  });

  Scenario('Nothing is highlighted at first and the map frames all demands', ({ Given, When, Then, And }) => {
    Given('/demands.geojson holds {int} valid demands', holdsCount);
    When('I open /demands', openAndWait);
    Then('no table row is highlighted', noRowHighlighted);
    And('no polygon is highlighted on the map', noPolygonHighlighted);
    And('the map view frames the extent of all {int} demands', framesAll);
  });

  Scenario('The page says it is loading until the file arrives', ({ Given, When, Then }) => {
    Given('/demands.geojson has not answered yet', notAnswered);
    When('I open /demands', open);
    Then('I see {string}', seeText);
  });

  Scenario('An empty file shows an empty table and the world view', ({ Given, When, Then, And }) => {
    Given('/demands.geojson holds a collection with no demands', holdsNoDemands);
    When('I open /demands', open);
    Then('I see {string}', seeText);
    And('the map shows no demand polygons', noPolygons);
    And('the map shows the world view', worldView);
  });

  ScenarioOutline('A file that cannot be used shows an error and no demands', ({ Given, When, Then, And }, vars) => {
    Given('/demands.geojson <problem>', hasProblem(vars.problem));
    When('I open /demands', open);
    Then('I see {string}', seeText);
    And('the table has no rows', noRows);
    And('the map shows no demand polygons', noPolygons);
  });

  Scenario('The table scrolls on its own beside the map', ({ Given, When, Then, And }) => {
    Given('the demands file that ships with the web app', shippedFile);
    When('I open /demands in a window {int} pixels wide and {int} pixels tall', openInWindow);
    Then('the map and the table sit side by side', sideBySideLayout);
    And('the table is its own scroll area that shows fewer than all {int} rows at once', ownScrollArea);
    And('the page itself does not scroll', pageDoesNotScroll);
  });

  Scenario('The shipped demands file holds the sample demands', ({ Given, When, Then, And }) => {
    Given('the demands file that ships with the web app', shippedFile);
    When('I open /demands', openAndWait);
    Then('the table lists {int} demands', listsCount);
    And('the first row is {string}, {string}, {string}', rowIs('first'));
    And('the last row is {string}, {string}, {string}', rowIs('last'));
  });

  Scenario('The shipped sample polygons are separate rectangles', ({ Given, When, Then, And }) => {
    Given('the demands file that ships with the web app', shippedFile);
    When('the file is read', readShippedFile);
    Then("every demand's outline is a rectangle of 4 corners, closed back to its first corner", allRectangles);
    And('no two demands overlap', noneOverlap);
  });
});
