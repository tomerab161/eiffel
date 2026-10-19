import { type PointerEvent, useRef } from 'react';

import { type Drag, moveDrag, type Pixel, startDrag } from '../lib/index.ts';

interface DragPan {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  /** Whether the last press moved the map, so its click is not a pick. */
  wasPan: () => boolean;
}

const pointerOf = (event: PointerEvent): Pixel => [event.clientX, event.clientY];

/** Thin: turns pointer presses into pans. When a press becomes a pan lives in lib/drag.ts. */
const useDragPan = (pan: (move: Pixel) => void): DragPan => {
  const drag = useRef<Drag | undefined>(undefined);
  const lastWasPan = useRef(false);

  const onPointerMove = (event: PointerEvent): void => {
    const moved = drag.current && moveDrag(drag.current, pointerOf(event));

    drag.current = moved?.drag;

    if (moved?.pan) {
      pan(moved.pan);
    }
  };

  const release = (): void => {
    lastWasPan.current = drag.current?.panning ?? false;
    drag.current = undefined;
  };

  return {
    onPointerDown: (event) => {
      drag.current = startDrag(pointerOf(event));
      lastWasPan.current = false;
    },
    onPointerMove,
    onPointerUp: release,
    onPointerLeave: release,
    wasPan: () => lastWasPan.current,
  };
};

export type { DragPan };
export { useDragPan };
