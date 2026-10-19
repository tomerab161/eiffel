import fc from 'fast-check';
import { expect, it } from 'vitest';

import { type Drag, moveDrag, startDrag } from './drag.ts';
import type { Pixel } from './map-view.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

const pointer: fc.Arbitrary<Pixel> = fc.tuple(fc.integer({ min: -500, max: 500 }), fc.integer({ min: -500, max: 500 }));
const press = fc.tuple(pointer, fc.array(pointer, { minLength: 1, maxLength: 12 }));

/** The drag after each move of a press, and the pans the moves asked for. */
interface Replay {
  drags: Drag[];
  pans: Pixel[];
}

const step = ({ drags, pans }: Replay, move: Pixel): Replay => {
  const current = drags.at(-1);
  const moved = current ? moveDrag(current, move) : { drag: startDrag(move), pan: undefined };

  return { drags: [...drags, moved.drag], pans: moved.pan ? [...pans, moved.pan] : pans };
};

const replay = (start: Pixel, moves: readonly Pixel[]): Replay =>
  moves.reduce(step, { drags: [startDrag(start)], pans: [] });

const isPanning = (drag: Drag): boolean => drag.panning;

const add = ([x, y]: Pixel, [dx, dy]: Pixel): Pixel => [x + dx, y + dy];

it('once a press becomes a pan it stays one', () => {
  fc.assert(
    fc.property(press, ([start, moves]) => {
      const panning = replay(start, moves).drags.map(isPanning);
      const first = panning.indexOf(true);

      expect(first === -1 || panning.slice(first).every(Boolean)).toBe(true);
    }),
  );
});

it('the pans of a press add up to how far the pointer moved since it was pressed', () => {
  fc.assert(
    fc.property(press, ([start, moves]) => {
      const { drags, pans } = replay(start, moves);
      const last = drags.at(-1) ?? startDrag(start);
      const expected: Pixel = last.panning ? [last.last[0] - start[0], last.last[1] - start[1]] : [0, 0];

      expect(pans.reduce(add, [0, 0])).toEqual(expected);
    }),
  );
});
