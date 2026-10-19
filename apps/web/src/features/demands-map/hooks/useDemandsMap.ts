import { useState } from 'react';

import type { Demand, Position } from '@app/domain';
import {
  demandExtent,
  fitExtent,
  INITIAL_SELECTION,
  initialView,
  type MapSize,
  type MapView,
  type Pixel,
  panBy,
  type Selection,
  selectAtPoint,
  selectDemand,
  zoomBy,
} from '../lib/index.ts';

interface DemandsMap {
  selection: Selection;
  view: MapView;
  /** Selects a demand from the table and frames the map on it. */
  selectRow: (index: number) => void;
  /** Selects the demand at a point on the map, and returns what is selected afterwards. The view stays. */
  pickAt: (point: Position) => Selection;
  zoom: (steps: number) => void;
  pan: (move: Pixel) => void;
}

/** Thin: holds the selection and the map view. The rules live in lib/. */
const useDemandsMap = (demands: readonly Demand[], size: MapSize): DemandsMap => {
  const [selection, setSelection] = useState<Selection>(INITIAL_SELECTION);
  const [movedView, setMovedView] = useState<MapView | undefined>(undefined);
  const view = movedView ?? initialView(demands, size);

  const selectRow = (index: number): void => {
    const demand = demands.find((_, position) => position === index);

    setSelection(selectDemand(selection, index));

    if (demand) {
      setMovedView(fitExtent(demandExtent(demand), size));
    }
  };

  const pickAt = (point: Position): Selection => {
    const next = selectAtPoint(selection, demands, point);

    setSelection(next);

    return next;
  };

  return {
    selection,
    view,
    selectRow,
    pickAt,
    zoom: (steps) => setMovedView(zoomBy(view, steps)),
    pan: (move) => setMovedView((current) => panBy(current ?? view, move)),
  };
};

export type { DemandsMap };
export { useDemandsMap };
