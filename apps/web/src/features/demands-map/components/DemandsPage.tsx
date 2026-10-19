import { type CSSProperties, type ReactElement, useRef } from 'react';

import type { Demand } from '@app/domain';
import { useDemands, useDemandsMap } from '../hooks/index.ts';
import { demandsMessage, type Selection } from '../lib/index.ts';
import { DemandsMap } from './DemandsMap.tsx';
import { DemandsTable } from './DemandsTable.tsx';

const NO_DEMANDS: readonly Demand[] = [];

const pageStyle: CSSProperties = {
  position: 'fixed',
  top: '0px',
  right: '0px',
  bottom: '0px',
  left: '0px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  margin: '0px',
  fontFamily: 'system-ui, sans-serif',
};
const titleStyle: CSSProperties = { margin: '0px', padding: '0.5rem 1rem', fontSize: '1.25rem' };
const layoutStyle: CSSProperties = { display: 'flex', flexDirection: 'row', flex: '1 1 auto', minHeight: '0px' };

/** Thin: wires the demands file, the map and the table together. */
const DemandsPage = (): ReactElement => {
  const { data, isPending, isError } = useDemands();
  const demands = data ?? NO_DEMANDS;
  const tableRef = useRef<HTMLDivElement>(null);

  const scrollToRow = (picked: Selection): void => {
    tableRef.current?.querySelector(`tr[data-demand-index="${picked}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const map = useDemandsMap(demands, scrollToRow);

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>Demands</h1>
      <div style={layoutStyle} data-layout>
        <DemandsMap mapRef={map.mapRef} />
        <DemandsTable
          demands={demands}
          selection={map.selection}
          message={demandsMessage({ isPending, isError, count: demands.length })}
          scrollAreaRef={tableRef}
          onSelect={map.selectRow}
        />
      </div>
    </main>
  );
};

export { DemandsPage };
