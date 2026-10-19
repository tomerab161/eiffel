import { expect, it } from 'vitest';

import { demand, rectangle } from '../demands-map.support.ts';
import { containsPoint, INITIAL_SELECTION, isSelected, pickDemand, selectAtPoint, selectDemand } from './selection.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

const square = demand('square', rectangle(0, 0, 10, 10));
const withHole = demand('with hole', rectangle(0, 0, 10, 10), [rectangle(4, 4, 6, 6)]);
const triangle = demand('triangle', [
  [0, 0],
  [10, 0],
  [0, 10],
  [0, 0],
]);

it('selects nothing at first', () => {
  expect(isSelected(INITIAL_SELECTION, 0)).toBe(false);
});

it('selecting a demand selects that one only', () => {
  const selection = selectDemand(INITIAL_SELECTION, 1);

  expect([0, 1, 2].map((index) => isSelected(selection, index))).toEqual([false, true, false]);
});

it('selecting another demand replaces the selection', () => {
  const selection = selectDemand(selectDemand(INITIAL_SELECTION, 0), 2);

  expect([0, 1, 2].map((index) => isSelected(selection, index))).toEqual([false, false, true]);
});

it('selecting the selected demand keeps it selected', () => {
  expect(isSelected(selectDemand(selectDemand(INITIAL_SELECTION, 1), 1), 1)).toBe(true);
});

it.each([
  [[5, 5], true],
  [[9.99, 5], true],
  [[10.01, 5], false],
  [[0.01, 5], true],
  [[-0.01, 5], false],
  [[5, 9.99], true],
  [[5, 10.01], false],
  [[5, 0.01], true],
  [[5, -0.01], false],
])('a square covers %j: %s', (point, covered) => {
  expect(containsPoint(square.polygon, point as [number, number])).toBe(covered);
});

it.each([
  [[1, 1], true],
  [[4.9, 4.9], true],
  [[5.1, 5.1], false],
])('a slanted edge covers %j: %s', (point, covered) => {
  expect(containsPoint(triangle.polygon, point as [number, number])).toBe(covered);
});

const raisedTriangle = demand('raised triangle', [
  [0, 2],
  [10, 2],
  [0, 12],
  [0, 2],
]);

it.each([
  [[4.9, 6.9], true],
  [[5.1, 7.1], false],
])('a slanted edge away from the equator covers %j: %s', (point, covered) => {
  expect(containsPoint(raisedTriangle.polygon, point as [number, number])).toBe(covered);
});

const notchedFromAbove = demand('notched from above', [
  [0, 0],
  [10, 0],
  [10, 10],
  [6, 5],
  [0, 10],
  [0, 0],
]);
const notchedFromBelow = demand('notched from below', [
  [0, 0],
  [6, 5],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
]);

it.each([
  ['above', notchedFromAbove],
  ['below', notchedFromBelow],
])('an outline notched from %s covers a point level with the notch corner', (_, notched) => {
  expect(containsPoint(notched.polygon, [2, 5])).toBe(true);
});

it('a point on the west border of a demand is covered, on its east border it is not', () => {
  expect([containsPoint(square.polygon, [0, 5]), containsPoint(square.polygon, [10, 5])]).toEqual([true, false]);
});

it('a point on the border two neighbouring demands share is picked for the eastern one', () => {
  const west = demand('west', rectangle(0, 0, 10, 10));
  const east = demand('east', rectangle(10, 0, 20, 10));

  expect(pickDemand([east, west], [10, 5])).toBe(0);
});

it.each([
  [[5, 5], false],
  [[3.99, 5], true],
  [[4.01, 5], false],
  [[6.01, 5], true],
  [[2, 2], true],
])('a polygon with a hole covers %j: %s', (point, covered) => {
  expect(containsPoint(withHole.polygon, point as [number, number])).toBe(covered);
});

it('picks nothing where no demand lies', () => {
  expect(pickDemand([square], [20, 20])).toBeUndefined();
});

it('picks the only demand under the point', () => {
  expect(pickDemand([demand('far', rectangle(50, 50, 60, 60)), square], [5, 5])).toBe(1);
});

it('picks the latest-listed of several demands under the point', () => {
  expect(pickDemand([square, square, demand('far', rectangle(50, 50, 60, 60))], [5, 5])).toBe(1);
});

it('picks the first demand when only it lies under the point', () => {
  expect(pickDemand([square, demand('far', rectangle(50, 50, 60, 60))], [5, 5])).toBe(0);
});

it('selecting at a point selects the demand picked there', () => {
  expect(selectAtPoint(0, [square, square], [5, 5])).toBe(1);
});

it('selecting at a point with no demand keeps the selection', () => {
  expect(selectAtPoint(0, [square, square], [50, 50])).toBe(0);
});
