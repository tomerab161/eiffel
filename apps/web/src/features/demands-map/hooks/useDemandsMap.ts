import { type RefObject, useState } from 'react';

import type { Demand, Position } from '@app/domain';
import { demandExtent, INITIAL_SELECTION, type Selection, selectAtPoint, selectDemand } from '../lib/index.ts';
import { useOpenLayersMap } from './useOpenLayersMap.ts';

interface DemandsMap {
  selection: Selection;
  /** The element the OpenLayers map draws into. */
  mapRef: RefObject<HTMLDivElement | null>;
  /** Selects a demand from the table and frames the map on it. */
  selectRow: (index: number) => void;
}

/**
 * Thin: holds the selection and wires it to the OpenLayers map. A click on the map selects the demand there (the view
 * stays) and reports what is selected afterwards. The rules live in lib/.
 */
const useDemandsMap = (demands: readonly Demand[], onPicked: (selection: Selection) => void): DemandsMap => {
  const [selection, setSelection] = useState<Selection>(INITIAL_SELECTION);

  const pick = (point: Position): void => {
    const next = selectAtPoint(selection, demands, point);

    setSelection(next);
    onPicked(next);
  };

  const { targetRef, frame } = useOpenLayersMap({ demands, selection, onPick: pick });

  const selectRow = (index: number): void => {
    const demand = demands.find((_, position) => position === index);

    setSelection(selectDemand(selection, index));

    if (demand) {
      frame(demandExtent(demand));
    }
  };

  return { selection, mapRef: targetRef, selectRow };
};

export type { DemandsMap };
export { useDemandsMap };
