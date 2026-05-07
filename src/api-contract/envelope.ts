import { z } from "zod";

/**
 * Matches the JSON envelope produced by `responseHandler` in `src/lib/communication.ts`.
 *
 * We standardize API responses for the contract as:
 * { success: boolean; message?: string | null; data: T | null }
 */
export function apiEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    message: z.string().nullish(),
    data: dataSchema.nullable(),
  });
}

export type ApiEnvelope<T> = {
  success: boolean;
  message?: string | null;
  data: T | null;
};

