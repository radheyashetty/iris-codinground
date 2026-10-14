/**
 * requestRepository.ts — SQL queries for the leave_requests table.
 * No business logic; pure data access only.
 * Used by: src/services/requestService.ts
 */
import { getDb } from '../db/connection';
import type { RequestState } from '../domain/states';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: RequestState;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface RawRow {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Maps a snake_case DB row to the camelCase LeaveRequest type. */
function mapRow(row: RawRow): LeaveRequest {
  return {
    id: row.id,
    employeeId: row.employee_id,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    status: row.status as RequestState,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertRequestInput {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  createdAt: string;
}

/**
 * Inserts a new leave request in draft status.
 * Used by: requestService.createRequest()
 */
export function insert(input: InsertRequestInput): void {
  getDb()
    .prepare(
      `INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, reason, status, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)`,
    )
    .run(
      input.id,
      input.employeeId,
      input.leaveType,
      input.startDate,
      input.endDate,
      input.reason,
      input.createdAt,
      input.createdAt,
    );
}

/**
 * Finds a leave request by primary key.
 * Returns undefined if not found.
 * Used by: requestService (transition, get, timeline).
 */
export function findById(id: string): LeaveRequest | undefined {
  const row = getDb()
    .prepare('SELECT * FROM leave_requests WHERE id = ?')
    .get(id) as RawRow | undefined;
  return row ? mapRow(row) : undefined;
}

export interface ListRequestsQuery {
  statuses?: RequestState[];
  employeeId?: string;
  limit: number;
  offset: number;
}

export interface ListResult {
  data: LeaveRequest[];
  total: number;
}

/**
 * Returns a paginated, filtered list of requests sorted by created_at DESC.
 * Used by: requestService.listRequests()
 */
export function list(query: ListRequestsQuery): ListResult {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.statuses && query.statuses.length > 0) {
    const placeholders = query.statuses.map(() => '?').join(', ');
    conditions.push(`status IN (${placeholders})`);
    params.push(...query.statuses);
  }

  if (query.employeeId) {
    conditions.push('employee_id = ?');
    params.push(query.employeeId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM leave_requests ${where}`).get(...params) as {
      count: number;
    }
  ).count;

  const rows = db
    .prepare(
      `SELECT * FROM leave_requests ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, query.limit, query.offset) as RawRow[];

  return { data: rows.map(mapRow), total };
}

/**
 * Updates request status using optimistic locking (WHERE version = ?).
 * Returns the number of rows changed (0 means version mismatch -> 409).
 * Used by: requestService.transition() inside a transaction.
 */
export function updateStatus(
  id: string,
  newStatus: RequestState,
  expectedVersion: number,
  updatedAt: string,
): number {
  const result = getDb()
    .prepare(
      'UPDATE leave_requests SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
    )
    .run(newStatus, updatedAt, id, expectedVersion);
  return result.changes;
}
