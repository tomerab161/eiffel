import { expect, it } from 'vitest';

import { demandsMessage, mapSizeOf, rowKeys, zoomStepsForKey } from './page.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

it('says it is loading until the file arrives', () => {
  expect(demandsMessage({ isPending: true, isError: false, count: 0 })).toBe('Loading demands…');
});

it('says the demands could not be loaded on an error', () => {
  expect(demandsMessage({ isPending: false, isError: true, count: 0 })).toBe('Demands could not be loaded.');
});

it('says the error rather than loading when both are reported', () => {
  expect(demandsMessage({ isPending: true, isError: true, count: 0 })).toBe('Demands could not be loaded.');
});

it('says there is nothing to show for no demands', () => {
  expect(demandsMessage({ isPending: false, isError: false, count: 0 })).toBe('No demands to show');
});

it('says nothing when there is one demand or more', () => {
  expect(demandsMessage({ isPending: false, isError: false, count: 1 })).toBeUndefined();
});

it('uses the measured size of the map', () => {
  expect(mapSizeOf(1, 1)).toEqual({ width: 1, height: 1 });
});

it('falls back to the default size when the map has no width or no height', () => {
  expect(mapSizeOf(0, 300)).toEqual({ width: 800, height: 600 });
  expect(mapSizeOf(300, 0)).toEqual({ width: 800, height: 600 });
});

it.each([
  ['+', 1],
  ['=', 1],
  ['-', -1],
  ['a', undefined],
  ['Enter', undefined],
])('the key %s zooms the map by %s', (key, steps) => {
  expect(zoomStepsForKey(key)).toBe(steps);
});

it('keys rows by their position, so demands with the same name stay apart', () => {
  expect(rowKeys(3)).toEqual(['demand-0', 'demand-1', 'demand-2']);
});
