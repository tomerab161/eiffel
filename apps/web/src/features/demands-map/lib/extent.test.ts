import { expect, it } from 'vitest';

import { demand, rectangle } from '../demands-map.support.ts';
import { demandExtent, extentOfAll } from './extent.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

it('frames one outline by its smallest and largest longitude and latitude', () => {
  const outline = [
    [10, 50],
    [13, 51],
    [12, 53],
    [9, 52],
    [10, 50],
  ] as [number, number][];

  expect(demandExtent(demand('a', outline))).toEqual({ west: 9, south: 50, east: 13, north: 53 });
});

it('ignores holes, even ones reaching past the outline', () => {
  expect(demandExtent(demand('a', rectangle(0, 0, 4, 4), [rectangle(-1, -1, 5, 5)]))).toEqual({
    west: 0,
    south: 0,
    east: 4,
    north: 4,
  });
});

it('ignores altitudes', () => {
  const outline = [
    [1, 2, 900],
    [3, 2, -900],
    [3, 4, 0],
    [1, 2, 900],
  ] as [number, number, number][];

  expect(demandExtent(demand('a', outline))).toEqual({ west: 1, south: 2, east: 3, north: 4 });
});

it('has no extent for no demands', () => {
  expect(extentOfAll([])).toBeUndefined();
});

it('the extent of one demand alone is its own extent', () => {
  expect(extentOfAll([demand('a', rectangle(1, 2, 3, 4))])).toEqual({ west: 1, south: 2, east: 3, north: 4 });
});

it('the extent of all demands holds each of them', () => {
  const demands = [demand('a', rectangle(10, 50, 12, 52)), demand('b', rectangle(-5, 30, -3, 31))];

  expect(extentOfAll(demands)).toEqual({ west: -5, south: 30, east: 12, north: 52 });
});

it('the extent of all demands takes each side from whichever demand reaches furthest', () => {
  const demands = [demand('a', rectangle(0, 0, 10, 1)), demand('b', rectangle(2, -3, 4, 8))];

  expect(extentOfAll(demands)).toEqual({ west: 0, south: -3, east: 10, north: 8 });
});
