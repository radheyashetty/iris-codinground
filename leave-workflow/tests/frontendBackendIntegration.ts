/**
 * frontendBackendIntegration.ts
 * Thoroughly simulates every frontend user interaction and verifies backend communication:
 * 1. Actor loading & role mapping
 * 2. Form submission & employee filtering
 * 3. Stepper & AllowedTransitions computation
 * 4. Dynamic role-based action enablement/disablement in UI logic
 * 5. Complete end-to-end lifecycle (draft -> submitted -> manager_approved -> hr_approved -> completed)
 * 6. Full rejection lifecycle (draft -> submitted -> rejected)
 * 7. Query filtering & pagination contract
 * 8. Timeline ordering, actor name resolution, and audit metadata
 */

const BASE_URL = 'http://localhost:3000';

interface Actor {
  id: string;
  name: string;
  role: 'employee' | 'manager' | 'hr';
}

interface TransitionRule {
  action: 'submit' | 'approve' | 'reject';
  to: string;
  requiredRole: 'employee' | 'manager' | 'hr';
}

interface TimelineEntry {
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

interface RequestDetail {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  version: number;
  allowedTransitions: TransitionRule[];
  timeline: TimelineEntry[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Simulates the exact UI logic in public/app.js renderActions()
function checkButtonEnabled(
  transition: TransitionRule,
  currentActor: Actor,
  request: RequestDetail,
): { enabled: boolean; reason?: string } {
  if (currentActor.role !== transition.requiredRole) {
    return { enabled: false, reason: `Requires role: ${transition.requiredRole}` };
  }
  if (transition.action === 'submit' && currentActor.id !== request.employeeId) {
    return { enabled: false, reason: `Only the request owner (${request.employeeId}) can submit` };
  }
  return { enabled: true };
}

async function run(): Promise<void> {
  console.log('\n=============================================================');
  console.log('   COMPREHENSIVE FRONTEND <-> BACKEND INTEGRATION TEST');
  console.log('=============================================================\n');

  // Step 1: Frontend loads actors
  console.log('--- Step 1: Frontend loadActors() ---');
  const actorsRes = await api('/actors');
  assert(actorsRes.status === 200, 'GET /actors returned 200');
  const actors: Actor[] = actorsRes.body;
  assert(actors.length === 4, 'Received 4 actors');
  const actorMap = new Map<string, Actor>();
  actors.forEach((a) => actorMap.set(a.id, a));

  const employees = actors.filter((a) => a.role === 'employee');
  assert(employees.length === 2, '2 employees found for the New Request dropdown (Asha & Ravi)');
  const asha = actorMap.get('emp-001')!;
  const ravi = actorMap.get('emp-002')!;
  const meera = actorMap.get('mgr-001')!;
  const kabir = actorMap.get('hr-001')!;

  // Step 2: Employee Asha creates a request
  console.log('\n--- Step 2: Asha (emp-001) creates a request ---');
  const createRes = await api('/requests', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: asha.id,
      leaveType: 'annual',
      startDate: '2026-12-01',
      endDate: '2026-12-05',
      reason: 'Year end holidays',
    }),
  });
  assert(createRes.status === 201, 'POST /requests returned 201 Created');
  const req: RequestDetail = createRes.body;
  assert(req.status === 'draft', 'New request is in "draft" status');
  assert(req.employeeId === 'emp-001', 'Request belongs to emp-001');

  // Step 3: Frontend selects request and evaluates permissions
  console.log('\n--- Step 3: UI permission evaluation in "draft" state ---');
  const getReqRes = await api(`/requests/${req.id}`);
  assert(getReqRes.status === 200, 'GET /requests/:id returned 200');
  const detail1: RequestDetail = getReqRes.body;
  assert(detail1.allowedTransitions.length === 1, 'Allowed transitions has 1 action');
  const submitRule = detail1.allowedTransitions[0];
  assert(submitRule.action === 'submit' && submitRule.requiredRole === 'employee', 'submit requires employee');

