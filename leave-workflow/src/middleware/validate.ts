/**
 * validate.ts — Express middleware factory for Zod schema validation.
 * Validates req.body, req.query, or req.params and throws ValidationError on failure.
 * Used by: src/routes/requestRoutes.ts
 */
import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../domain/errors';

type Target = 'body' | 'query' | 'params';

/**
 * Returns an Express middleware that validates the given target against a Zod schema.
 * On failure, throws ValidationError (caught by errorHandler).
 * Used by: requestRoutes to guard all endpoints.
 */
export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const details = (result.error as ZodError).errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Validation failed', details);
    }
    // Replace the target with the coerced/defaulted values from Zod
    (req as Record<string, unknown>)[target] = result.data;
    next();
  };
}
