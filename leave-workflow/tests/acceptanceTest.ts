/**
 * acceptanceTest.ts — Comprehensive script verifying all Section 12 Acceptance Criteria against the live server.
 */

const BASE_URL = 'http://localhost:3000';

interface RequestResult {
  id: string;
  status: string;
  employeeId: string;
  allowedTransitions: { action: string; to: string; requiredRole: string }[];
  timeline: {
    id: number;
    fromState: string | null;
    toState: string;
    action: string;
    actorId: string;
    actorRole: string;
    comment: string;
    timestamp: string;
  }[];
}

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✅ ${msg}`);
}

async function runAcceptance(): Promise<void> {
  console.log('\n======================================================');
  console.log('   RUNNING ACCEPTANCE CHECKLIST (SECTION 12)');
  console.log('======================================================\n');

  // 1. Health check
  console.log('Test 0: Server Health & Actor Seeding');
  const health = await request('/health');
  assert(health.status === 200 && health.body.status === 'ok', 'GET /health returns 200 ok');
  const actors = await request('/actors');
  assert(actors.status === 200 && actors.body.length === 4, 'GET /actors returns 4 seeded actors');

  // 2. Checklist 1: Create request as emp-001 (draft)
  console.log('\nChecklist 1: Create request as emp-001');
  const createRes = await request('/requests', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: 'emp-001',
      leaveType: 'annual',
      startDate: '2026-11-10',
      endDate: '2026-11-15',
      reason: 'Vacation',
    }),
  });
  assert(createRes.status === 201, 'POST /requests returns 201 Created');
  const req1: RequestResult = createRes.body;
  assert(req1.status === 'draft', 'Status is draft');
  assert(req1.allowedTransitions.length === 1 && req1.allowedTransitions[0].action === 'submit', 'Allowed transitions has only submit');
  assert(req1.timeline.length === 1 && req1.timeline[0].action === 'create' && req1.timeline[0].fromState === null, 'Initial timeline event is create');

  // 3. Checklist 3: Trying to approve a draft returns 422 listing submit
  console.log('\nChecklist 3: Attempting illegal transitions on draft');
  const illegalApprove = await request(`/requests/${req1.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: 'mgr-001',
      action: 'approve',
      comment: 'Skipping to manager approve',
    }),
  });
  assert(illegalApprove.status === 422, 'Approving draft returns 422');
  assert(illegalApprove.body.error.code === 'INVALID_TRANSITION', 'Error code is INVALID_TRANSITION');
  assert(
    illegalApprove.body.error.allowedTransitions.some((t: any) => t.action === 'submit'),
    'allowedTransitions lists submit',
  );

  const illegalReject = await request(`/requests/${req1.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: 'mgr-001',
      action: 'reject',
      comment: 'Reject draft',
    }),
  });
  assert(illegalReject.status === 422, 'Rejecting draft returns 422');

  // 4. Checklist 5: Role & Ownership checks
  console.log('\nChecklist 5: Role and Ownership enforcement');
  const nonOwnerSubmit = await request(`/requests/${req1.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: 'emp-002',
      action: 'submit',
      comment: 'Submitting someone else request',
    }),
  });
  assert(nonOwnerSubmit.status === 403, 'Non-owner employee submit is blocked with 403 FORBIDDEN');

  const wrongRoleSubmit = await request(`/requests/${req1.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: 'mgr-001',
      action: 'submit',
      comment: 'Manager submitting',
    }),
  });
  assert(wrongRoleSubmit.status === 403, 'Wrong role submit is blocked with 403 FORBIDDEN');

  // 5. Checklist 2: Happy path full pipeline
  console.log('\nChecklist 2: Happy path pipeline (submit -> manager approve -> hr approve -> complete)');
  const submitRes = await request(`/requests/${req1.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: 'emp-001',
      action: 'submit',
      comment: 'Please approve vacation',
    }),
  });
  assert(submitRes.status === 200 && submitRes.body.status === 'submitted', 'Owner submit advances to submitted');

  const mgrApproveRes = await request(`/requests/${req1.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: 'mgr-001',
      action: 'approve',
      comment: 'Manager approval granted',
    }),
  });
  assert(mgrApproveRes.status === 200 && mgrApproveRes.body.status === 'manager_approved', 'Manager approve advances to manager_approved');

  const hrApproveRes = await request(`/requests/${req1.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: 'hr-001',
      action: 'approve',
      comment: 'HR approval granted',
    }),
  });
  assert(hrApproveRes.status === 200 && hrApproveRes.body.status === 'hr_approved', 'HR approve advances to hr_approved');

  const completeRes = await request(`/requests/${req1.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: 'hr-001',
      action: 'approve',
      comment: 'Final approval completed',
    }),
  });
  assert(completeRes.status === 200 && completeRes.body.status === 'completed', 'Final HR approve advances to completed');
  assert(completeRes.body.allowedTransitions.length === 0, 'Completed request has 0 allowed transitions (terminal)');

  // 6. Checklist 6: Timeline verification
  console.log('\nChecklist 6: Timeline ordered audit trail');
  const timelineRes = await request(`/requests/${req1.id}/timeline`);
  assert(timelineRes.status === 200, 'GET /requests/:id/timeline returns 200');
  const timeline = timelineRes.body;
  assert(timeline.length === 5, 'Timeline has 5 events (create + 4 transitions)');
  assert(timeline[0].action === 'create' && timeline[0].toState === 'draft', 'Event 1: create -> draft');
  assert(timeline[1].action === 'submit' && timeline[1].toState === 'submitted', 'Event 2: submit -> submitted');
  assert(timeline[2].action === 'approve' && timeline[2].toState === 'manager_approved', 'Event 3: approve -> manager_approved');
  assert(timeline[3].action === 'approve' && timeline[3].toState === 'hr_approved', 'Event 4: approve -> hr_approved');
  assert(timeline[4].action === 'approve' && timeline[4].toState === 'completed', 'Event 5: approve -> completed');

  for (const t of timeline) {
    assert(
      t.id && t.toState && t.action && t.actorId && t.actorRole && t.comment && t.timestamp,
      `Event id=${t.id} has all required audit fields (actor, role, timestamp, action, comment)`,
    );
  }

  // 7. Checklist 4: Reject at each of the 3 allowed stages
  console.log('\nChecklist 4: Reject at each of the 3 allowed stages');
  // 4a. Reject from submitted
  const rA = await request('/requests', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: 'emp-002',
      leaveType: 'sick',
      startDate: '2026-12-01',
      endDate: '2026-12-02',
      reason: 'Doctor',
    }),
  });
  await request(`/requests/${rA.body.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: 'emp-002', action: 'submit', comment: 'Submitting sick leave' }),
  });
  const rej1 = await request(`/requests/${rA.body.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: 'mgr-001', action: 'reject', comment: 'Rejected by manager' }),
  });
  assert(rej1.status === 200 && rej1.body.status === 'rejected', 'Reject from submitted -> rejected');
  assert(rej1.body.allowedTransitions.length === 0, 'No further actions allowed after rejection');

  // 4b. Reject from manager_approved
  const rB = await request('/requests', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: 'emp-001',
      leaveType: 'casual',
      startDate: '2026-12-05',
      endDate: '2026-12-06',
      reason: 'Personal',
    }),
  });
  await request(`/requests/${rB.body.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: 'emp-001', action: 'submit', comment: 'Submit casual' }),
  });
  await request(`/requests/${rB.body.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: 'mgr-001', action: 'approve', comment: 'Mgr OK' }),
  });
  const rej2 = await request(`/requests/${rB.body.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: 'hr-001', action: 'reject', comment: 'HR policy limit reached' }),
  });
  assert(rej2.status === 200 && rej2.body.status === 'rejected', 'Reject from manager_approved -> rejected');

  // 4c. Reject from hr_approved
  const rC = await request('/requests', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: 'emp-002',
      leaveType: 'unpaid',
      startDate: '2026-12-10',
      endDate: '2026-12-12',
      reason: 'Travel',
    }),
  });
  await request(`/requests/${rC.body.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: 'emp-002', action: 'submit', comment: 'Submit unpaid' }),
  });
  await request(`/requests/${rC.body.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: 'mgr-001', action: 'approve', comment: 'Mgr OK' }),
  });
  await request(`/requests/${rC.body.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: 'hr-001', action: 'approve', comment: 'HR pre-approve' }),
  });
  const rej3 = await request(`/requests/${rC.body.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: 'hr-001', action: 'reject', comment: 'Cancelled by HR on final check' }),
  });
  assert(rej3.status === 200 && rej3.body.status === 'rejected', 'Reject from hr_approved -> rejected');

  // 8. Checklist 7: Query filtering and aliases
  console.log('\nChecklist 7: Status filter and aliases');
  // Create one in submitted
  const rD = await request('/requests', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: 'emp-001',
      leaveType: 'annual',
      startDate: '2026-12-20',
      endDate: '2026-12-22',
      reason: 'Test filter',
    }),
  });
  await request(`/requests/${rD.body.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: 'emp-001', action: 'submit', comment: 'Submit for filter test' }),
  });

  const filterPendingManager = await request('/requests?status=pending_manager');
  assert(filterPendingManager.status === 200, 'GET /requests?status=pending_manager returns 200');
  assert(
    filterPendingManager.body.data.every((r: any) => r.status === 'submitted'),
    'All returned records have status submitted',
  );

  const filterBogus = await request('/requests?status=invalid_status_name');
  assert(filterBogus.status === 400, 'GET /requests?status=invalid_status_name returns 400 VALIDATION_ERROR');

  console.log('\n======================================================');
  console.log('   🎉 ALL ACCEPTANCE CHECKLIST TESTS PASSED! 🎉');
  console.log('======================================================\n');
}

runAcceptance().catch((err) => {
  console.error('Unexpected failure during acceptance run:', err);
  process.exit(1);
});
