/**
 * transitionRepository.ts — SQL queries for the transitions (audit log) table.
 * NEVER updates or deletes rows — append-only (enforced by DB triggers too).
 * Used by: src/services/requestService.ts
 */
import { getDb } from '../db/connection';

export interface TransitionRow {
  id: number;
  requestId: string;
  fromState: string | null;
  toState: string;
  action: string;
  actorId: string;
  actorRole: string;
  comment: string;
  timestamp: string;
}

export interface InsertTransitionInput {
  requestId: string;
  fromState: string | null;
  toState: string;
  action: string;
  actorId: string;
  actorRole: string;
  comment: string;
  createdAt: string;
}

/**
 * Appends one row to the audit log.
 * Used by: requestService.createRequest() and requestService.transition().
 */
export function insert(input: InsertTransitionInput): void {
  getDb()
    .prepare(
      `INSERT INTO transitions (request_id, from_state, to_state, action, actor_id, actor_role, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.requestId,
      input.fromState ?? null,
      input.toState,
      input.action,
      input.actorId,
      input.actorRole,
      input.comment,
      input.createdAt,
    );
}

/**
 * Returns all timeline entries for a request, ordered oldest -> newest.
 * Used by: requestService.getTimeline() and requestService.getRequestWithTimeline().
 */
export function listByRequestId(requestId: string): TransitionRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, request_id, from_state, to_state, action, actor_id, actor_role, comment, created_at
       FROM transitions WHERE request_id = ? ORDER BY id ASC`,
    )
    .all(requestId) as {
    id: number;
    request_id: string;
    from_state: string | null;
    to_state: string;
    action: string;
    actor_id: string;
    actor_role: string;
    comment: string;
    created_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    requestId: r.request_id,
    fromState: r.from_state,
    toState: r.to_state,
    action: r.action,
    actorId: r.actor_id,
    actorRole: r.actor_role,
    comment: r.comment,
    timestamp: r.created_at,
  }));
}
