import type { NextFunction, Request, Response } from 'express';
import { AppError, NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
}

export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/**
 * Single exit point for errors, so every failure leaves the API in the same
 * shape: `{ error: { code, message, details? } }`.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  // pino-http types `req.id` loosely; only forward it when it is a usable scalar.
  const requestId =
    typeof req.id === 'string' || typeof req.id === 'number' ? String(req.id) : undefined;

  if (error instanceof AppError) {
    // 4xx are client mistakes and are noise at error level.
    logger[error.status >= 500 ? 'error' : 'debug'](
      { err: error, requestId, status: error.status },
      error.message,
    );

    const body: ErrorResponseBody = {
      error: { code: error.code, message: error.message, requestId },
    };
    if (error.details !== undefined) body.error.details = error.details;

    res.status(error.status).json(body);
    return;
  }

  logger.error({ err: error, requestId }, 'Unhandled error');

  // Never leak internals (stack traces, driver messages) to a client.
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
      ...(env.isProduction ? {} : { details: error instanceof Error ? error.message : error }),
    },
  } satisfies ErrorResponseBody);
}
