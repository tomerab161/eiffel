/** The web app serves the demands file itself (apps/web/public). */
const DEMANDS_PATH = '/demands.geojson';
const DEMANDS_PAGE_PATH = '/demands';
const DEMANDS_QUERY_KEY = ['demands'] as const;

const LOADING_TEXT = 'Loading demands…';
const EMPTY_TEXT = 'No demands to show';
const ERROR_TEXT = 'Demands could not be loaded.';

/** Web Mercator (EPSG:3857): the sphere radius in metres and the latitude where the square world ends. */
const EARTH_RADIUS_M = 6_378_137;
const MAX_MERCATOR_LATITUDE = 85.051_128_779_806_59;

/** At zoom 0 the whole world spans one 256-pixel tile. */
const TILE_SIZE_PX = 256;
const MIN_ZOOM = 0;
const MAX_ZOOM = 20;
const ZOOM_STEP = 1;

/** Keys that zoom the focused map, and by how many steps. A Map, so inherited names like "constructor" are not keys. */
const ZOOM_KEYS: ReadonlyMap<string, number> = new Map([
  ['+', ZOOM_STEP],
  ['=', ZOOM_STEP],
  ['-', -ZOOM_STEP],
]);

/** Room left around an extent the map frames. */
const FIT_PADDING_PX = 24;

/** Used until the map has been measured (and where layout gives no size). */
const DEFAULT_MAP_SIZE = { width: 800, height: 600 } as const;

/** A press that moves further than this is a pan, not a click. */
const DRAG_THRESHOLD_PX = 4;

const ENTER_KEY = 'Enter';

export {
  DEFAULT_MAP_SIZE,
  DEMANDS_PAGE_PATH,
  DEMANDS_PATH,
  DEMANDS_QUERY_KEY,
  DRAG_THRESHOLD_PX,
  EARTH_RADIUS_M,
  EMPTY_TEXT,
  ENTER_KEY,
  ERROR_TEXT,
  FIT_PADDING_PX,
  LOADING_TEXT,
  MAX_MERCATOR_LATITUDE,
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_SIZE_PX,
  ZOOM_KEYS,
  ZOOM_STEP,
};
