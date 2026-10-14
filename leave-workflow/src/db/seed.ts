/**
 * seed.ts — Seeds the database with canonical actors and realistic sample leave requests.
 * Run via: npm run db:seed
 * Used by: tests/* (imports seedActors for in-memory DB setup)
 */
import Database from 'better-sqlite3';
import { getDb } from './connection';

interface SeedActor {
  id: string;
  name: string;
  role: 'employee' | 'manager' | 'hr';
}

const SEED_ACTORS: SeedActor[] = [
  { id: 'emp-001', name: 'Asha', role: 'employee' },
  { id: 'emp-002', name: 'Ravi', role: 'employee' },
  { id: 'mgr-001', name: 'Meera', role: 'manager' },
  { id: 'hr-001', name: 'Kabir', role: 'hr' },
];

interface SampleTimelineEntry {
  fromState: string | null;
  toState: string;
  action: string;
  actorId: string;
  actorRole: string;
  comment: string;
  createdAt: string;
}

interface SampleRequest {
  id: string;
  employeeId: string;
  leaveType: 'annual' | 'sick' | 'casual' | 'unpaid';
  startDate: string;
  endDate: string;
  reason: string;
  status: 'draft' | 'submitted' | 'manager_approved' | 'hr_approved' | 'completed' | 'rejected';
  version: number;
  createdAt: string;
  updatedAt: string;
  timeline: SampleTimelineEntry[];
}

const SAMPLE_REQUESTS: SampleRequest[] = [
  {
    id: 'd1010001-4000-8000-0000-000000000001',
    employeeId: 'emp-001',
    leaveType: 'annual',
    startDate: '2026-12-21',
    endDate: '2026-12-31',
    reason: 'Annual family vacation and Year-End holidays',
    status: 'completed',
    version: 5,
    createdAt: '2026-10-10T09:00:00.000Z',
    updatedAt: '2026-10-12T15:30:00.000Z',
    timeline: [
      {
        fromState: null,
        toState: 'draft',
        action: 'create',
        actorId: 'emp-001',
        actorRole: 'employee',
        comment: 'Drafted holiday leave request',
        createdAt: '2026-10-10T09:00:00.000Z',
      },
      {
        fromState: 'draft',
        toState: 'submitted',
        action: 'submit',
        actorId: 'emp-001',
        actorRole: 'employee',
        comment: 'Submitted request for 9 working days. Coverage arranged with Ravi.',
        createdAt: '2026-10-10T10:15:00.000Z',
      },
      {
        fromState: 'submitted',
        toState: 'manager_approved',
        action: 'approve',
        actorId: 'mgr-001',
        actorRole: 'manager',
        comment: 'Approved. Work handover plan with Ravi looks complete.',
        createdAt: '2026-10-11T11:00:00.000Z',
      },
      {
        fromState: 'manager_approved',
        toState: 'hr_approved',
        action: 'approve',
        actorId: 'hr-001',
        actorRole: 'hr',
        comment: 'Verified annual leave balance (18 days remaining). Approved.',
        createdAt: '2026-10-12T14:00:00.000Z',
      },
      {
        fromState: 'hr_approved',
        toState: 'completed',
        action: 'approve',
        actorId: 'hr-001',
        actorRole: 'hr',
        comment: 'Final signoff complete. Team calendar updated.',
        createdAt: '2026-10-12T15:30:00.000Z',
      },
    ],
  },
  {
    id: 'd2020002-4000-8000-0000-000000000002',
    employeeId: 'emp-002',
    leaveType: 'casual',
    startDate: '2026-11-18',
    endDate: '2026-11-20',
    reason: "Attending cousin's wedding ceremony in Bangalore",
    status: 'manager_approved',
    version: 3,
    createdAt: '2026-10-13T08:30:00.000Z',
    updatedAt: '2026-10-13T14:20:00.000Z',
    timeline: [
      {
        fromState: null,
        toState: 'draft',
        action: 'create',
        actorId: 'emp-002',
        actorRole: 'employee',
        comment: 'Request created',
        createdAt: '2026-10-13T08:30:00.000Z',
      },
      {
        fromState: 'draft',
        toState: 'submitted',
        action: 'submit',
        actorId: 'emp-002',
        actorRole: 'employee',
        comment: 'Requesting 3 days casual leave for family wedding celebration.',
        createdAt: '2026-10-13T09:00:00.000Z',
      },
      {
        fromState: 'submitted',
        toState: 'manager_approved',
        action: 'approve',
        actorId: 'mgr-001',
        actorRole: 'manager',
        comment: 'Approved. Please ensure all sprint pull requests are reviewed before leaving.',
        createdAt: '2026-10-13T14:20:00.000Z',
      },
    ],
  },
  {
    id: 'd3030003-4000-8000-0000-000000000003',
    employeeId: 'emp-001',
    leaveType: 'sick',
    startDate: '2026-10-22',
    endDate: '2026-10-23',
    reason: 'Scheduled dental surgery and post-op recovery',
    status: 'submitted',
    version: 2,
    createdAt: '2026-10-14T07:15:00.000Z',
    updatedAt: '2026-10-14T07:30:00.000Z',
    timeline: [
      {
        fromState: null,
        toState: 'draft',
        action: 'create',
        actorId: 'emp-001',
        actorRole: 'employee',
        comment: 'Request created',
        createdAt: '2026-10-14T07:15:00.000Z',
      },
      {
        fromState: 'draft',
        toState: 'submitted',
        action: 'submit',
        actorId: 'emp-001',
        actorRole: 'employee',
        comment: 'Doctor advised 2 days rest after wisdom tooth procedure. Medical slip attached.',
        createdAt: '2026-10-14T07:30:00.000Z',
      },
    ],
  },
  {
    id: 'd4040004-4000-8000-0000-000000000004',
    employeeId: 'emp-002',
    leaveType: 'annual',
    startDate: '2027-01-18',
    endDate: '2027-01-22',
    reason: 'Planning winter trekking expedition in Himachal Pradesh',
    status: 'draft',
    version: 1,
    createdAt: '2026-10-14T08:00:00.000Z',
    updatedAt: '2026-10-14T08:00:00.000Z',
    timeline: [
      {
        fromState: null,
        toState: 'draft',
        action: 'create',
        actorId: 'emp-002',
        actorRole: 'employee',
        comment: 'Drafting vacation plan for winter trek',
        createdAt: '2026-10-14T08:00:00.000Z',
      },
    ],
  },
  {
    id: 'd5050005-4000-8000-0000-000000000005',
    employeeId: 'emp-002',
    leaveType: 'unpaid',
    startDate: '2026-11-02',
    endDate: '2026-11-06',
    reason: 'Personal travel for landscape photography workshop',
    status: 'rejected',
    version: 3,
    createdAt: '2026-10-08T10:00:00.000Z',
    updatedAt: '2026-10-09T11:45:00.000Z',
    timeline: [
      {
        fromState: null,
        toState: 'draft',
        action: 'create',
        actorId: 'emp-002',
        actorRole: 'employee',
        comment: 'Request created',
        createdAt: '2026-10-08T10:00:00.000Z',
      },
      {
        fromState: 'draft',
        toState: 'submitted',
        action: 'submit',
        actorId: 'emp-002',
        actorRole: 'employee',
        comment: 'Requesting 5 days unpaid leave for professional photography workshop.',
        createdAt: '2026-10-08T11:00:00.000Z',
      },
      {
        fromState: 'submitted',
        toState: 'rejected',
        action: 'reject',
        actorId: 'mgr-001',
        actorRole: 'manager',
        comment: 'Cannot approve leave during Q4 major release week (Nov 2-6). Please reschedule for late November.',
        createdAt: '2026-10-09T11:45:00.000Z',
      },
    ],
  },
];

