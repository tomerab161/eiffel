import { z } from 'zod';

/** Error codes every API error response uses. The web app maps them to messages. */
const ERROR_CODES = ['VALIDATION_FAILED', 'NOT_FOUND', 'INTERNAL'] as const;

const ErrorCodeSchema = z.enum(ERROR_CODES);
type ErrorCode = z.infer<typeof ErrorCodeSchema>;

const ErrorResponseSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
});
type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export type { ErrorCode, ErrorResponse };
export { ERROR_CODES, ErrorCodeSchema, ErrorResponseSchema };
