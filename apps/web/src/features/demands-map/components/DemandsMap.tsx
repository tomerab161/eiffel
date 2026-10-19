import type { CSSProperties, KeyboardEvent, MouseEvent, ReactElement, RefObject } from 'react';

import type { Demand, Position } from '@app/domain';
import { ZOOM_STEP } from '../constants.ts';
import { type DragPan, useDragPan } from '../hooks/index.ts';
import {
  isSelected,
  lonLatAt,
  type MapSize,
  type MapView,
  type Pixel,
  polygonPath,
  rowKeys,
  type Selection,
  zoomStepsForKey,
} from '../lib/index.ts';

interface DemandsMapProps {
  demands: readonly Demand[];
  selection: Selection;
  view: MapView;
  size: MapSize;
  containerRef: RefObject<HTMLDivElement | null>;
  onPick: (point: Position) => void;
  onZoom: (steps: number) => void;
  onPan: (move: Pixel) => void;
}

const containerStyle: CSSProperties = {
  position: 'relative',
  flex: '1 1 auto',
  minWidth: '0px',
  minHeight: '0px',
  overflow: 'hidden',
  background: '#dbe9f4',
};
const svgStyle: CSSProperties = {
  position: 'absolute',
  top: '0px',
  left: '0px',
  width: '100%',
  height: '100%',
  cursor: 'grab',
  touchAction: 'none',
};
const controlsStyle: CSSProperties = {
  position: 'absolute',
  top: '0.5rem',
  left: '0.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};
const polygonStyle = (highlighted: boolean): CSSProperties => ({
  fill: highlighted ? '#f59e0b' : '#3b82f6',
  fillOpacity: highlighted ? '0.7' : '0.4',
  stroke: highlighted ? '#b45309' : '#1d4ed8',
  strokeWidth: highlighted ? '3' : '1',
});

type DemandPolygonsProps = Pick<DemandsMapProps, 'demands' | 'selection' | 'view' | 'size'>;

/** One SVG path per demand, in list order, so later demands draw on top. */
const DemandPolygons = ({ demands, selection, view, size }: DemandPolygonsProps): ReactElement => {
  const keys = rowKeys(demands.length);

  return (
    <>
      {demands.map((demand, index) => (
        <path
          key={keys[index]}
          d={polygonPath(view, size, demand.polygon)}
          fillRule="evenodd"
          data-demand-index={index}
          data-highlighted={isSelected(selection, index)}
          style={polygonStyle(isSelected(selection, index))}
        >
          <title>{demand.name}</title>
        </path>
      ))}
    </>
  );
};

interface ZoomControlsProps {
  onZoom: (steps: number) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

/** Zoom keys (+ and -) bubble up here from the focused zoom buttons. */
const ZoomControls = ({ onZoom, onKeyDown }: ZoomControlsProps): ReactElement => (
  <div role="toolbar" aria-label="Map zoom" style={controlsStyle} onKeyDown={onKeyDown}>
    <button type="button" aria-label="Zoom in" onClick={() => onZoom(ZOOM_STEP)}>
      +
    </button>
    <button type="button" aria-label="Zoom out" onClick={() => onZoom(-ZOOM_STEP)}>
      −
    </button>
  </div>
);

type MapInputProps = Pick<DemandsMapProps, 'view' | 'size' | 'onPick' | 'onZoom' | 'onPan'>;

interface MapInput {
  onKeyDown: (event: KeyboardEvent) => void;
  /** Handlers for the map surface: pointer presses, clicks and zoom keys. */
  surface: Omit<DragPan, 'wasPan'> & {
    onClick: (event: MouseEvent<SVGSVGElement>) => void;
    onKeyDown: (event: KeyboardEvent) => void;
  };
}

/** Zoom keys zoom; a click that was not the end of a pan picks the position under the pointer. */
const useMapInput = ({ view, size, onPick, onZoom, onPan }: MapInputProps): MapInput => {
  const { wasPan, ...pointerHandlers } = useDragPan(onPan);

  const onKeyDown = (event: KeyboardEvent): void => {
    const steps = zoomStepsForKey(event.key);

    if (steps !== undefined) {
      onZoom(steps);
    }
  };

  const onClick = (event: MouseEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();

    if (!wasPan()) {
      onPick(lonLatAt(view, size, [event.clientX - box.left, event.clientY - box.top]));
    }
  };

  return { onKeyDown, surface: { ...pointerHandlers, onClick, onKeyDown } };
};

/** Thin: draws the demands and reports clicks, pans and zooms. Which demand a click picks is decided in lib/. */
const DemandsMap = (props: DemandsMapProps): ReactElement => {
  const { demands, selection, view, size, containerRef, onZoom } = props;
  const input = useMapInput(props);

  return (
    <div ref={containerRef} style={containerStyle}>
      <svg
        role="img"
        aria-label="Map of demands"
        style={svgStyle}
        data-center-x={view.center[0]}
        data-center-y={view.center[1]}
        data-zoom={view.zoom}
        data-width={size.width}
        data-height={size.height}
        {...input.surface}
      >
        <DemandPolygons demands={demands} selection={selection} view={view} size={size} />
      </svg>
      <ZoomControls onZoom={onZoom} onKeyDown={input.onKeyDown} />
    </div>
  );
};

export { DemandsMap };
