/**
 * requestId.ts — Middleware that attaches a unique request ID to every incoming request.
 * Reads X-Request-Id header if present; otherwise generates one.
 * Used by: src/app.ts
 */
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  // Augment Express Request to carry requestId
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Attaches req.requestId (from header or generated UUID) and echoes it in X-Request-Id response header.
 * Used by: app.ts (applied before all routes so pino-http and errorHandler can reference it).
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
