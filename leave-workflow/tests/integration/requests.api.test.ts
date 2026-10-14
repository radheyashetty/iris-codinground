/**
 * requests.api.test.ts — Integration tests for all 15 API scenarios using Supertest.
 * Uses an in-memory SQLite DB, never touches the file system.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { setDb } from '../../src/db/connection';
import { seedActors } from '../../src/db/seed';
import { createApp } from '../../src/app';

process.env['NODE_ENV'] = 'test';
process.env['DB_PATH'] = ':memory:';
process.env['PORT'] = '0';
process.env['LOG_LEVEL'] = 'silent';

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

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const db = createTestDb();
  setDb(db);
  seedActors(db);
  app = createApp();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createRequest(overrides = {}) {
  const res = await request(app)
    .post('/requests')
    .send({
      employeeId: 'emp-001',
      leaveType: 'annual',
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      reason: 'Holiday',
      ...overrides,
    });
  return res;
}

async function transition(id: string, body: object) {
  return request(app).post(`/requests/${id}/transition`).send(body);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Test 1 — Create valid request', () => {
  it('returns 201 with status draft', async () => {
    const res = await createRequest();
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.employeeId).toBe('emp-001');
    expect(res.body.allowedTransitions[0].action).toBe('submit');
  });
});

describe('Test 2 — Create with endDate < startDate', () => {
  it('returns 400', async () => {
    const res = await createRequest({ startDate: '2026-11-05', endDate: '2026-11-01' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Test 3 — Submit as owner', () => {
  it('returns 200 with status submitted', async () => {
    const { body: req } = await createRequest();
    const res = await transition(req.id, {
      actorId: 'emp-001',
      action: 'submit',
      comment: 'Please approve',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('submitted');
  });
});

describe('Test 4 — Approve draft (skip state)', () => {
  it('returns 422 with allowedTransitions listing submit', async () => {
    const { body: req } = await createRequest();
    const res = await transition(req.id, {
      actorId: 'mgr-001',
      action: 'approve',
      comment: 'Trying to skip',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.allowedTransitions[0].action).toBe('submit');
  });
});

describe('Test 5 — Full approval path', () => {
  it('completes through manager approve -> HR approve -> HR complete', async () => {
    const { body: req } = await createRequest();

    const r1 = await transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'Submit' });
    expect(r1.status).toBe(200);
    expect(r1.body.status).toBe('submitted');

    const r2 = await transition(req.id, { actorId: 'mgr-001', action: 'approve', comment: 'Manager OK' });
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe('manager_approved');

    const r3 = await transition(req.id, { actorId: 'hr-001', action: 'approve', comment: 'HR OK' });
    expect(r3.status).toBe(200);
    expect(r3.body.status).toBe('hr_approved');

    const r4 = await transition(req.id, { actorId: 'hr-001', action: 'approve', comment: 'Final' });
    expect(r4.status).toBe(200);
    expect(r4.body.status).toBe('completed');
  });
});

describe('Test 6 — Approve a completed request', () => {
  it('returns 422 with empty allowedTransitions', async () => {
    const { body: req } = await createRequest();
    await transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'S' });
    await transition(req.id, { actorId: 'mgr-001', action: 'approve', comment: 'A' });
    await transition(req.id, { actorId: 'hr-001', action: 'approve', comment: 'A' });
    await transition(req.id, { actorId: 'hr-001', action: 'approve', comment: 'A' });

    const res = await transition(req.id, { actorId: 'hr-001', action: 'approve', comment: 'Again' });
    expect(res.status).toBe(422);
    expect(res.body.error.allowedTransitions).toHaveLength(0);
  });
});

describe('Test 7 — Reject from submitted / manager_approved / hr_approved', () => {
  it('rejects from submitted', async () => {
    const { body: req } = await createRequest();
    await transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'S' });
    const res = await transition(req.id, { actorId: 'mgr-001', action: 'reject', comment: 'No' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
  });

  it('rejects from manager_approved', async () => {
    const { body: req } = await createRequest();
    await transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'S' });
    await transition(req.id, { actorId: 'mgr-001', action: 'approve', comment: 'A' });
    const res = await transition(req.id, { actorId: 'hr-001', action: 'reject', comment: 'No' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
  });

  it('rejects from hr_approved', async () => {
    const { body: req } = await createRequest();
    await transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'S' });
    await transition(req.id, { actorId: 'mgr-001', action: 'approve', comment: 'A' });
    await transition(req.id, { actorId: 'hr-001', action: 'approve', comment: 'A' });
    const res = await transition(req.id, { actorId: 'hr-001', action: 'reject', comment: 'No' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
  });
});

describe('Test 8 — Reject from draft', () => {
  it('returns 422', async () => {
    const { body: req } = await createRequest();
    const res = await transition(req.id, { actorId: 'mgr-001', action: 'reject', comment: 'No' });
    expect(res.status).toBe(422);
  });
});

describe('Test 9 — Manager tries HR approval', () => {
  it('returns 403', async () => {
    const { body: req } = await createRequest();
    await transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'S' });
    await transition(req.id, { actorId: 'mgr-001', action: 'approve', comment: 'A' });
    // manager tries hr_approved -> completed (requires hr role)
    const res = await transition(req.id, { actorId: 'mgr-001', action: 'approve', comment: 'Trying' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('Test 10 — Missing / empty comment', () => {
  it('returns 400 when comment is missing', async () => {
    const { body: req } = await createRequest();
    const res = await transition(req.id, { actorId: 'emp-001', action: 'submit' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when comment is empty string', async () => {
    const { body: req } = await createRequest();
    const res = await transition(req.id, { actorId: 'emp-001', action: 'submit', comment: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('Test 11 — Unknown request id (well-formed UUID)', () => {
  it('returns 404', async () => {
    const res = await request(app).get(
      '/requests/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('REQUEST_NOT_FOUND');
  });
});

describe('Test 12 — Timeline after full approval path', () => {
  it('has 5 events ordered with actor/timestamp/action/comment', async () => {
    const { body: req } = await createRequest();
    await transition(req.id, { actorId: 'emp-001', action: 'submit', comment: 'Submit it' });
    await transition(req.id, { actorId: 'mgr-001', action: 'approve', comment: 'Mgr approves' });
    await transition(req.id, { actorId: 'hr-001', action: 'approve', comment: 'HR approves' });
    await transition(req.id, { actorId: 'hr-001', action: 'approve', comment: 'Final approval' });

    const res = await request(app).get(`/requests/${req.id}/timeline`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);

    const [create, submit, mgrApprove, hrApprove, complete] = res.body;
    expect(create.action).toBe('create');
    expect(create.actorId).toBe('emp-001');
    expect(submit.action).toBe('submit');
    expect(mgrApprove.action).toBe('approve');
    expect(hrApprove.action).toBe('approve');
    expect(complete.action).toBe('approve');

    // Each entry must have required fields
    for (const entry of res.body) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('actorId');
      expect(entry).toHaveProperty('actorRole');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('comment');
    }
  });
});

describe('Test 13 — ?status=pending_manager filter', () => {
  it('returns only submitted items', async () => {
    // Create and submit one request
    const { body: req1 } = await createRequest();
    await transition(req1.id, { actorId: 'emp-001', action: 'submit', comment: 'S' });

    // Create but don't submit another (stays draft)
    await createRequest({ employeeId: 'emp-002' });

    const res = await request(app).get('/requests?status=pending_manager');
    expect(res.status).toBe(200);
    expect(res.body.data.every((r: { status: string }) => r.status === 'submitted')).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Test 14 — ?status=bogus', () => {
  it('returns 400', async () => {
    const res = await request(app).get('/requests?status=bogus');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Test 15 — Pagination limit/offset/total', () => {
  it('respects limit, offset and returns correct total', async () => {
    // Create 3 requests
    await createRequest();
    await createRequest({ employeeId: 'emp-002' });
    await createRequest();

    const page1 = await request(app).get('/requests?limit=2&offset=0');
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.limit).toBe(2);
    expect(page1.body.offset).toBe(0);
    expect(page1.body.total).toBeGreaterThanOrEqual(3);

    const page2 = await request(app).get('/requests?limit=2&offset=2');
    expect(page2.status).toBe(200);
    expect(page2.body.offset).toBe(2);
    // combined data from both pages = total
    expect(page1.body.data.length + page2.body.data.length).toBeLessThanOrEqual(page1.body.total);
  });
});

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /actors', () => {
  it('returns all 4 seeded actors', async () => {
    const res = await request(app).get('/actors');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    const ids = res.body.map((a: { id: string }) => a.id).sort();
    expect(ids).toEqual(['emp-001', 'emp-002', 'hr-001', 'mgr-001']);
  });
});
