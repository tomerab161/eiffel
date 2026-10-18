const HEALTH_QUERY_KEY = ['health'] as const;

/** How often the status page re-asks the API. */
const HEALTH_REFRESH_MS = 30_000;

export { HEALTH_QUERY_KEY, HEALTH_REFRESH_MS };
