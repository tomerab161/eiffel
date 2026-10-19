import { expect, it } from 'vitest';

import { moveDrag, startDrag } from './drag.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

it('starts without panning', () => {
  expect(startDrag([10, 20])).toEqual({ start: [10, 20], last: [10, 20], panning: false });
});

it('does not pan while the pointer stays within 4 pixels of where it was pressed', () => {
  expect(moveDrag(startDrag([10, 20]), [13, 20])).toEqual({
    drag: { start: [10, 20], last: [10, 20], panning: false },
    pan: undefined,
  });
  expect(moveDrag(startDrag([10, 20]), [10, 24]).pan).toBeUndefined();
});

it('pans by the whole move once the pointer goes further than 4 pixels', () => {
  expect(moveDrag(startDrag([10, 20]), [13, 24])).toEqual({
    drag: { start: [10, 20], last: [13, 24], panning: true },
    pan: [3, 4],
  });
});

it('pans as soon as the pointer goes just past 4 pixels along one axis', () => {
  expect(moveDrag(startDrag([10, 20]), [14.1, 20]).pan).toEqual([4.1, 0]);
  expect(moveDrag(startDrag([10, 20]), [10, 15.9]).pan?.[1]).toBeCloseTo(-4.1, 9);
});

it('keeps panning by each further move, even a small one', () => {
  const { drag } = moveDrag(startDrag([0, 0]), [10, 0]);

  expect(moveDrag(drag, [11, 1])).toEqual({ drag: { start: [0, 0], last: [11, 1], panning: true }, pan: [1, 1] });
});

it('keeps panning when the pointer comes back near where it was pressed', () => {
  const { drag } = moveDrag(startDrag([0, 0]), [10, 0]);

  expect(moveDrag(drag, [1, 0]).pan).toEqual([-9, 0]);
});
