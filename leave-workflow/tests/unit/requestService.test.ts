/**
 * requestService.test.ts — Service layer unit tests using an in-memory SQLite DB.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { setDb, closeDb } from '../../src/db/connection';
import { seedActors } from '../../src/db/seed';
import * as requestService from '../../src/services/requestService';
import {
  InvalidTransitionError,
  ForbiddenError,
  NotFoundError,
  ConcurrentModificationError,
} from '../../src/domain/errors';

/** Creates a fresh in-memory DB, applies schema, seeds actors. */
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(
    path.join(__dirname, '../../src/db/schema.sql'),
    'utf-8',
  );
  db.exec(schema);
  return db;
}

beforeEach(() => {
  const db = createTestDb();
  setDb(db);
  seedActors(db);
});

// ─── helpers ────────────────────────────────────────────────────────────────

function makeRequest() {
  return requestService.createRequest({
    employeeId: 'emp-001',
    leaveType: 'annual',
    startDate: '2026-11-01',
    endDate: '2026-11-05',
    reason: 'Holiday',
  });
}

function fullApproval(id: string) {
  requestService.transition(id, { actorId: 'emp-001', action: 'submit', comment: 'Please approve' });
  requestService.transition(id, { actorId: 'mgr-001', action: 'approve', comment: 'Approved by manager' });
  requestService.transition(id, { actorId: 'hr-001', action: 'approve', comment: 'Approved by HR' });
  requestService.transition(id, { actorId: 'hr-001', action: 'approve', comment: 'Final approval' });
}

// ─── createRequest ───────────────────────────────────────────────────────────

describe('createRequest', () => {
  it('creates a request in draft state', () => {
    const req = makeRequest();
    expect(req.status).toBe('draft');
    expect(req.employeeId).toBe('emp-001');
  });

  it('writes an initial timeline event with action=create', () => {
    const req = makeRequest();
    expect(req.timeline).toHaveLength(1);
    expect(req.timeline[0].action).toBe('create');
    expect(req.timeline[0].fromState).toBeNull();
    expect(req.timeline[0].toState).toBe('draft');
  });

  it('throws NotFoundError for unknown employeeId', () => {
    expect(() =>
      requestService.createRequest({
        employeeId: 'emp-999',
        leaveType: 'sick',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        reason: 'Sick',
      }),
    ).toThrow(NotFoundError);
  });

  it('throws ForbiddenError if actor is not an employee', () => {
    expect(() =>
      requestService.createRequest({
        employeeId: 'mgr-001',
        leaveType: 'sick',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        reason: 'Sick',
      }),
    ).toThrow(ForbiddenError);
  });
});

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('transition — happy path', () => {
  it('full approval path ends in completed', () => {
    const req = makeRequest();
    fullApproval(req.id);
    const final = requestService.getRequestWithTimeline(req.id);
    expect(final.status).toBe('completed');
  });

  it('timeline has 5 entries after full approval (create + 4 transitions)', () => {
    const req = makeRequest();
    fullApproval(req.id);
    const final = requestService.getRequestWithTimeline(req.id);
    expect(final.timeline).toHaveLength(5);
  });

  it('status always equals the toState of the latest timeline entry', () => {
    const req = makeRequest();
    const checkConsistency = (id: string) => {
      const r = requestService.getRequestWithTimeline(id);
      const last = r.timeline[r.timeline.length - 1];
      expect(r.status).toBe(last.toState);
    };
    checkConsistency(req.id);
    requestService.transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'Submit' });
    checkConsistency(req.id);
    requestService.transition(req.id, { actorId: 'mgr-001', action: 'approve', comment: 'Approve' });
    checkConsistency(req.id);
  });
});

// ─── Reject scenarios ────────────────────────────────────────────────────────

