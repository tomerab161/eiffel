import { HEALTH_OK, type HealthResponse } from '@app/domain';

const answeredLabel = (health: HealthResponse): string =>
  health.status === HEALTH_OK ? 'All systems operational' : `Degraded: database ${health.checks.database}`;

const loadedLabel = (health: HealthResponse | undefined): string => (health ? answeredLabel(health) : 'Checking…');

/** What the status page shows. Pure, so it is unit- and mutation-tested without rendering. */
const statusLabel = (health: HealthResponse | undefined, failed: boolean): string =>
  failed ? 'API unreachable' : loadedLabel(health);

export { statusLabel };
