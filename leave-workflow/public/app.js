const API_BASE = '';
let currentActorId = null;
let currentActorRole = null;
let currentRequestId = null;
const actorMap = new Map();

// Pipeline order is exact
const PIPELINE = ['draft', 'submitted', 'manager_approved', 'hr_approved', 'completed'];
const PIPELINE_LABELS = {
  'draft': 'Draft',
  'submitted': 'Submitted',
  'manager_approved': 'Manager Approved',
  'hr_approved': 'HR Approved',
  'completed': 'Completed'
};

// Required Function 1: escapeHtml
function escapeHtml(str) {
  if (!str) return '';
  const text = document.createTextNode(str);
  const p = document.createElement('p');
  p.appendChild(text);
  return p.innerHTML;
}

// Required Function 2: api
async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const data = await response.json();

  if (!response.ok) {
    if (data.error) {
      throw data.error;
    }
    throw new Error(`API Error: ${response.status}`);
  }

  return data;
}

// Required Function 3: loadActors
async function loadActors() {
  try {
    const actors = await api('/actors');
    const select = document.getElementById('actor-select');
    const empSelect = document.getElementById('new-employee-id');
    select.innerHTML = '';
    if (empSelect) empSelect.innerHTML = '';

    actorMap.clear();
    actors.forEach(actor => {
      actorMap.set(actor.id, actor);
      const option = document.createElement('option');
      option.value = escapeHtml(actor.id);
      option.dataset.role = escapeHtml(actor.role);
      option.textContent = `${escapeHtml(actor.id)} — ${escapeHtml(actor.name)} (${escapeHtml(actor.role)})`;
      select.appendChild(option);

      // Populate new-employee-id with employee actors only
      if (empSelect && actor.role === 'employee') {
        const empOpt = document.createElement('option');
        empOpt.value = escapeHtml(actor.id);
        empOpt.textContent = `${escapeHtml(actor.id)} — ${escapeHtml(actor.name)} (employee)`;
        empSelect.appendChild(empOpt);
      }
    });

    if (actors.length > 0) {
      currentActorId = actors[0].id;
      currentActorRole = actors[0].role;
      if (empSelect && currentActorRole === 'employee') {
        empSelect.value = currentActorId;
      }
    }

    select.addEventListener('change', (e) => {
      currentActorId = e.target.value;
      const actor = actorMap.get(currentActorId);
      currentActorRole = actor ? actor.role : null;

      // If current actor is an employee, auto-select them in the form
      if (empSelect && currentActorRole === 'employee') {
        empSelect.value = currentActorId;
      }

      // Re-render right panel if a request is selected to update button states
      if (currentRequestId) {
        selectRequest(currentRequestId);
      }
    });
  } catch (error) {
    console.error('Failed to load actors:', error);
  }
}

function switchToActor(actorId) {
  const select = document.getElementById('actor-select');
  if (select) {
    select.value = actorId;
    currentActorId = actorId;
    const actor = actorMap.get(currentActorId);
    currentActorRole = actor ? actor.role : null;
    const empSelect = document.getElementById('new-employee-id');
    if (empSelect && currentActorRole === 'employee') {
      empSelect.value = currentActorId;
    }
    if (currentRequestId) {
      selectRequest(currentRequestId);
    }
  }
}

