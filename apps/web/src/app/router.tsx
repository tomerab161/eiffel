import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';

import { StatusPage } from '../features/status/index.ts';

// Code-based routes: app/ wires each feature's public entry (features/<name>/index.ts) to a path.
const rootRoute = createRootRoute({ component: Outlet });
const statusRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: StatusPage });

const routeTree = rootRoute.addChildren([statusRoute]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export { router, routeTree };
