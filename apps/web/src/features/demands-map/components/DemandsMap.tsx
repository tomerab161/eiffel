import 'ol/ol.css';
import type { CSSProperties, ReactElement, RefObject } from 'react';

interface DemandsMapProps {
  mapRef: RefObject<HTMLDivElement | null>;
}

const containerStyle: CSSProperties = {
  position: 'relative',
  flex: '1 1 auto',
  minWidth: '0px',
  minHeight: '0px',
  overflow: 'hidden',
  background: '#dbe9f4',
};

/** Thin: the element OpenLayers draws the demands map into (see hooks/useOpenLayersMap.ts). */
const DemandsMap = ({ mapRef }: DemandsMapProps): ReactElement => (
  <div ref={mapRef} role="img" aria-label="Map of demands" style={containerStyle} />
);

export { DemandsMap };