// Required Function 4: loadList
async function loadList() {
  try {
    const statusFilter = document.getElementById('status-filter').value;
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    const res = await api(`/requests${query}`);
    const requests = Array.isArray(res) ? res : (res.data || []);

    const container = document.getElementById('request-list');
    container.innerHTML = '';

    requests.forEach(req => {
      const card = document.createElement('div');
      card.className = `request-card ${currentRequestId === req.id ? 'active' : ''}`;
      card.dataset.id = escapeHtml(req.id);

      const shortId = escapeHtml(req.id).substring(0, 8);
      const leaveType = escapeHtml(req.leaveType);
      const startDate = escapeHtml(req.startDate);
      const endDate = escapeHtml(req.endDate);
      const status = escapeHtml(req.status);

      card.innerHTML = `
        <div class="card-header">
          <span class="card-id">#${shortId}</span>
          <span class="badge badge-${status}">${status.replace('_', ' ')}</span>
        </div>
        <div class="card-type">${leaveType} Leave</div>
        <div class="card-dates">${startDate} to ${endDate}</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.request-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectRequest(req.id);
      });

      container.appendChild(card);
    });

    if (currentRequestId) {
      const exists = requests.some(r => r.id === currentRequestId);
      if (exists) {
        selectRequest(currentRequestId);
      } else if (requests.length > 0) {
        selectRequest(requests[0].id);
      } else {
        currentRequestId = null;
        document.getElementById('request-detail').classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
      }
    } else if (requests.length > 0) {
      selectRequest(requests[0].id);
    } else {
      document.getElementById('request-detail').classList.add('hidden');
      document.getElementById('empty-state').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Failed to load request list:', error);
  }
}

// Required Function 5: selectRequest
async function selectRequest(id) {
  try {
    currentRequestId = id;
    const request = await api(`/requests/${id}`);

    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('request-detail').classList.remove('hidden');

    const shortId = escapeHtml(request.id).substring(0, 8);
    document.getElementById('detail-title').textContent = `Request #${shortId}`;

    const banner = document.getElementById('rejected-banner');
    if (request.status === 'rejected') {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }

    renderStepper(request);
    renderActions(request);
    renderTimeline(request.timeline || []);

  } catch (error) {
    console.error('Failed to load request details:', error);
  }
}

// Required Function 6: renderStepper
function renderStepper(request) {
  const container = document.getElementById('stepper');
  container.innerHTML = '';

  let rejectedAtState = null;
  if (request.status === 'rejected' && request.timeline && request.timeline.length > 0) {
    // Find the fromState of the LAST timeline entry
    const lastEntry = request.timeline[request.timeline.length - 1];
    rejectedAtState = lastEntry.fromState || 'draft'; // Fallback to draft if null
  }

  PIPELINE.forEach(state => {
    const li = document.createElement('li');
    li.className = 'step-node';

    const circle = document.createElement('div');
    circle.className = 'step-circle';

    const label = document.createElement('div');
    label.className = 'step-label';
    label.textContent = PIPELINE_LABELS[state];

    if (request.status === 'completed') {
      li.classList.add('done');
    } else if (request.status === 'rejected') {
      const stateIndex = PIPELINE.indexOf(state);
      const rejectedIndex = PIPELINE.indexOf(rejectedAtState);

      if (stateIndex < rejectedIndex) {
         li.classList.add('done');
      } else if (state === rejectedAtState) {
         li.classList.add('rejected');
         li.setAttribute('aria-current', 'step');
      }
    } else {
      const stateIndex = PIPELINE.indexOf(state);
      const currentIndex = PIPELINE.indexOf(request.status);

      if (stateIndex < currentIndex) {
        li.classList.add('done');
      } else if (state === request.status) {
        li.classList.add('current');
        li.setAttribute('aria-current', 'step');
      }
    }

    li.appendChild(circle);
    li.appendChild(label);
    container.appendChild(li);
  });
}

// Required Function 7: renderActions
function renderActions(request) {
  const container = document.getElementById('actions-content');
  const errorDiv = document.getElementById('action-error');
  container.innerHTML = '';
  errorDiv.classList.add('hidden');
  errorDiv.textContent = '';

  if (!request.allowedTransitions || request.allowedTransitions.length === 0) {
    container.innerHTML = '<p style="color: #666; font-style: italic;">No actions available for this request.</p>';
    return;
  }

  // Current actor indicator
  const currentActor = actorMap.get(currentActorId);
  const actorName = currentActor ? currentActor.name : currentActorId;
  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = 'margin-bottom: 12px; font-size: 0.9rem; color: #495057; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;';
  statusDiv.innerHTML = `
    <span>Acting as: <strong>${escapeHtml(actorName)}</strong> (<em>${escapeHtml(currentActorId)}</em>)</span>
    <span class="badge badge-submitted">${escapeHtml(currentActorRole || 'unknown')}</span>
  `;
  container.appendChild(statusDiv);

  // Stage explanation & Quick switcher
  const stageInfoDiv = document.createElement('div');
  stageInfoDiv.style.cssText = 'padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; font-size: 0.9rem; line-height: 1.4;';

  let targetActorId = null;
  let targetActorName = null;
  let targetActionDesc = '';

  if (request.status === 'draft') {
    const owner = actorMap.get(request.employeeId);
    const ownerName = owner ? owner.name : request.employeeId;
    targetActorId = request.employeeId;
    targetActorName = `${ownerName} (${request.employeeId})`;
    targetActionDesc = `This request is in <strong>Draft</strong>. It must first be <strong>Submitted</strong> by the employee <em>${escapeHtml(targetActorName)}</em> before a manager can approve or reject it.`;
  } else if (request.status === 'submitted') {
    const mgr = Array.from(actorMap.values()).find(a => a.role === 'manager');
    targetActorId = mgr ? mgr.id : 'mgr-001';
    targetActorName = mgr ? `${mgr.name} (${mgr.id}, Manager)` : 'Manager';
    targetActionDesc = `This request has been submitted and is waiting for <strong>Manager Review</strong> by <em>${escapeHtml(targetActorName)}</em>.`;
  } else if (request.status === 'manager_approved') {
    const hr = Array.from(actorMap.values()).find(a => a.role === 'hr');
    targetActorId = hr ? hr.id : 'hr-001';
    targetActorName = hr ? `${hr.name} (${hr.id}, HR)` : 'HR';
    targetActionDesc = `Manager approved! It is now waiting for <strong>HR Approval</strong> by <em>${escapeHtml(targetActorName)}</em>.`;
  } else if (request.status === 'hr_approved') {
    const hr = Array.from(actorMap.values()).find(a => a.role === 'hr');
    targetActorId = hr ? hr.id : 'hr-001';
    targetActorName = hr ? `${hr.name} (${hr.id}, HR)` : 'HR';
    targetActionDesc = `HR approved (stage 1). It is now waiting for <strong>Final Completion</strong> by <em>${escapeHtml(targetActorName)}</em>.`;
  }

  if (targetActionDesc) {
    const isAuthorized = (request.status === 'draft' && currentActorId === request.employeeId) ||
                         (request.status === 'submitted' && currentActorRole === 'manager') ||
                         ((request.status === 'manager_approved' || request.status === 'hr_approved') && currentActorRole === 'hr');

    if (isAuthorized) {
      stageInfoDiv.style.backgroundColor = '#ecfdf5';
      stageInfoDiv.style.border = '1px solid #a7f3d0';
      stageInfoDiv.style.color = '#065f46';
      stageInfoDiv.innerHTML = `✅ <strong>Your turn:</strong> ${targetActionDesc} Enter a comment below and click the action button.`;
    } else {
      stageInfoDiv.style.backgroundColor = '#fffbeb';
      stageInfoDiv.style.border = '1px solid #fde68a';
      stageInfoDiv.style.color = '#92400e';
      stageInfoDiv.innerHTML = `
        <div style="margin-bottom: 8px;">ℹ️ ${targetActionDesc}</div>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span>To proceed with this step:</span>
          <button type="button" class="btn btn-quick-switch" style="padding: 4px 10px; font-size: 0.82rem; background: #d97706; color: white;">
            Switch to ${escapeHtml(targetActorName)}
          </button>
        </div>
      `;
    }
    container.appendChild(stageInfoDiv);

    const switchBtn = stageInfoDiv.querySelector('.btn-quick-switch');
    if (switchBtn && targetActorId) {
      switchBtn.addEventListener('click', () => {
        switchToActor(targetActorId);
      });
    }
  }

  const textarea = document.createElement('textarea');
  textarea.id = 'transition-comment';
  textarea.placeholder = 'Add a comment (required)...';
  container.appendChild(textarea);

  const btnContainer = document.createElement('div');
  btnContainer.className = 'action-buttons';

  let disabledReasons = [];

  request.allowedTransitions.forEach(transition => {
    const btn = document.createElement('button');
    const actionLabel = transition.action.charAt(0).toUpperCase() + transition.action.slice(1);

    let btnClass = 'btn-submit';
    if (transition.action === 'approve') btnClass = 'btn-approve';
    if (transition.action === 'reject') btnClass = 'btn-reject';

    btn.className = `btn ${btnClass}`;
    btn.textContent = `${actionLabel} (${transition.requiredRole})`;

    if (currentActorRole !== transition.requiredRole) {
      btn.disabled = true;
      const r = `Requires role: ${transition.requiredRole}`;
      btn.title = r;
      if (!disabledReasons.includes(r)) disabledReasons.push(r);
    } else if (transition.action === 'submit' && currentActorId !== request.employeeId) {
      btn.disabled = true;
      const r = `Only the request owner (${request.employeeId}) can submit`;
      btn.title = r;
      if (!disabledReasons.includes(r)) disabledReasons.push(r);
    }

    btn.addEventListener('click', () => {
      submitTransition(transition.action);
    });

    btnContainer.appendChild(btn);
  });

  container.appendChild(btnContainer);

  if (disabledReasons.length > 0) {
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top: 10px; font-size: 0.85rem; color: #92400e; background: #fef3c7; padding: 8px 12px; border-radius: 6px; border: 1px solid #fde68a;';
    hint.innerHTML = `⚠️ <strong>Role restriction:</strong> ${escapeHtml(disabledReasons.join('. '))}. Switch <em>Acting as</em> in the top header to an authorized user to proceed.`;
    container.appendChild(hint);
  }
}

// Required Function 8: renderTimeline
function renderTimeline(timeline) {
  const container = document.getElementById('timeline');
  container.innerHTML = '';

  if (!timeline || timeline.length === 0) {
    container.innerHTML = '<p style="color: #666;">No timeline events.</p>';
    return;
  }

  // Ensure it's oldest -> newest (index 0 at top). Assuming backend already does this, but we render in order.
  timeline.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'timeline-entry';

    const actionColor = entry.action === 'reject' ? 'rejected' :
                        entry.action === 'approve' ? 'completed' :
                        'submitted';

    const fromState = escapeHtml(entry.fromState || 'none');
    const toState = escapeHtml(entry.toState);
    const actorObj = actorMap.get(entry.actorId);
    const resolvedName = actorObj ? actorObj.name : (entry.actorName || entry.actorId);
    const actorRole = escapeHtml(entry.actorRole);
    const comment = escapeHtml(entry.comment || 'No comment');
    const date = new Date(entry.timestamp).toLocaleString();

    div.innerHTML = `
      <div>
        <div class="timeline-meta">
          <span class="badge badge-${actionColor}">${escapeHtml(entry.action)}</span>
          <strong>${fromState} → ${toState}</strong>
        </div>
        <div class="timeline-meta">
          ${escapeHtml(resolvedName)} (${actorRole}) • ${date}
        </div>
        <div class="timeline-comment">"${comment}"</div>
      </div>
    `;

    container.appendChild(div);
  });
}

