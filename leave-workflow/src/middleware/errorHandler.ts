/**
 * errorHandler.ts — Global Express error handler.
 * Converts AppError subclasses to the standard JSON envelope.
 * Logs unexpected errors with pino; never leaks stack traces.
 * Used by: src/app.ts (registered last)
 */
import type { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';
import {
  AppError,
  ValidationError,
  InvalidTransitionError,
} from '../domain/errors';

/**
 * Express 4 error-handling middleware (4 args required).
 * Converts any thrown error into the standard { error: { code, message, ... } } envelope.
 * Used by: app.ts as the final app.use() call.
 */
export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = req.requestId ?? 'unknown';

    if (err instanceof ValidationError) {
      res.status(400).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          requestId,
        },
      });
      return;
    }

    if (err instanceof InvalidTransitionError) {
      res.status(422).json({
        error: {
          code: err.code,
          message: err.message,
          allowedTransitions: err.allowedTransitions,
          requestId,
        },
      });
      return;
    }

    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.message,
          requestId,
        },
      });
      return;
    }

    // Unexpected error — log full details, send generic response
    logger.error({ err, requestId }, 'Unhandled error');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      },
    });
  };
}
