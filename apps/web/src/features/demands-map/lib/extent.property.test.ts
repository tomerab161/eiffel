import fc from 'fast-check';
import { expect, it } from 'vitest';

import type { Demand } from '@app/domain';
import { demand, rectangle } from '../demands-map.support.ts';
import { demandExtent, extentOfAll } from './extent.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

const lon = fc.integer({ min: -180, max: 180 });
const lat = fc.integer({ min: -90, max: 90 });
const area: fc.Arbitrary<Demand> = fc
  .tuple(lon, lat, lon, lat)
  .map(([a, b, c, d]) => demand('Area', rectangle(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d))));
const areas = fc.array(area, { minLength: 1, maxLength: 8 });

it('the extent of all demands does not depend on their order', () => {
  fc.assert(
    fc.property(areas, (demands) => {
      expect(extentOfAll([...demands].reverse())).toEqual(extentOfAll(demands));
    }),
  );
});

it('the extent of all demands holds each demand’s extent', () => {
  fc.assert(
    fc.property(areas, (demands) => {
      const all = extentOfAll(demands);

      for (const each of demands.map(demandExtent)) {
        expect(all?.west).toBeLessThanOrEqual(each.west);
        expect(all?.south).toBeLessThanOrEqual(each.south);
        expect(all?.east).toBeGreaterThanOrEqual(each.east);
        expect(all?.north).toBeGreaterThanOrEqual(each.north);
      }
    }),
  );
});

it('adding a demand already inside the extent leaves it unchanged', () => {
  fc.assert(
    fc.property(areas, (demands) => {
      expect(extentOfAll([...demands, ...demands])).toEqual(extentOfAll(demands));
    }),
  );
});