// Required Function 9: submitTransition
async function submitTransition(action) {
  const commentInput = document.getElementById('transition-comment');
  const comment = commentInput.value.trim();
  const errorDiv = document.getElementById('action-error');

  if (!comment) {
    errorDiv.textContent = 'Comment is required.';
    errorDiv.classList.remove('hidden');
    return;
  }

  try {
    errorDiv.classList.add('hidden');
    await api(`/requests/${currentRequestId}/transition`, {
      method: 'POST',
      body: JSON.stringify({
        actorId: currentActorId,
        action: action,
        comment: comment
      })
    });

    // Refresh
    await selectRequest(currentRequestId);
    await loadList();

  } catch (error) {
    errorDiv.textContent = error.message || 'An error occurred during transition.';
    errorDiv.classList.remove('hidden');
  }
}

// Required Function 10: createRequest
async function createRequest(formData) {
  try {
    const data = {
      employeeId: formData.get('employeeId'),
      leaveType: formData.get('leaveType'),
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
      reason: formData.get('reason')
    };

    const newReq = await api('/requests', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    document.getElementById('new-request-form').reset();
    const empSelect = document.getElementById('new-employee-id');
    if (empSelect) {
      if (currentActorRole === 'employee') {
        empSelect.value = currentActorId;
      } else if (empSelect.options.length > 0) {
        empSelect.selectedIndex = 0;
      }
    }

    await loadList();

    // Auto-select the newly created request
    currentRequestId = newReq.id;
    await selectRequest(newReq.id);

    // Highlight in list
    document.querySelectorAll('.request-card').forEach(c => {
        if (c.dataset.id === newReq.id) {
            c.classList.add('active');
        }
    });

  } catch (error) {
    const details = error.details ? '\n' + error.details.map(d => `${d.path}: ${d.message}`).join('\n') : '';
    alert(`Failed to create request: ${error.message || 'Validation error'}${details}`);
  }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  loadActors().then(() => {
    loadList();
  });

  document.getElementById('status-filter').addEventListener('change', () => {
    loadList();
  });

  document.getElementById('new-request-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    createRequest(formData);
  });
});
