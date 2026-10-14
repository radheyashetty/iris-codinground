/**
 * actorRepository.ts — SQL queries for the actors table.
 * No business logic; pure data access only.
 * Used by: src/services/requestService.ts
 */
import { getDb } from '../db/connection';

export interface Actor {
  id: string;
  name: string;
  role: 'employee' | 'manager' | 'hr';
}

/**
 * Finds an actor by primary key.
 * Returns undefined if not found.
 * Used by: requestService (to verify actor exists and check role).
 */
export function findById(id: string): Actor | undefined {
  return getDb()
    .prepare('SELECT id, name, role FROM actors WHERE id = ?')
    .get(id) as Actor | undefined;
}

/**
 * Returns all actors ordered by id.
 * Used by: GET /actors endpoint (UI dropdown).
 */
export function list(): Actor[] {
  return getDb()
    .prepare('SELECT id, name, role FROM actors ORDER BY id')
    .all() as Actor[];
}
