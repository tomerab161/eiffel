/** Overall service status reported by GET /api/health. */
const HEALTH_OK = 'ok';
const HEALTH_DEGRADED = 'degraded';
const HEALTH_STATUSES = [HEALTH_OK, HEALTH_DEGRADED] as const;

/** State of one dependency the service needs (e.g. the database). */
const CHECK_UP = 'up';
const CHECK_DOWN = 'down';
const CHECK_STATES = [CHECK_UP, CHECK_DOWN] as const;

const HEALTH_PATH = '/api/health';

/** HTTP status for each overall status: part of the contract, so the web app accepts 503 as an answer. */
const HEALTH_HTTP_OK = 200;
const HEALTH_HTTP_DEGRADED = 503;

export {
  CHECK_DOWN,
  CHECK_STATES,
  CHECK_UP,
  HEALTH_DEGRADED,
  HEALTH_HTTP_DEGRADED,
  HEALTH_HTTP_OK,
  HEALTH_OK,
  HEALTH_PATH,
  HEALTH_STATUSES,
};
