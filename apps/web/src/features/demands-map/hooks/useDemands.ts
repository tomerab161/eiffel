import { type UseQueryResult, useQuery } from '@tanstack/react-query';

import { type Demand, DemandCollectionSchema } from '@app/domain';
import { getJson } from '../../../clients/index.ts';
import { DEMANDS_PATH, DEMANDS_QUERY_KEY } from '../constants.ts';

/** Thin: fetching and caching only. The domain schema decides what a valid demands file is. */
const useDemands = (): UseQueryResult<Demand[]> =>
  useQuery({ queryKey: DEMANDS_QUERY_KEY, queryFn: () => getJson(DEMANDS_PATH, DemandCollectionSchema) });

export { useDemands };
