import fc from 'fast-check';
import { expect, it } from 'vitest';

import type { Position } from '@app/domain';
import { MAX_ZOOM, MIN_ZOOM } from '../constants.ts';
import { lonLatAt, type MapView, panBy, project, toPixel, unproject, zoomBy } from './map-view.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

const DIGITS = 6;
const size = { width: 800, height: 600 };

const position = fc.tuple(
  fc.double({ min: -180, max: 180, noNaN: true }),
  fc.double({ min: -85, max: 85, noNaN: true }),
) as fc.Arbitrary<Position>;
const zoom = fc.double({ min: MIN_ZOOM, max: MAX_ZOOM, noNaN: true });
const view: fc.Arbitrary<MapView> = fc.record({
  center: position.map((p) => project(p)),
  zoom,
});
const pixel = fc.tuple(
  fc.double({ min: -1000, max: 1000, noNaN: true }),
  fc.double({ min: -1000, max: 1000, noNaN: true }),
);

const expectSamePosition = (actual: Position, expected: Position): void => {
  expect(actual[0]).toBeCloseTo(expected[0], DIGITS);
  expect(actual[1]).toBeCloseTo(expected[1], DIGITS);
};

it('unprojecting a projected position gives the position back', () => {
  fc.assert(
    fc.property(position, (p) => {
      expectSamePosition(unproject(project(p)), p);
    }),
  );
});

it('the position under a position’s pixel is that position, at any view', () => {
  fc.assert(
    fc.property(view, position, (v, p) => {
      expectSamePosition(lonLatAt(v, size, toPixel(v, size, project(p))), p);
    }),
  );
});

it('zooming by any number of steps stays within the zoom limits', () => {
  fc.assert(
    fc.property(view, fc.integer({ min: -50, max: 50 }), (v, steps) => {
      const zoomed = zoomBy(v, steps).zoom;

      expect(zoomed).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(zoomed).toBeLessThanOrEqual(MAX_ZOOM);
    }),
  );
});

it('panning and panning back returns to the same centre', () => {
  fc.assert(
    fc.property(view, pixel, (v, [dx, dy]) => {
      const back = panBy(panBy(v, [dx, dy]), [-dx, -dy]);

      expect(back.center[0]).toBeCloseTo(v.center[0], 2);
      expect(back.center[1]).toBeCloseTo(v.center[1], 2);
      expect(back.zoom).toBe(v.zoom);
    }),
  );
});
