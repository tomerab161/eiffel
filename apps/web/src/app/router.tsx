import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';

import { DEMANDS_PAGE_PATH, DemandsPage } from '../features/demands-map/index.ts';
import { StatusPage } from '../features/status/index.ts';

// Code-based routes: app/ wires each feature's public entry (features/<name>/index.ts) to a path.
const rootRoute = createRootRoute({ component: Outlet });
const statusRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: StatusPage });
const demandsRoute = createRoute({ getParentRoute: () => rootRoute, path: DEMANDS_PAGE_PATH, component: DemandsPage });

const routeTree = rootRoute.addChildren([statusRoute, demandsRoute]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export { router, routeTree };
