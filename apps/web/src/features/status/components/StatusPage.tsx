import type { ReactElement } from 'react';

import { useHealth } from '../hooks/index.ts';
import { statusLabel } from '../lib/index.ts';

const StatusPage = (): ReactElement => {
  const { data, isError } = useHealth();

  return (
    <main>
      <h1>Status</h1>
      <p role="status">{statusLabel(data, isError)}</p>
    </main>
  );
};

export { StatusPage };
