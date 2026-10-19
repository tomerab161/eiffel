import { DEFAULT_MAP_SIZE, EMPTY_TEXT, ERROR_TEXT, LOADING_TEXT } from '../constants.ts';

/** The map's size in pixels. */
interface MapSize {
  width: number;
  height: number;
}

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

export type { MapSize };
export { demandsMessage, mapSizeOf, rowKeys };
