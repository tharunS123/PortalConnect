import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { ValidationError } from '../lib/errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Parse and replace a request segment with its validated, typed equivalent.
 * Unknown keys are stripped, so a client cannot smuggle extra fields into an
 * update (e.g. `role` or `isActive` on a self-service profile edit).
 */
export function validate(schema: z.ZodType, source: Source = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(
        new ValidationError(
          result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
      return;
    }

    // `req.query` has only a getter in Express 5, so assign through a shim.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}
