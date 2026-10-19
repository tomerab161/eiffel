// Builders for raw demand collections, shaped as the demands file holds them (GeoJSON).

type RawPosition = number[];
type RawRing = RawPosition[];

/** A closed square outline with its lower-left corner at (lon, lat). */
const square = (lon: number, lat: number, size: number): RawRing => [
  [lon, lat],
  [lon + size, lat],
  [lon + size, lat + size],
  [lon, lat + size],
  [lon, lat],
];

const polygonOf = (...rings: RawRing[]): Record<string, unknown> => ({ type: 'Polygon', coordinates: rings });

interface RawDemandOptions {
  properties?: Record<string, unknown>;
  geometry?: unknown;
}

const validProperties = (): Record<string, unknown> => ({
  name: 'North Field Survey',
  country: 'Norway',
  customer: 'Acme Energy',
});

/** A raw demand feature: valid unless the options say otherwise. */
const rawDemand = ({
  properties = validProperties(),
  geometry = polygonOf(square(0, 0, 1)),
}: RawDemandOptions = {}): Record<string, unknown> => ({ type: 'Feature', properties, geometry });

const rawCollection = (features: unknown[]): Record<string, unknown> => ({ type: 'FeatureCollection', features });

/** Removes the quotes that keep spaces visible in a Gherkin table cell: `"   "` becomes three spaces. */
const unquote = (cell: string): string => cell.replace(/^"(.*)"$/s, '$1');

export type { RawRing };
export { polygonOf, rawCollection, rawDemand, square, unquote, validProperties };
