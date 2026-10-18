import { type UseQueryResult, useQuery } from '@tanstack/react-query';

import { HEALTH_HTTP_DEGRADED, HEALTH_PATH, type HealthResponse, HealthResponseSchema } from '@app/domain';
import { getJson } from '../../../clients/index.ts';
import { HEALTH_QUERY_KEY, HEALTH_REFRESH_MS } from '../constants.ts';

/** Thin: fetching and caching only. Display rules live in lib/. */
const useHealth = (): UseQueryResult<HealthResponse> =>
  useQuery({
    queryKey: HEALTH_QUERY_KEY,
    queryFn: () => getJson(HEALTH_PATH, HealthResponseSchema, { acceptStatuses: [HEALTH_HTTP_DEGRADED] }),
    refetchInterval: HEALTH_REFRESH_MS,
  });

export { useHealth };
