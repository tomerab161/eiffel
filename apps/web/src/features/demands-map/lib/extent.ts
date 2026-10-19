import type { Demand, Position } from '@app/domain';

/** The smallest box, aligned to longitude and latitude, that holds an area. */
interface Extent {
  west: number;
  south: number;
  east: number;
  north: number;
}

const union = (a: Extent, b: Extent): Extent => ({
  west: Math.min(a.west, b.west),
  south: Math.min(a.south, b.south),
  east: Math.max(a.east, b.east),
  north: Math.max(a.north, b.north),
});

const pointExtent = ([lon, lat]: Position): Extent => ({ west: lon, south: lat, east: lon, north: lat });

/** A demand's extent comes from its outline alone: holes lie inside it. A valid outline has at least four positions. */
const demandExtent = (demand: Demand): Extent => {
  const [outline = []] = demand.polygon;

  return outline.map(pointExtent).reduce(union);
};

/** The extent that holds every demand, or none when there are no demands. */
const extentOfAll = (demands: readonly Demand[]): Extent | undefined =>
  demands.map(demandExtent).reduce<Extent | undefined>((all, each) => (all ? union(all, each) : each), undefined);

export type { Extent };
export { demandExtent, extentOfAll };
