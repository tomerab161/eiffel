import fc from 'fast-check';
import { expect, it } from 'vitest';

import type { Demand, Position } from '@app/domain';
import { demand, rectangle } from '../demands-map.support.ts';
import { containsPoint, type Selection, selectAtPoint } from './selection.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

const coordinate = fc.integer({ min: -20, max: 20 });
const area: fc.Arbitrary<Demand> = fc
  .tuple(coordinate, coordinate, coordinate, coordinate)
  .map(([a, b, c, d]) =>
    demand('Area', rectangle(Math.min(a, c), Math.min(b, d), Math.max(a, c) + 1, Math.max(b, d) + 1)),
  );
const areas = fc.array(area, { maxLength: 6 });
/** Off the integer grid, so a point never lies on an edge. */
const point = fc.tuple(coordinate, coordinate).map(([x, y]): Position => [x + 0.5, y + 0.5]);

const selectionAmong = (demands: readonly Demand[]): fc.Arbitrary<Selection> =>
  fc.option(fc.nat({ max: Math.max(demands.length - 1, 0) }), { nil: undefined });

it('picking the same point twice selects what picking it once does', () => {
  fc.assert(
    fc.property(
      areas.chain((demands) => fc.tuple(fc.constant(demands), selectionAmong(demands), point)),
      ([demands, current, at]) => {
        const once = selectAtPoint(current, demands, at);

        expect(selectAtPoint(once, demands, at)).toBe(once);
      },
    ),
  );
});

it('picking a point keeps the selection or selects a demand under the point', () => {
  fc.assert(
    fc.property(
      areas.chain((demands) => fc.tuple(fc.constant(demands), selectionAmong(demands), point)),
      ([demands, current, at]) => {
        const next = selectAtPoint(current, demands, at);
        const picked = next === undefined ? undefined : demands[next];

        expect(next === current || (picked !== undefined && containsPoint(picked.polygon, at))).toBe(true);
      },
    ),
  );
});
