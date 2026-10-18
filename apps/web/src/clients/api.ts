import type { z } from 'zod';

import { ErrorResponseSchema } from '@app/domain';

/** Thrown for any non-2xx answer. `code` comes from the shared ErrorResponse when the API sent one. */
class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`API answered ${status} (${code})`);
  }
}

interface GetJsonOptions {
  /** Non-2xx statuses whose body still matches the schema (e.g. 503 for health). */
  acceptStatuses?: readonly number[];
  fetchFn?: typeof fetch;
}

/**
 * The only way the web app calls the API. Every response is parsed with the domain schema,
 * so a contract drift fails loudly here instead of deep in a component.
 */
const getJson = async <T extends z.ZodType>(
  path: string,
  schema: T,
  options: GetJsonOptions = {},
): Promise<z.infer<T>> => {
  const { acceptStatuses = [], fetchFn = fetch } = options;
  const res = await fetchFn(path, { headers: { accept: 'application/json' } });
  const body: unknown = await res.json().catch(() => null);

  if (!(res.ok || acceptStatuses.includes(res.status))) {
    throw new ApiError(res.status, ErrorResponseSchema.safeParse(body).data?.code ?? 'UNKNOWN');
  }

  return schema.parse(body);
};

export type { GetJsonOptions };
export { ApiError, getJson };
