import { expect, it } from 'vitest';

import { hasVisibleText, isClosedRing } from './rules.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

it('has no visible text when empty', () => {
  expect(hasVisibleText('')).toBe(false);
});

it('has no visible text when only spaces, tabs and newlines', () => {
  expect(hasVisibleText(' \t\n ')).toBe(false);
});

it('has visible text with one character', () => {
  expect(hasVisibleText('A')).toBe(true);
});

it('has visible text with a character between spaces', () => {
  expect(hasVisibleText('  A  ')).toBe(true);
});

it('a ring that ends at its start is closed', () => {
  expect(
    isClosedRing([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]),
  ).toBe(true);
});

it('a ring whose last longitude differs from the first is open', () => {
  expect(
    isClosedRing([
      [0, 0],
      [1, 0],
      [1, 1],
      [0.5, 0],
    ]),
  ).toBe(false);
});

it('a ring whose last latitude differs from the first is open', () => {
  expect(
    isClosedRing([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0.5],
    ]),
  ).toBe(false);
});

it('a ring whose last altitude differs from the first is open', () => {
  expect(
    isClosedRing([
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 0, 2],
    ]),
  ).toBe(false);
});

it('a ring that ends with an altitude its start does not have is open', () => {
  expect(
    isClosedRing([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0, 0],
    ]),
  ).toBe(false);
});

it('an empty ring is not closed', () => {
  expect(isClosedRing([])).toBe(false);
});