/**
 * Inserts seed actors into the given DB (idempotent via INSERT OR IGNORE).
 * Used by: tests to populate the in-memory DB before each test.
 */
export function seedActors(db: Database.Database): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO actors (id, name, role) VALUES (?, ?, ?)',
  );
  const insertMany = db.transaction((actors: SeedActor[]) => {
    for (const actor of actors) {
      insert.run(actor.id, actor.name, actor.role);
    }
  });
  insertMany(SEED_ACTORS);
  console.log(`Seeded ${SEED_ACTORS.length} actors.`);
}

/**
 * Clears old request and transition data, temporarily disabling triggers for clean wipe.
 */
export function clearOldData(db: Database.Database): void {
  db.exec(`
    DROP TRIGGER IF EXISTS transitions_no_delete;
    DROP TRIGGER IF EXISTS transitions_no_update;
    DELETE FROM transitions;
    DELETE FROM leave_requests;
    CREATE TRIGGER IF NOT EXISTS transitions_no_update BEFORE UPDATE ON transitions
    BEGIN SELECT RAISE(ABORT, 'transitions is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS transitions_no_delete BEFORE DELETE ON transitions
    BEGIN SELECT RAISE(ABORT, 'transitions is append-only'); END;
  `);
  console.log('Cleared old leave requests and audit transitions.');
}

/**
 * Inserts realistic sample requests representing diverse workflow states.
 */
export function seedSampleRequests(db: Database.Database): void {
  const insertReq = db.prepare(`
    INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, reason, status, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTrans = db.prepare(`
    INSERT INTO transitions (request_id, from_state, to_state, action, actor_id, actor_role, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const populate = db.transaction((requests: SampleRequest[]) => {
    for (const req of requests) {
      insertReq.run(
        req.id,
        req.employeeId,
        req.leaveType,
        req.startDate,
        req.endDate,
        req.reason,
        req.status,
        req.version,
        req.createdAt,
        req.updatedAt,
      );

      for (const t of req.timeline) {
        insertTrans.run(
          req.id,
          t.fromState,
          t.toState,
          t.action,
          t.actorId,
          t.actorRole,
          t.comment,
          t.createdAt,
        );
      }
    }
  });

  populate(SAMPLE_REQUESTS);
  console.log(`Seeded ${SAMPLE_REQUESTS.length} realistic leave requests with full audit history.`);
}

// When run directly as a script, reset and seed the real DB
if (require.main === module) {
  const db = getDb();
  clearOldData(db);
  seedActors(db);
  seedSampleRequests(db);
  db.close();
  console.log('Database seeded with fresh sample data successfully.');
}
