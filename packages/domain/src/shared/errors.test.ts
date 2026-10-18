import { expect, it } from 'vitest';

import { ErrorResponseSchema } from './errors.ts';

it('accepts every known error code', () => {
  for (const code of ['VALIDATION_FAILED', 'NOT_FOUND', 'INTERNAL']) {
    expect(ErrorResponseSchema.safeParse({ code, message: 'x' }).success).toBe(true);
  }
});

it('rejects an unknown error code', () => {
  expect(ErrorResponseSchema.safeParse({ code: 'TEAPOT', message: 'x' }).success).toBe(false);
});
