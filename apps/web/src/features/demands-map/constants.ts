/** The web app serves the demands file itself (apps/web/public). */
const DEMANDS_PATH = '/demands.geojson';
const DEMANDS_PAGE_PATH = '/demands';
const DEMANDS_QUERY_KEY = ['demands'] as const;

const LOADING_TEXT = 'Loading demands…';
const EMPTY_TEXT = 'No demands to show';
const ERROR_TEXT = 'Demands could not be loaded.';

/** OpenLayers zoom levels: at 0 the whole world spans one 256-pixel tile. */
const MIN_ZOOM = 0;
const MAX_ZOOM = 20;

/** Room left around an extent the map frames. */
const FIT_PADDING_PX = 24;

/** Used until the map has been measured (and where layout gives no size). */
const DEFAULT_MAP_SIZE = { width: 800, height: 600 } as const;

const ENTER_KEY = 'Enter';

export {
  DEFAULT_MAP_SIZE,
  DEMANDS_PAGE_PATH,
  DEMANDS_PATH,
  DEMANDS_QUERY_KEY,
  EMPTY_TEXT,
  ENTER_KEY,
  ERROR_TEXT,
  FIT_PADDING_PX,
  LOADING_TEXT,
  MAX_ZOOM,
  MIN_ZOOM,
};
