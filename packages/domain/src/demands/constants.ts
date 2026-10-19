/** GeoJSON type tags the demands file uses. */
const FEATURE_COLLECTION_TYPE = 'FeatureCollection';
const FEATURE_TYPE = 'Feature';
const POLYGON_TYPE = 'Polygon';

/** A ring (outline or hole) is closed, so it needs at least four positions. */
const MIN_RING_POSITIONS = 4;

const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;
const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;

export {
  FEATURE_COLLECTION_TYPE,
  FEATURE_TYPE,
  MAX_LATITUDE,
  MAX_LONGITUDE,
  MIN_LATITUDE,
  MIN_LONGITUDE,
  MIN_RING_POSITIONS,
  POLYGON_TYPE,
};
