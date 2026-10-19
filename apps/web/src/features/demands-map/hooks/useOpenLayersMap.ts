import { getCenter } from 'ol/extent.js';
import Feature from 'ol/Feature.js';
import OlPolygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import OlMap from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { unByKey } from 'ol/Observable.js';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';

import type { Demand, Position } from '@app/domain';
import { FIT_PADDING_PX, MAX_ZOOM, MIN_ZOOM } from '../constants.ts';
import { type Extent, extentOfAll, isSelected, mapSizeOf, type Selection } from '../lib/index.ts';

interface OpenLayersMapOptions {
  demands: readonly Demand[];
  selection: Selection;
  onPick: (point: Position) => void;
}

interface OpenLayersMap {
  /** The element the map draws into. */
  targetRef: RefObject<HTMLDivElement | null>;
  /** Moves the view so it holds the whole extent, with padding around it. */
  frame: (extent: Extent) => void;
}

interface MapParts {
  map: OlMap;
  source: VectorSource<Feature<OlPolygon>>;
}

/** Longitude 0, latitude 0 in the map's projection (EPSG:3857), exactly: projecting it can leave a rounding error. */
const WORLD_CENTER: [x: number, y: number] = [0, 0];
/** The padding is left on both sides of each axis. */
const BOTH_SIDES = 2;

const styles = {
  plain: new Style({
    fill: new Fill({ color: 'rgba(59, 130, 246, 0.4)' }),
    stroke: new Stroke({ color: '#1d4ed8', width: 1 }),
  }),
  highlighted: new Style({
    fill: new Fill({ color: 'rgba(245, 158, 11, 0.7)' }),
    stroke: new Stroke({ color: '#b45309', width: 3 }),
    zIndex: 1,
  }),
};

/** Each map element's OpenLayers map, so tests can read what the map shows (the test DOM cannot draw a canvas). */
const maps = new WeakMap<Element, OlMap>();

const openLayersMapOf = (element: Element): OlMap | undefined => maps.get(element);

const createParts = (): MapParts => {
  const source = new VectorSource<Feature<OlPolygon>>();
  const layer = new VectorLayer({
    source,
    style: (feature) => (feature.get('highlighted') === true ? styles.highlighted : styles.plain),
  });
  const view = new View({ center: WORLD_CENTER, zoom: MIN_ZOOM, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });

  return { map: new OlMap({ layers: [layer], view }), source };
};

/** One feature per demand, in list order, so later demands draw on top. */
const featureOf = (demand: Demand, index: number): Feature<OlPolygon> =>
  new Feature({
    geometry: new OlPolygon(demand.polygon.map((ring) => ring.map((position) => fromLonLat(position)))),
    name: demand.name,
    demandIndex: index,
    highlighted: false,
  });

const frameExtent = (map: OlMap, { west, south, east, north }: Extent): void => {
  const [width = 0, height = 0] = map.getSize() ?? [];
  const size = mapSizeOf(width, height);
  const view = map.getView();
  const projected = transformExtent([west, south, east, north], 'EPSG:4326', 'EPSG:3857');
  const room = [size.width - BOTH_SIDES * FIT_PADDING_PX, size.height - BOTH_SIDES * FIT_PADDING_PX];
  const resolution = Math.max(view.getResolutionForExtent(projected, room), view.getResolutionForZoom(MAX_ZOOM));

  view.setResolution(resolution);
  view.setCenter(getCenter(projected));
};

/** Draws the map into the element and reports each click's position; returns how to detach it again. */
const attach = (map: OlMap, target: HTMLElement, onPick: (point: Position) => void): (() => void) => {
  map.setTarget(target);
  maps.set(target, map);
  const click = map.on('click', (event: MapBrowserEvent) => onPick(toLonLat(event.coordinate) as Position));

  return () => {
    unByKey(click);
    maps.delete(target);
    map.setTarget(undefined);
  };
};

const showWorld = (map: OlMap): void => {
  map.getView().setCenter(WORLD_CENTER);
  map.getView().setZoom(MIN_ZOOM);
};

/**
 * Thin: an OpenLayers map of the demands. OpenLayers draws, pans and zooms; a click reports the position under the
 * pointer and lib/ decides which demand it picks. The map frames all demands whenever the list changes.
 */
const useOpenLayersMap = ({ demands, selection, onPick }: OpenLayersMapOptions): OpenLayersMap => {
  const targetRef = useRef<HTMLDivElement>(null);
  const [{ map, source }] = useState(createParts);
  const pickRef = useRef(onPick);

  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const target = targetRef.current;

    return target ? attach(map, target, (point) => pickRef.current(point)) : undefined;
  }, [map]);

  const features = useMemo(() => demands.map(featureOf), [demands]);

  useEffect(() => {
    const extent = extentOfAll(demands);

    source.clear();
    source.addFeatures(features);

    if (extent) {
      frameExtent(map, extent);
    } else {
      showWorld(map);
    }
  }, [map, source, demands, features]);

  useEffect(() => {
    features.forEach((feature, index) => {
      feature.set('highlighted', isSelected(selection, index));
    });
  }, [features, selection]);

  return { targetRef, frame: (extent) => frameExtent(map, extent) };
};

export type { OpenLayersMap };
export { openLayersMapOf, useOpenLayersMap };
