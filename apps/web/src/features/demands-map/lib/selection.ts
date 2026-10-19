import type { Demand, Polygon, Position, Ring } from '@app/domain';

/** The position of the selected demand in the list, or undefined when none is. At most one demand is selected. */
type Selection = number | undefined;

const INITIAL_SELECTION: Selection = undefined;

/** Even-odd rule: a point is inside when a ray from it crosses the ring an odd number of times. */
const EVEN = 2;

/** Selecting a demand replaces whatever was selected, including itself. */
const selectDemand = (_current: Selection, index: number): Selection => index;

const isSelected = (selection: Selection, index: number): boolean => selection === index;

/** Whether a horizontal ray from the point crosses the edge from a to b (even-odd rule). */
const crosses = ([x, y]: Position, [ax, ay]: Position, [bx, by]: Position): boolean =>
  ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax;

const ringContains = (ring: Ring, point: Position): boolean =>
  ring.slice(1).filter((end, index) => crosses(point, ring.at(index) ?? end, end)).length % EVEN === 1;

/** A polygon covers a point inside its outline and outside every hole. */
const containsPoint = (polygon: Polygon, point: Position): boolean => {
  const [outline = [], ...holes] = polygon;

  return ringContains(outline, point) && !holes.some((hole) => ringContains(hole, point));
};

/** The latest-listed demand under the point (drawn on top), or undefined when none is. */
const pickDemand = (demands: readonly Demand[], point: Position): Selection => {
  const index = demands.findLastIndex((demand) => containsPoint(demand.polygon, point));

  return index === -1 ? undefined : index;
};

/** Picking a point selects the demand picked there. A point with no demand under it leaves the selection alone. */
const selectAtPoint = (current: Selection, demands: readonly Demand[], point: Position): Selection => {
  const picked = pickDemand(demands, point);

  return picked === undefined ? current : selectDemand(current, picked);
};

export type { Selection };
export { containsPoint, INITIAL_SELECTION, isSelected, pickDemand, selectAtPoint, selectDemand };
