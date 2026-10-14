/**
 * env.ts — Parses and validates environment variables using Zod.
 * Used by: src/db/connection.ts, src/server.ts
 */
import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DB_PATH: z.string().min(1).default('./data/app.db'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  NODE_ENV: z.string().optional(),
});

/** Parsed, typed configuration object derived from environment variables. */
export type Config = z.infer<typeof envSchema>;

/** Returns the validated config; throws on missing required vars. */
export function parseEnv(): Config {
  return envSchema.parse(process.env);
}

/** Singleton config instance used throughout the app. */
export const config = parseEnv();