describe('transition — reject', () => {
  it('reject from submitted -> rejected', () => {
    const req = makeRequest();
    requestService.transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'Submit' });
    requestService.transition(req.id, { actorId: 'mgr-001', action: 'reject', comment: 'No coverage' });
    const r = requestService.getRequestWithTimeline(req.id);
    expect(r.status).toBe('rejected');
  });

  it('reject from manager_approved -> rejected', () => {
    const req = makeRequest();
    requestService.transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'Submit' });
    requestService.transition(req.id, { actorId: 'mgr-001', action: 'approve', comment: 'Manager OK' });
    requestService.transition(req.id, { actorId: 'hr-001', action: 'reject', comment: 'HR no' });
    const r = requestService.getRequestWithTimeline(req.id);
    expect(r.status).toBe('rejected');
  });

  it('reject from hr_approved -> rejected', () => {
    const req = makeRequest();
    requestService.transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'Submit' });
    requestService.transition(req.id, { actorId: 'mgr-001', action: 'approve', comment: 'Mgr OK' });
    requestService.transition(req.id, { actorId: 'hr-001', action: 'approve', comment: 'HR OK' });
    requestService.transition(req.id, { actorId: 'hr-001', action: 'reject', comment: 'Changed mind' });
    const r = requestService.getRequestWithTimeline(req.id);
    expect(r.status).toBe('rejected');
  });

  it('reject from draft throws InvalidTransitionError', () => {
    const req = makeRequest();
    expect(() =>
      requestService.transition(req.id, { actorId: 'mgr-001', action: 'reject', comment: 'No' }),
    ).toThrow(InvalidTransitionError);
  });

  it('reject from completed throws InvalidTransitionError', () => {
    const req = makeRequest();
    fullApproval(req.id);
    expect(() =>
      requestService.transition(req.id, { actorId: 'hr-001', action: 'reject', comment: 'No' }),
    ).toThrow(InvalidTransitionError);
  });

  it('reject from rejected throws InvalidTransitionError', () => {
    const req = makeRequest();
    requestService.transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'Submit' });
    requestService.transition(req.id, { actorId: 'mgr-001', action: 'reject', comment: 'No' });
    expect(() =>
      requestService.transition(req.id, { actorId: 'hr-001', action: 'reject', comment: 'No' }),
    ).toThrow(InvalidTransitionError);
  });
});

// ─── Role / ownership checks ─────────────────────────────────────────────────

describe('transition — role and ownership errors', () => {
  it('wrong role throws ForbiddenError', () => {
    const req = makeRequest();
    requestService.transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'Submit' });
    // hr-001 tries manager action
    expect(() =>
      requestService.transition(req.id, { actorId: 'hr-001', action: 'approve', comment: 'No' }),
    ).toThrow(ForbiddenError);
  });

  it('non-owner submit throws ForbiddenError', () => {
    const req = makeRequest(); // owned by emp-001
    expect(() =>
      requestService.transition(req.id, { actorId: 'emp-002', action: 'submit', comment: 'Try' }),
    ).toThrow(ForbiddenError);
  });
});

// ─── Concurrent modification ─────────────────────────────────────────────────

describe('transition — optimistic locking', () => {
  it('version mismatch throws ConcurrentModificationError', () => {
    const req = makeRequest();
    // Manually bump the version to simulate a concurrent update
    const { getDb } = require('../../src/db/connection');
    getDb().prepare('UPDATE leave_requests SET version = version + 1 WHERE id = ?').run(req.id);

    expect(() =>
      requestService.transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'Submit' }),
    ).toThrow(ConcurrentModificationError);
  });
});

// ─── getTimeline ─────────────────────────────────────────────────────────────

describe('getTimeline', () => {
  it('throws NotFoundError for unknown request', () => {
    expect(() =>
      requestService.getTimeline('00000000-0000-0000-0000-000000000000'),
    ).toThrow(NotFoundError);
  });

  it('returns entries ordered oldest first', () => {
    const req = makeRequest();
    requestService.transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'Submit' });
    const timeline = requestService.getTimeline(req.id);
    expect(timeline[0].action).toBe('create');
    expect(timeline[1].action).toBe('submit');
  });
});
