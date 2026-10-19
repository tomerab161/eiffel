import { DEFAULT_MAP_SIZE, EMPTY_TEXT, ERROR_TEXT, LOADING_TEXT, ZOOM_KEYS } from '../constants.ts';
import type { MapSize } from './map-view.ts';

interface DemandsState {
  isPending: boolean;
  isError: boolean;
  count: number;
}

/** The line the page shows instead of (or with) the table, if any. */
const demandsMessage = ({ isPending, isError, count }: DemandsState): string | undefined =>
  (
    [
      [isError, ERROR_TEXT],
      [isPending, LOADING_TEXT],
      [count === 0, EMPTY_TEXT],
    ] as const
  ).find(([applies]) => applies)?.[1];

/** The map's measured size, or the default where layout gives it none. */
const mapSizeOf = (width: number, height: number): MapSize =>
  width > 0 && height > 0 ? { width, height } : { ...DEFAULT_MAP_SIZE };

/** A demand is known by its position in the list, so rows are keyed by it. */
const rowKeys = (count: number): string[] => Array.from({ length: count }, (_, index) => `demand-${index}`);

/** How many zoom steps a key press on the map asks for, if it is a zoom key. */
const zoomStepsForKey = (key: string): number | undefined => ZOOM_KEYS.get(key);

export { demandsMessage, mapSizeOf, rowKeys, zoomStepsForKey };
