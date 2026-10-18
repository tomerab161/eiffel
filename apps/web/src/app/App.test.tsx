import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { App } from './App.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('routes / to the status page', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ status: 'ok', checks: { database: 'up' } })));
  render(<App queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />);
  expect(await screen.findByRole('heading', { name: 'Status' })).toBeDefined();
});
