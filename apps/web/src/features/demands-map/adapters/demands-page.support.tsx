import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, vi } from 'vitest';

import { DemandsPage } from '../components/index.ts';

/** A demand as the step tables and files describe it, with its area as [west, south, east, north]. */
interface SampleDemand {
  name: string;
  country: string;
  customer: string;
  box: [number, number, number, number];
}

interface Extent {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** What the map shows, read from the attributes it exposes. Points are in Web Mercator metres. */
interface ShownView {
  centerX: number;
  centerY: number;
  zoom: number;
  width: number;
  height: number;
}

const SHIPPED_FILE = resolve(import.meta.dirname, '../../../../public/demands.geojson');
const EARTH_RADIUS_M = 6_378_137;
const TILE_SIZE_PX = 256;
const FRAMED_SHARE = 0.8;

const rectangleOf = ([west, south, east, north]: SampleDemand['box']): number[][] => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
];

/** The demands file (GeoJSON) holding the demands in order. */
const demandsFile = (demands: SampleDemand[]): unknown => ({
  type: 'FeatureCollection',
  features: demands.map(({ name, country, customer, box }) => ({
    type: 'Feature',
    properties: { name, country, customer },
    geometry: { type: 'Polygon', coordinates: [rectangleOf(box)] },
  })),
});

/** Separate boxes in a row along the equator, one per demand. */
const sideBySide = (rows: Omit<SampleDemand, 'box'>[]): SampleDemand[] =>
  rows.map((row, index) => ({ ...row, box: [index * 10, 0, index * 10 + 5, 5] }));

const sample = (name: string, customer: string = 'Acme Energy'): Omit<SampleDemand, 'box'> => ({
  name,
  country: 'Norway',
  customer,
});

const shippedFileText = (): string => readFileSync(SHIPPED_FILE, 'utf8');

/** Replaces fetch: /demands.geojson answers with `respond`. */
const serveDemandsFile = (respond: () => Promise<Response>): void => {
  vi.stubGlobal('fetch', vi.fn(respond));
};

const serveJson = (body: unknown, status: number = 200): void => {
  serveDemandsFile(async () => new Response(JSON.stringify(body), { status }));
};

const openDemandsPage = (): void => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <DemandsPage />
    </QueryClientProvider>,
  );
};

const mapElement = (): Element => screen.getByRole('img', { name: 'Map of demands' });

const shownView = (): ShownView => {
  const map = mapElement();
  const read = (name: string): number => Number(map.getAttribute(`data-${name}`));

  return {
    centerX: read('center-x'),
    centerY: read('center-y'),
    zoom: read('zoom'),
    width: read('width'),
    height: read('height'),
  };
};

const project = ([lon, lat]: [number, number]): [number, number] => [
  (EARTH_RADIUS_M * lon * Math.PI) / 180,
  EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

const metresPerPixel = (view: ShownView): number => (2 * Math.PI * EARTH_RADIUS_M) / TILE_SIZE_PX / 2 ** view.zoom;

/** The client pixel where the map shows a position (the map sits at the page's top-left in the test DOM). */
const pixelOf = (position: [number, number]): { clientX: number; clientY: number } => {
  const view = shownView();
  const [x, y] = project(position);
  const resolution = metresPerPixel(view);

  return {
    clientX: (x - view.centerX) / resolution + view.width / 2,
    clientY: (view.centerY - y) / resolution + view.height / 2,
  };
};

const boxCenter = ({ box: [west, south, east, north] }: SampleDemand): [number, number] => [
  (west + east) / 2,
  (south + north) / 2,
];

const clickMapAt = (position: [number, number]): void => {
  fireEvent.click(mapElement(), pixelOf(position));
};

const panMap = (): void => {
  const map = mapElement();

  fireEvent.pointerDown(map, { clientX: 100, clientY: 100 });
  fireEvent.pointerMove(map, { clientX: 250, clientY: 180 });
  fireEvent.pointerMove(map, { clientX: 300, clientY: 220 });
  fireEvent.pointerUp(map, { clientX: 300, clientY: 220 });
};

const extentOfBoxes = (demands: SampleDemand[]): Extent => ({
  west: Math.min(...demands.map((d) => d.box[0])),
  south: Math.min(...demands.map((d) => d.box[1])),
  east: Math.max(...demands.map((d) => d.box[2])),
  north: Math.max(...demands.map((d) => d.box[3])),
});

/** The view holds the whole extent, and the extent spans at least 80% of its width or of its height. */
const expectFrames = (extent: Extent): void => {
  const view = shownView();
  const resolution = metresPerPixel(view);
  const [west, south] = project([extent.west, extent.south]);
  const [east, north] = project([extent.east, extent.north]);
  const halfWidth = (view.width / 2) * resolution;
  const halfHeight = (view.height / 2) * resolution;
  const share = Math.max((east - west) / (2 * halfWidth), (north - south) / (2 * halfHeight));

  expect(west).toBeGreaterThanOrEqual(view.centerX - halfWidth);
  expect(east).toBeLessThanOrEqual(view.centerX + halfWidth);
  expect(south).toBeGreaterThanOrEqual(view.centerY - halfHeight);
  expect(north).toBeLessThanOrEqual(view.centerY + halfHeight);
  expect(share).toBeGreaterThanOrEqual(FRAMED_SHARE);
};

const bodyRows = (): HTMLElement[] => screen.queryAllByRole('row').filter((row) => row.closest('tbody'));

const highlightedRows = (): number[] =>
  bodyRows().flatMap((row, index) => (row.getAttribute('aria-selected') === 'true' ? [index] : []));

const polygons = (): Element[] => [...mapElement().querySelectorAll('path[data-demand-index]')];

const highlightedPolygons = (): number[] =>
  polygons().flatMap((polygon) =>
    polygon.getAttribute('data-highlighted') === 'true' ? [Number(polygon.getAttribute('data-demand-index'))] : [],
  );

export type { Extent, SampleDemand, ShownView };
export {
  bodyRows,
  boxCenter,
  clickMapAt,
  demandsFile,
  expectFrames,
  extentOfBoxes,
  highlightedPolygons,
  highlightedRows,
  mapElement,
  openDemandsPage,
  panMap,
  polygons,
  sample,
  serveDemandsFile,
  serveJson,
  shippedFileText,
  shownView,
  sideBySide,
};