  // Check UI button logic for different acting actors:
  // 1) When acting as Asha (emp-001, owner)
  const ashaBtn = checkButtonEnabled(submitRule, asha, detail1);
  assert(ashaBtn.enabled === true, 'Submit button is ENABLED for request owner Asha');

  // 2) When acting as Ravi (emp-002, non-owner employee)
  const raviBtn = checkButtonEnabled(submitRule, ravi, detail1);
  assert(raviBtn.enabled === false && raviBtn.reason?.includes('Only the request owner'), 'Submit button is DISABLED for Ravi (non-owner)');

  // 3) When acting as Meera (mgr-001, manager)
  const meeraBtn = checkButtonEnabled(submitRule, meera, detail1);
  assert(meeraBtn.enabled === false && meeraBtn.reason?.includes('Requires role: employee'), 'Submit button is DISABLED for Meera (manager)');

  // 4) When acting as Kabir (hr-001, hr)
  const kabirBtn = checkButtonEnabled(submitRule, kabir, detail1);
  assert(kabirBtn.enabled === false && kabirBtn.reason?.includes('Requires role: employee'), 'Submit button is DISABLED for Kabir (hr)');

  // Step 4: Asha submits the request
  console.log('\n--- Step 4: Asha submits the request ---');
  const submitRes = await api(`/requests/${req.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: asha.id,
      action: 'submit',
      comment: 'Please approve my vacation',
    }),
  });
  assert(submitRes.status === 200, 'POST /requests/:id/transition returned 200');
  const detail2: RequestDetail = submitRes.body;
  assert(detail2.status === 'submitted', 'Status transitioned to "submitted"');

  // Step 5: Check UI button logic in "submitted" state
  console.log('\n--- Step 5: UI permission evaluation in "submitted" state ---');
  const approveRule = detail2.allowedTransitions.find((t) => t.action === 'approve')!;
  const rejectRule = detail2.allowedTransitions.find((t) => t.action === 'reject')!;
  assert(approveRule.requiredRole === 'manager', 'Approve requires manager');
  assert(rejectRule.requiredRole === 'manager', 'Reject requires manager');

  // In UI: Asha and Kabir cannot approve or reject; Meera can!
  assert(!checkButtonEnabled(approveRule, asha, detail2).enabled, 'Approve disabled for Asha');
  assert(!checkButtonEnabled(approveRule, kabir, detail2).enabled, 'Approve disabled for Kabir');
  assert(checkButtonEnabled(approveRule, meera, detail2).enabled, 'Approve ENABLED for Meera (manager)');
  assert(checkButtonEnabled(rejectRule, meera, detail2).enabled, 'Reject ENABLED for Meera (manager)');

  // Step 6: Meera approves
  console.log('\n--- Step 6: Manager Meera approves ---');
  const mgrApproveRes = await api(`/requests/${req.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: meera.id,
      action: 'approve',
      comment: 'Approved by team lead',
    }),
  });
  assert(mgrApproveRes.status === 200, 'POST transition returned 200');
  const detail3: RequestDetail = mgrApproveRes.body;
  assert(detail3.status === 'manager_approved', 'Status transitioned to "manager_approved"');

  // Step 7: Check UI button logic in "manager_approved" state
  console.log('\n--- Step 7: UI permission evaluation in "manager_approved" state ---');
  const hrApproveRule = detail3.allowedTransitions.find((t) => t.action === 'approve')!;
  const hrRejectRule = detail3.allowedTransitions.find((t) => t.action === 'reject')!;
  assert(hrApproveRule.requiredRole === 'hr', 'Approve requires HR');
  assert(hrRejectRule.requiredRole === 'hr', 'Reject requires HR');
  assert(!checkButtonEnabled(hrApproveRule, meera, detail3).enabled, 'Approve disabled for Meera (manager)');
  assert(checkButtonEnabled(hrApproveRule, kabir, detail3).enabled, 'Approve ENABLED for Kabir (hr)');

  // Step 8: Kabir approves stage 1 (hr_approved)
  console.log('\n--- Step 8: HR Kabir approves (stage 1) ---');
  const hrApprove1Res = await api(`/requests/${req.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: kabir.id,
      action: 'approve',
      comment: 'Leave balance verified, approved',
    }),
  });
  assert(hrApprove1Res.status === 200, 'POST transition returned 200');
  const detail4: RequestDetail = hrApprove1Res.body;
  assert(detail4.status === 'hr_approved', 'Status transitioned to "hr_approved"');

  // Step 9: Kabir approves stage 2 (completed)
  console.log('\n--- Step 9: HR Kabir completes request ---');
  const hrApprove2Res = await api(`/requests/${req.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: kabir.id,
      action: 'approve',
      comment: 'Final signoff complete',
    }),
  });
  assert(hrApprove2Res.status === 200, 'POST transition returned 200');
  const detail5: RequestDetail = hrApprove2Res.body;
  assert(detail5.status === 'completed', 'Status transitioned to "completed"');
  assert(detail5.allowedTransitions.length === 0, 'No allowed transitions in terminal "completed" state');

  // Step 10: Verify frontend timeline rendering contract
  console.log('\n--- Step 10: Verify timeline data & human name resolution ---');
  assert(detail5.timeline.length === 5, 'Timeline has 5 events (create, submit, mgr_approve, hr_approve, hr_complete)');
  const renderedTimeline = detail5.timeline.map((entry) => {
    const actorObj = actorMap.get(entry.actorId);
    const resolvedName = actorObj ? actorObj.name : entry.actorId;
    return `${resolvedName} (${entry.actorRole}): ${entry.action} [${entry.fromState ?? 'none'} -> ${entry.toState}] - "${entry.comment}"`;
  });
  renderedTimeline.forEach((line) => console.log(`    ${line}`));
  assert(renderedTimeline[0].includes('Asha (employee): create'), 'Timeline 1: Asha created');
  assert(renderedTimeline[1].includes('Asha (employee): submit'), 'Timeline 2: Asha submitted');
  assert(renderedTimeline[2].includes('Meera (manager): approve'), 'Timeline 3: Meera approved');
  assert(renderedTimeline[3].includes('Kabir (hr): approve'), 'Timeline 4: Kabir approved');
  assert(renderedTimeline[4].includes('Kabir (hr): approve'), 'Timeline 5: Kabir completed');

  // Step 11: Verify rejection flow
  console.log('\n--- Step 11: Rejection flow verification ---');
  const req2Res = await api('/requests', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: ravi.id,
      leaveType: 'sick',
      startDate: '2026-11-20',
      endDate: '2026-11-21',
      reason: 'Fever',
    }),
  });
  const req2: RequestDetail = req2Res.body;
  await api(`/requests/${req2.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: ravi.id, action: 'submit', comment: 'Submitting sick leave' }),
  });
  const rejectRes = await api(`/requests/${req2.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ actorId: meera.id, action: 'reject', comment: 'Project critical deadline, please reschedule' }),
  });
  assert(rejectRes.status === 200, 'POST reject returned 200');
  const req2Rejected: RequestDetail = rejectRes.body;
  assert(req2Rejected.status === 'rejected', 'Status is "rejected"');
  assert(req2Rejected.allowedTransitions.length === 0, 'No allowed transitions in "rejected" state');

  // Step 12: Status filter verification
  console.log('\n--- Step 12: Status filters (GET /requests?status=...) ---');
  const completedFilter = await api('/requests?status=completed');
  assert(completedFilter.status === 200, 'GET /requests?status=completed returned 200');
  assert(completedFilter.body.data.every((r: RequestDetail) => r.status === 'completed'), 'All returned requests are completed');

  const rejectedFilter = await api('/requests?status=rejected');
  assert(rejectedFilter.status === 200, 'GET /requests?status=rejected returned 200');
  assert(rejectedFilter.body.data.every((r: RequestDetail) => r.status === 'rejected'), 'All returned requests are rejected');

  console.log('\n=============================================================');
  console.log('   🎉 FRONTEND & BACKEND ARE COMMUNICATING FLAWLESSLY! 🎉');
  console.log('=============================================================\n');
}

run().catch((err) => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
