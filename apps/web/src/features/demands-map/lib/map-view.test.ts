import { expect, it } from 'vitest';

import type { Position } from '@app/domain';
import { demand, rectangle } from '../demands-map.support.ts';
import {
  fitExtent,
  initialView,
  lonLatAt,
  panBy,
  polygonPath,
  project,
  resolutionOf,
  toPixel,
  unproject,
  WORLD_VIEW,
  zoomBy,
} from './map-view.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

const HALF_WORLD_M = 20_037_508.342_789_244;
const size = { width: 800, height: 600 };

it('projects the origin to the origin', () => {
  const [x, y] = project([0, 0]);

  expect(x).toBe(0);
  expect(y).toBeCloseTo(0, 6);
});

it('projects the edge of the world to half the world width', () => {
  const [x, y] = project([180, 85.051_128_779_806_59]);

  expect(x).toBeCloseTo(HALF_WORLD_M, 3);
  expect(y).toBeCloseTo(HALF_WORLD_M, 3);
});

it('projects southern and western positions to negative metres', () => {
  const [x, y] = project([-90, -45]);

  expect(x).toBeCloseTo(-HALF_WORLD_M / 2, 3);
  expect(y).toBeCloseTo(-5_621_521.486, 2);
});

it('clamps latitudes beyond the square world to its edge', () => {
  expect(project([0, 90])[1]).toBeCloseTo(HALF_WORLD_M, 3);
  expect(project([0, -90])[1]).toBeCloseTo(-HALF_WORLD_M, 3);
});

it('does not clamp latitudes just inside the square world', () => {
  expect(project([0, 85])[1]).toBeLessThan(HALF_WORLD_M - 1000);
  expect(project([0, -85])[1]).toBeGreaterThan(-HALF_WORLD_M + 1000);
});

it('unprojects back to the same position', () => {
  const [lon, lat] = unproject(project([12.5, -33.25]));

  expect(lon).toBeCloseTo(12.5, 9);
  expect(lat).toBeCloseTo(-33.25, 9);
});

it('shows the whole world in one 256-pixel tile at zoom 0', () => {
  expect(resolutionOf(WORLD_VIEW) * 256).toBeCloseTo(2 * HALF_WORLD_M, 3);
});

it('halves the metres per pixel with each zoom level', () => {
  expect(resolutionOf({ center: [0, 0], zoom: 3 })).toBeCloseTo(resolutionOf(WORLD_VIEW) / 8, 6);
});

it('the world view is centred on 0, 0 at zoom 0', () => {
  expect(WORLD_VIEW).toEqual({ center: [0, 0], zoom: 0 });
});

it('puts the view centre in the middle of the map', () => {
  expect(toPixel({ center: [1000, 2000], zoom: 5 }, size, [1000, 2000])).toEqual([400, 300]);
});

it('puts east to the right and north up', () => {
  const view = { center: [0, 0] as [number, number], zoom: 0 };
  const resolution = resolutionOf(view);
  const [x, y] = toPixel(view, size, [resolution * 10, resolution * 20]);

  expect(x).toBeCloseTo(410, 9);
  expect(y).toBeCloseTo(280, 9);
});

it('reads the position under a pixel', () => {
  const view = { center: project([10, 50]), zoom: 6 };
  const [lon, lat] = lonLatAt(view, size, toPixel(view, size, project([11, 51])));

  expect(lon).toBeCloseTo(11, 9);
  expect(lat).toBeCloseTo(51, 9);
});

it('reads the view centre under the middle pixel', () => {
  const [lon, lat] = lonLatAt({ center: project([10, 50]), zoom: 6 }, size, [400, 300]);

  expect(lon).toBeCloseTo(10, 9);
  expect(lat).toBeCloseTo(50, 9);
});

it('frames an extent around its centre', () => {
  const view = fitExtent({ west: 10, south: 50, east: 12, north: 52 }, size);
  const [south, north] = [project([0, 50])[1], project([0, 52])[1]];

  expect(view.center[0]).toBeCloseTo(project([11, 0])[0], 3);
  expect(view.center[1]).toBeCloseTo((south + north) / 2, 3);
});

it('frames a wide extent edge to edge across the width, inside the padding', () => {
  const view = fitExtent({ west: -40, south: -1, east: 40, north: 1 }, size);
  const width = project([40, 0])[0] - project([-40, 0])[0];

  expect(width / resolutionOf(view)).toBeCloseTo(800 - 2 * 24, 6);
});

it('frames a tall extent edge to edge across the height, inside the padding', () => {
  const view = fitExtent({ west: -1, south: -40, east: 1, north: 40 }, size);
  const height = project([0, 40])[1] - project([0, -40])[1];

  expect(height / resolutionOf(view)).toBeCloseTo(600 - 2 * 24, 6);
});

it('frames a single point at the closest zoom', () => {
  expect(fitExtent({ west: 5, south: 5, east: 5, north: 5 }, size).zoom).toBe(20);
});

it('frames an extent on a map smaller than its padding without breaking', () => {
  expect(Number.isFinite(fitExtent({ west: 0, south: 0, east: 10, north: 10 }, { width: 10, height: 10 }).zoom)).toBe(
    true,
  );
});

it('starts at the world view without demands', () => {
  expect(initialView([], size)).toEqual(WORLD_VIEW);
});

it('starts framing all demands', () => {
  const demands = [demand('a', rectangle(0, 0, 10, 10)), demand('b', rectangle(20, 20, 30, 30))];

  expect(initialView(demands, size)).toEqual(fitExtent({ west: 0, south: 0, east: 30, north: 30 }, size));
});

it('zooms in and out by whole steps', () => {
  expect(zoomBy({ center: [1, 2], zoom: 3.5 }, 1)).toEqual({ center: [1, 2], zoom: 4.5 });
  expect(zoomBy({ center: [1, 2], zoom: 3.5 }, -1)).toEqual({ center: [1, 2], zoom: 2.5 });
});

it('zooms no further out than zoom 0 and no further in than zoom 20', () => {
  expect(zoomBy({ center: [0, 0], zoom: 0.5 }, -1).zoom).toBe(0);
  expect(zoomBy({ center: [0, 0], zoom: 19.5 }, 1).zoom).toBe(20);
});

it('pans so the map follows the pointer', () => {
  const view = { center: [0, 0] as [number, number], zoom: 0 };
  const resolution = resolutionOf(view);
  const panned = panBy(view, [10, 20]);

  expect(panned.zoom).toBe(0);
  expect(panned.center[0]).toBeCloseTo(-10 * resolution, 6);
  expect(panned.center[1]).toBeCloseTo(20 * resolution, 6);
});

it('draws each ring of a polygon as a closed path in pixels', () => {
  const view = { center: [0, 0] as [number, number], zoom: 0 };
  const resolution = resolutionOf(view);
  const ring = (offset: number): Position[] => [
    unproject([offset * resolution, 0]),
    unproject([(offset + 10) * resolution, 0]),
    unproject([(offset + 10) * resolution, 10 * resolution]),
    unproject([offset * resolution, 0]),
  ];

  expect(polygonPath(view, size, [ring(0), ring(100)])).toBe(
    'M400,300L410,300L410,290L400,300Z M500,300L510,300L510,290L500,300Z',
  );
});
