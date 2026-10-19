import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { App } from './App.tsx';
import { router } from './router.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('routes / to the status page', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ status: 'ok', checks: { database: 'up' } })));
  render(<App queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />);
  expect(await screen.findByRole('heading', { name: 'Status' })).toBeDefined();
});

it('routes /demands to the demands page', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [] })));
  render(<App queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />);
  await act(() => router.navigate({ to: '/demands' }));
  expect(await screen.findByRole('heading', { name: 'Demands' })).toBeDefined();
  await act(() => router.navigate({ to: '/' }));
});
