import type { CSSProperties, KeyboardEvent, ReactElement, RefObject } from 'react';

import type { Demand } from '@app/domain';
import { ENTER_KEY } from '../constants.ts';
import { isSelected, rowKeys, type Selection } from '../lib/index.ts';

interface DemandsTableProps {
  demands: readonly Demand[];
  selection: Selection;
  message: string | undefined;
  scrollAreaRef: RefObject<HTMLDivElement | null>;
  onSelect: (index: number) => void;
}

const scrollAreaStyle: CSSProperties = {
  flex: '0 0 28rem',
  minHeight: '0px',
  overflowY: 'auto',
  borderLeft: '1px solid #cbd5e1',
};
const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const headerStyle: CSSProperties = { position: 'sticky', top: '0px', background: '#f8fafc', textAlign: 'left' };
const rowStyle = (highlighted: boolean): CSSProperties => ({
  height: '40px',
  cursor: 'pointer',
  background: highlighted ? '#fde68a' : 'transparent',
  fontWeight: highlighted ? 'bold' : 'normal',
});

/** Thin: lists the demands and reports which row was chosen, by click or Enter. */
const DemandsTable = ({ demands, selection, message, scrollAreaRef, onSelect }: DemandsTableProps): ReactElement => {
  const keys = rowKeys(demands.length);

  const handleKey = (event: KeyboardEvent, index: number): void => {
    if (event.key === ENTER_KEY) {
      onSelect(index);
    }
  };

  return (
    <div ref={scrollAreaRef} style={scrollAreaStyle} data-table-scroll-area>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={headerStyle}>Name</th>
            <th style={headerStyle}>Country</th>
            <th style={headerStyle}>Customer</th>
          </tr>
        </thead>
        <tbody>
          {demands.map((demand, index) => (
            <tr
              key={keys[index]}
              tabIndex={0}
              aria-selected={isSelected(selection, index)}
              data-demand-index={index}
              style={rowStyle(isSelected(selection, index))}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => handleKey(event, index)}
            >
              <td>{demand.name}</td>
              <td>{demand.country}</td>
              <td>{demand.customer}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {message && <p role="status">{message}</p>}
    </div>
  );
};

export { DemandsTable };
