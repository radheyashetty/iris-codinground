/**
 * connection.ts — SQLite connection singleton.
 * Reads schema.sql and applies it on first open.
 * Used by: src/repositories/*, src/services/requestService.ts, tests/*
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/env';

let instance: Database.Database | null = null;

/**
 * Returns the singleton better-sqlite3 Database instance.
 * Creates and migrates the DB on first call.
 * Used by: all repositories and requestService.
 */
export function getDb(): Database.Database {
  if (instance) return instance;

  const dbPath = config.DB_PATH;

  // Ensure the data directory exists for file-based DBs
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');

  // Apply schema
  const localSchemaPath = path.join(__dirname, 'schema.sql');
  const srcSchemaPath = path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql');
  const schemaPath = fs.existsSync(localSchemaPath) ? localSchemaPath : srcSchemaPath;
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  instance.exec(schema);

  return instance;
}

/**
 * Replaces the singleton with a provided instance.
 * Used by tests to inject an in-memory DB.
 */
export function setDb(db: Database.Database): void {
  instance = db;
}

/**
 * Closes and clears the singleton. Used by tests for cleanup.
 */
export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
