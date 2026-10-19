import { z } from 'zod';

import {
  FEATURE_COLLECTION_TYPE,
  FEATURE_TYPE,
  MAX_LATITUDE,
  MAX_LONGITUDE,
  MIN_LATITUDE,
  MIN_LONGITUDE,
  MIN_RING_POSITIONS,
  POLYGON_TYPE,
} from './constants.ts';
import { hasVisibleText, isClosedRing } from './rules.ts';

const VisibleTextSchema = z.string().refine(hasVisibleText, { message: 'needs a visible value' });

const LongitudeSchema = z.number().min(MIN_LONGITUDE).max(MAX_LONGITUDE);
const LatitudeSchema = z.number().min(MIN_LATITUDE).max(MAX_LATITUDE);

/** A GeoJSON position: longitude, latitude and an optional altitude. */
const PositionSchema = z.union([
  z.tuple([LongitudeSchema, LatitudeSchema]),
  z.tuple([LongitudeSchema, LatitudeSchema, z.number()]),
]);
type Position = z.infer<typeof PositionSchema>;

/** A closed ring of positions: a polygon's outline or one of its holes. */
const RingSchema = z
  .array(PositionSchema)
  .min(MIN_RING_POSITIONS)
  .refine(isClosedRing, { message: 'must end where it starts' });
type Ring = z.infer<typeof RingSchema>;

/** The outline first, then any holes. A polygon always has its outline. */
const PolygonCoordinatesSchema = z.tuple([RingSchema], RingSchema);
type Polygon = z.infer<typeof PolygonCoordinatesSchema>;

/** A demand as the app uses it: unknown details from the file are dropped. */
const DemandSchema = z.object({
  name: VisibleTextSchema,
  country: VisibleTextSchema,
  customer: VisibleTextSchema,
  polygon: PolygonCoordinatesSchema,
});
type Demand = z.infer<typeof DemandSchema>;

/** One demand as the file holds it: a GeoJSON polygon feature. */
const DemandFeatureSchema = z
  .object({
    type: z.literal(FEATURE_TYPE),
    properties: DemandSchema.omit({ polygon: true }),
    geometry: z.object({ type: z.literal(POLYGON_TYPE), coordinates: PolygonCoordinatesSchema }),
  })
  .transform(({ properties, geometry }): Demand => ({ ...properties, polygon: geometry.coordinates }));

/** The demands file: a GeoJSON feature collection, read into its demands in file order. Any invalid demand rejects it all. */
const DemandCollectionSchema = z
  .object({ type: z.literal(FEATURE_COLLECTION_TYPE), features: z.array(DemandFeatureSchema) })
  .transform(({ features }): Demand[] => features);

export type { Demand, Polygon, Position, Ring };
export {
  DemandCollectionSchema,
  DemandFeatureSchema,
  DemandSchema,
  PolygonCoordinatesSchema,
  PositionSchema,
  RingSchema,
};
