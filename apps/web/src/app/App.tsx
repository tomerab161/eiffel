import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { router } from './router.tsx';

interface AppProps {
  queryClient?: QueryClient;
}

const App = ({ queryClient = new QueryClient() }: AppProps): ReactElement => (
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);

export { App };
