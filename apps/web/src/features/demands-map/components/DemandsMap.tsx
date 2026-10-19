import type { CSSProperties, KeyboardEvent, MouseEvent, ReactElement, RefObject } from 'react';

import type { Demand, Position } from '@app/domain';
import { ZOOM_STEP } from '../constants.ts';
import { useDragPan } from '../hooks/index.ts';
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

/** Thin: draws the demands and reports clicks, pans and zooms. Which demand a click picks is decided in lib/. */
const DemandsMap = ({
  demands,
  selection,
  view,
  size,
  containerRef,
  onPick,
  onZoom,
  onPan,
}: DemandsMapProps): ReactElement => {
  const dragPan = useDragPan(onPan);

  const handleClick = (event: MouseEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();

    if (!dragPan.wasPan()) {
      onPick(lonLatAt(view, size, [event.clientX - box.left, event.clientY - box.top]));
    }
  };

  const handleKey = (event: KeyboardEvent): void => {
    const steps = zoomStepsForKey(event.key);

    if (steps !== undefined) {
      onZoom(steps);
    }
  };

  const keys = rowKeys(demands.length);

  return (
    <div ref={containerRef} style={containerStyle}>
      <svg
        role="img"
        aria-label="Map of demands"
        style={svgStyle}
        onKeyDown={handleKey}
        data-center-x={view.center[0]}
        data-center-y={view.center[1]}
        data-zoom={view.zoom}
        data-width={size.width}
        data-height={size.height}
        onClick={handleClick}
        onPointerDown={dragPan.onPointerDown}
        onPointerMove={dragPan.onPointerMove}
        onPointerUp={dragPan.onPointerUp}
        onPointerLeave={dragPan.onPointerLeave}
      >
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
      </svg>
      {/* Zoom keys (+ and -) bubble up here from the focused zoom buttons. */}
      <div role="toolbar" aria-label="Map zoom" style={controlsStyle} onKeyDown={handleKey}>
        <button type="button" aria-label="Zoom in" onClick={() => onZoom(ZOOM_STEP)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => onZoom(-ZOOM_STEP)}>
          −
        </button>
      </div>
    </div>
  );
};

export { DemandsMap };
