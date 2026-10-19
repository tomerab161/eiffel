import type { Demand, Polygon, Position } from '@app/domain';
import {
  EARTH_RADIUS_M,
  FIT_PADDING_PX,
  MAX_MERCATOR_LATITUDE,
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_SIZE_PX,
} from '../constants.ts';
import { type Extent, extentOfAll } from './extent.ts';

/** A point in the map's projection (Web Mercator), in metres east and north of longitude 0, latitude 0. */
type MapPoint = [x: number, y: number];
type Pixel = [x: number, y: number];

interface MapSize {
  width: number;
  height: number;
}

/** What the map shows: the projected point in its middle and the zoom level (0 shows the whole world in one tile). */
interface MapView {
  center: MapPoint;
  zoom: number;
}

const DEGREES_PER_HALF_TURN = 180;
const PIXEL_DECIMALS = 2;
const HALF = 0.5;
const QUARTER_TURN = Math.PI * HALF * HALF;
/** Each zoom level doubles the scale. */
const ZOOM_FACTOR = 2;
const WORLD_WIDTH_M = Math.PI * EARTH_RADIUS_M * ZOOM_FACTOR;

const WORLD_VIEW: MapView = { center: [0, 0], zoom: MIN_ZOOM };

const toRadians = (degrees: number): number => (degrees * Math.PI) / DEGREES_PER_HALF_TURN;
const toDegrees = (radians: number): number => (radians * DEGREES_PER_HALF_TURN) / Math.PI;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const project = ([lon, lat]: Position): MapPoint => {
  const latitude = toRadians(clamp(lat, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE));

  return [EARTH_RADIUS_M * toRadians(lon), EARTH_RADIUS_M * Math.log(Math.tan(QUARTER_TURN + latitude * HALF))];
};

const unproject = ([x, y]: MapPoint): Position => [
  toDegrees(x / EARTH_RADIUS_M),
  toDegrees((Math.atan(Math.exp(y / EARTH_RADIUS_M)) - QUARTER_TURN) / HALF),
];

const resolutionAt = (zoom: number): number => WORLD_WIDTH_M / TILE_SIZE_PX / ZOOM_FACTOR ** zoom;

/** Metres per pixel. */
const resolutionOf = (view: MapView): number => resolutionAt(view.zoom);

const toPixel = (view: MapView, size: MapSize, [x, y]: MapPoint): Pixel => {
  const resolution = resolutionOf(view);

  return [
    (x - view.center[0]) / resolution + size.width * HALF,
    (view.center[1] - y) / resolution + size.height * HALF,
  ];
};

const lonLatAt = (view: MapView, size: MapSize, [px, py]: Pixel): Position => {
  const resolution = resolutionOf(view);

  return unproject([
    view.center[0] + (px - size.width * HALF) * resolution,
    view.center[1] - (py - size.height * HALF) * resolution,
  ]);
};

/** Pixels left for an extent along one side of the map, inside the padding on both ends (at least one). */
const roomFor = (length: number): number => Math.max(length - FIT_PADDING_PX - FIT_PADDING_PX, 1);

/** The view that holds the whole extent as large as fits, with padding around it. */
const fitExtent = (extent: Extent, size: MapSize): MapView => {
  const [west, south] = project([extent.west, extent.south]);
  const [east, north] = project([extent.east, extent.north]);
  const resolution = Math.max((east - west) / roomFor(size.width), (north - south) / roomFor(size.height));

  return {
    center: [(west + east) * HALF, (south + north) * HALF],
    zoom: clamp(Math.log2(resolutionAt(MIN_ZOOM) / resolution), MIN_ZOOM, MAX_ZOOM),
  };
};

/** The map starts framing all demands, or on the world view when there are none. */
const initialView = (demands: readonly Demand[], size: MapSize): MapView => {
  const extent = extentOfAll(demands);

  return extent ? fitExtent(extent, size) : WORLD_VIEW;
};

const zoomBy = (view: MapView, steps: number): MapView => ({
  ...view,
  zoom: clamp(view.zoom + steps, MIN_ZOOM, MAX_ZOOM),
});

/** Moves the map's content by the pixels the pointer moved. */
const panBy = (view: MapView, [dx, dy]: Pixel): MapView => {
  const resolution = resolutionOf(view);

  return { ...view, center: [view.center[0] - dx * resolution, view.center[1] + dy * resolution] };
};

const formatPixel = ([x, y]: Pixel): string =>
  `${Number(x.toFixed(PIXEL_DECIMALS))},${Number(y.toFixed(PIXEL_DECIMALS))}`;

/** An SVG path for a polygon: one closed sub-path per ring, so holes cut out with the even-odd fill rule. */
const polygonPath = (view: MapView, size: MapSize, polygon: Polygon): string =>
  polygon
    .map((ring) => `M${ring.map((position) => formatPixel(toPixel(view, size, project(position)))).join('L')}Z`)
    .join(' ');

export type { MapPoint, MapSize, MapView, Pixel };
export {
  fitExtent,
  initialView,
  lonLatAt,
  panBy,
  polygonPath,
  project,
  resolutionOf,
  toPixel,
  unproject,
  WORLD_VIEW,
  zoomBy,
};
