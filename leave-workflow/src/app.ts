/**
 * app.ts — Creates and configures the Express application (no listen).
 * Kept separate from server.ts so tests can import the app without starting a port.
 * Used by: src/server.ts, tests/*
 */
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import router from './routes/requestRoutes';
import { config } from './config/env';
import pino from 'pino';

/** Shared pino logger instance used across middleware and service layer. */
export const logger = pino({ level: config.LOG_LEVEL });

/**
 * Builds and returns the configured Express app.
 * Does NOT call app.listen() — that is done in server.ts.
 * Used by: server.ts and all test files (import createApp).
 */
export function createApp(): express.Application {
  const app = express();

  // Security headers (CSP blocks inline scripts — UI must use external files only)
  app.use(helmet());

  // Request ID (must be before pino-http so the id appears in logs)
  app.use(requestIdMiddleware);

  // Structured HTTP logging
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
    }),
  );

  // Rate limiting — skipped in test environment to avoid throttling test suites
  if (config.NODE_ENV !== 'test') {
    app.use(
      rateLimit({
        windowMs: 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );
  }

  // JSON body parser with 10kb limit
  app.use(express.json({ limit: '10kb' }));

  // Static frontend — works from src/ (dev via tsx) and dist/ (prod via node)
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // API routes
  app.use('/', router);

  // Global error handler (must be last)
  app.use(errorHandler(logger));

  return app;
}
