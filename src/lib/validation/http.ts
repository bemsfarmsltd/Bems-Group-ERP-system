import { z } from 'zod';

export class ApiValidationError extends Error {
  status = 400;
  issues: Array<{ path: string; message: string }>;

  constructor(issues: Array<{ path: string; message: string }>) {
    super('Validation failed');
    this.issues = issues;
  }
}

export function parseWithSchema<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw new ApiValidationError(issues);
  }
  return result.data;
}

export const IdCardVerifyBodySchema = z.object({
  token: z.string().min(10).optional(),
  code: z.string().min(2).optional(),
  requiredMinLevel: z.number().int().min(1).max(10).optional(),
  requiredModule: z.string().min(1).optional(),
  gateName: z.string().max(120).optional(),
}).refine((v) => Boolean(v.token || v.code), {
  message: 'Either token or code must be provided.',
});
