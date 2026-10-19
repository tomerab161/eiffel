import { DRAG_THRESHOLD_PX } from '../constants.ts';
import type { Pixel } from './map-view.ts';

/** A press on the map: where it began, where the pointer was last, and whether it has become a pan. */
interface Drag {
  start: Pixel;
  last: Pixel;
  panning: boolean;
}

interface DragMove {
  drag: Drag;
  /** How far to move the map's content, or undefined while the press is still a click. */
  pan: Pixel | undefined;
}

const startDrag = (pointer: Pixel): Drag => ({ start: pointer, last: pointer, panning: false });

/** A press becomes a pan once the pointer goes further than the threshold, and stays one until released. */
const moveDrag = (drag: Drag, pointer: Pixel): DragMove => {
  const panning =
    drag.panning || Math.hypot(pointer[0] - drag.start[0], pointer[1] - drag.start[1]) > DRAG_THRESHOLD_PX;

  return {
    drag: { ...drag, last: panning ? pointer : drag.last, panning },
    pan: panning ? [pointer[0] - drag.last[0], pointer[1] - drag.last[1]] : undefined,
  };
};

export type { Drag, DragMove };
export { moveDrag, startDrag };
