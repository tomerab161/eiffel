import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RenderResult, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

/** Renders UI with a fresh, retry-free query client, as the app shell would. */
const renderWithQuery = (ui: ReactNode): RenderResult => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

/** Replaces fetch with a fake API that always answers `body` with `status`. */
const fakeApi = (status: number, body: unknown): void => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status }));
};

export { fakeApi, renderWithQuery };
