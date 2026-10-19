import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import type Feature from 'ol/Feature.js';
import OlPolygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { expect, vi } from 'vitest';

import { DemandsPage } from '../components/index.ts';
import { openLayersMapOf } from '../hooks/index.ts';
import { mapSizeOf } from '../lib/index.ts';

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
  /** Metres per pixel. */
  resolution: number;
  width: number;
  height: number;
}

const SHIPPED_FILE = resolve(import.meta.dirname, '../../../../public/demands.geojson');
const EARTH_RADIUS_M = 6_378_137;
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

/** The OpenLayers map drawn into the map element. The test DOM cannot draw a canvas, so steps read the map's state. */
const olMap = (): OlMap => {
  const map = openLayersMapOf(mapElement());

  if (!map) {
    throw new Error('the map element holds no OpenLayers map');
  }

  return map;
};

/** The size the map frames for: its own, or the default where the test DOM gives it none. */
const mapSize = (map: OlMap): { width: number; height: number } => {
  const [width = 0, height = 0] = map.getSize() ?? [];

  return mapSizeOf(width, height);
};

const shownView = (): ShownView => {
  const map = olMap();
  const view = map.getView();
  const [centerX = Number.NaN, centerY = Number.NaN] = view.getCenter() ?? [];

  return {
    centerX,
    centerY,
    zoom: view.getZoom() ?? Number.NaN,
    resolution: view.getResolution() ?? Number.NaN,
    ...mapSize(map),
  };
};

const project = ([lon, lat]: [number, number]): [number, number] => [
  (EARTH_RADIUS_M * lon * Math.PI) / 180,
  EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

const boxCenter = ({ box: [west, south, east, north] }: SampleDemand): [number, number] => [
  (west + east) / 2,
  (south + north) / 2,
];

/** A click on the map at a position, as OpenLayers reports it once it has turned the pointer into a coordinate. */
const clickMapAt = (position: [number, number]): void => {
  const map = olMap();
  const click = new MapBrowserEvent('click', map, new PointerEvent('click'));

  click.coordinate = project(position);
  act(() => {
    map.dispatchEvent(click);
  });
};

/** Drags the map: the view moves by 200 by 120 pixels, as an OpenLayers drag-pan moves it. */
const panMap = (): void => {
  const view = olMap().getView();
  const [x = 0, y = 0] = view.getCenter() ?? [];
  const resolution = view.getResolution() ?? 1;

  view.setCenter([x - 200 * resolution, y + 120 * resolution]);
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
  const { resolution } = view;
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

/** The demand polygons on the map's vector layers, in the order the map draws them. */
const polygons = (): Feature[] =>
  olMap()
    .getAllLayers()
    .flatMap((layer) => (layer instanceof VectorLayer ? (layer.getSource()?.getFeatures() ?? []) : []))
    .filter((feature) => feature.getGeometry() instanceof OlPolygon);

const highlightedPolygons = (): number[] =>
  polygons().flatMap((polygon) => (polygon.get('highlighted') === true ? [Number(polygon.get('demandIndex'))] : []));

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
