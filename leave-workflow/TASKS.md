# TASKS.md — Agent Work Division

## 🤖 Antigravity (this agent) → Backend
**Branch: `main`**
Files owned:
- `src/` — all TypeScript source (domain, db, repos, services, schemas, middleware, controllers, routes, app, server)
- `tests/` — all unit + integration tests
- `vitest.config.ts`, `eslint.config.js`, `tsconfig.json`, `.prettierrc`, `.env.example`

**Status:** ✅ All backend source files written. Working on tests + README next.

---

## 🤖 Google Jules → Frontend
**Branch: `frontend`**

> **Jules: clone this repo, checkout the `frontend` branch, and implement ONLY the files listed below.**

### Your task: Build `public/index.html`, `public/styles.css`, `public/app.js`

The backend API is fully running on `http://localhost:3000`. Do NOT touch anything in `src/` or `tests/`.

---

### API endpoints Jules can call (all return JSON):

| Method | URL | Description |
|---|---|---|
| GET | `/actors` | Returns `[{id, name, role}]` — used to populate the "Acting as" dropdown |
| POST | `/requests` | Create a new leave request |
| POST | `/requests/:id/transition` | Apply submit/approve/reject |
| GET | `/requests/:id` | Get request + timeline + allowedTransitions |
| GET | `/requests/:id/timeline` | Get ordered timeline only |
| GET | `/requests` | List with `?status=`, `?employeeId=`, `?limit=`, `?offset=` |

### Data shapes

**Request object (from GET /requests/:id):**
```json
{
  "id": "uuid",
  "employeeId": "emp-001",
  "leaveType": "annual",
  "startDate": "2026-11-02",
  "endDate": "2026-11-05",
  "reason": "Family trip",
  "status": "submitted",
  "allowedTransitions": [
    { "action": "approve", "to": "manager_approved", "requiredRole": "manager" },
    { "action": "reject",  "to": "rejected",         "requiredRole": "manager" }
  ],
  "createdAt": "2026-10-14T07:00:00.000Z",
  "updatedAt": "2026-10-14T07:05:00.000Z",
  "timeline": [
    { "id": 1, "fromState": null, "toState": "draft", "action": "create",
      "actorId": "emp-001", "actorRole": "employee", "comment": "Request created",
      "timestamp": "2026-10-14T07:00:00.000Z" }
  ]
}
```

**Error envelope (on 4xx/5xx):**
```json
{ "error": { "code": "INVALID_TRANSITION", "message": "...", "allowedTransitions": [...], "requestId": "..." } }
```

---

### Layout spec (top to bottom):

**1. Header**
- Title: "Leave Request Workflow"
- "Acting as:" `<select>` dropdown — call `GET /actors` on page load, populate with `{id} — {name} ({role})`. Store selected actor id as the `actorId` for all transition calls.

**2. Left panel — Request list**
- Status filter `<select>`: options = All | `pending_manager` | `pending_hr` | `pending_completion` | `completed` | `rejected`
- Clicking filter calls `GET /requests?status={value}` and re-renders cards
- Each card shows: short id (first 8 chars), leave type, start–end dates, status badge (color-coded)
- Clicking a card opens it in the right panel
- "New Request" button: opens a form with fields: employeeId (pre-filled from dropdown), leaveType (select), startDate, endDate, reason → `POST /requests`

**3. Right panel — Request detail**

**3a. Stepper** — 5 pipeline nodes connected by a horizontal line:
```
Draft → Submitted → Manager Approved → HR Approved → Completed
```
Pipeline order is always this exact sequence.

- **Before current state:** green circle with ✓ checkmark
- **Current state (non-terminal):** blue circle, slightly larger, pulsing CSS ring animation
- **Future states:** grey circle
- **If `rejected`:** find the `fromState` of the LAST timeline entry → that node turns red with ✗, all nodes after it stay grey. Show a red "❌ Request Rejected" banner above the stepper.
- **If `completed`:** all 5 nodes turn green with ✓

Use `<ol>` with `aria-current="step"` on the current node.

**3b. Action bar**
- `<textarea>` for comment (required, trimmed — send in every API call)
- One `<button>` per entry in `allowedTransitions`:
  - Label: capitalize the action (`Submit` / `Approve` / `Reject`)
  - If the selected actor's `role` does NOT match `transition.requiredRole` → disable the button + add `title` tooltip: "Requires role: {requiredRole}"
  - On click: call `POST /requests/:id/transition` with `{actorId, action, comment}`
  - On API error (403/422/409): show the `error.message` in a red inline alert div
  - On success: re-render the whole detail panel

**3c. Timeline**
- Vertical list, ordered oldest → newest (index 0 at top)
- Each entry: action badge (color-coded) | `{fromState} → {toState}` | actor name + role | localized timestamp | comment

---

### Required JS function names in `public/app.js` (keep exactly):
```
api(path, options)         — fetch wrapper, throws error envelope on 4xx/5xx
loadActors()               — populate header dropdown from GET /actors
loadList()                 — fetch + render left panel cards
selectRequest(id)          — fetch GET /requests/:id and render right panel
renderStepper(request)     — render the 5-node stepper
renderActions(request)     — render comment textarea + transition buttons
renderTimeline(timeline)   — render the ordered timeline list
submitTransition(action)   — POST /requests/:id/transition, refresh panel on success
createRequest(formData)    — POST /requests, refresh list on success
escapeHtml(str)            — sanitize ALL user-provided strings before inserting into DOM
```

> ⚠️ **Security rule:** NEVER use `innerHTML` with raw user data. Always pass user text through `escapeHtml()` first.
> ⚠️ **CSP rule:** No inline `onclick` handlers. Use `addEventListener` only. No `<style>` or `<script>` tags in HTML body.

---

### Styling requirements (`public/styles.css`):
- Clean, modern look — no frameworks, pure CSS
- Responsive down to 360px: stepper becomes vertical on narrow screens (`@media (max-width: 480px)`)
- Status badge colors: draft=grey, submitted=blue, manager_approved=orange, hr_approved=purple, completed=green, rejected=red
- Stepper node colors: done=green, current=blue (pulsing ring animation), future=grey, rejected-node=red
- Sufficient contrast ratios (WCAG AA)
- Action buttons: Approve=green, Reject=red, Submit=blue
- All buttons keyboard-accessible (visible focus ring)

---

### Seeded actors (available for testing):
| id | name | role |
|---|---|---|
| emp-001 | Asha | employee |
| emp-002 | Ravi | employee |
| mgr-001 | Meera | manager |
| hr-001 | Kabir | hr |

---

### How to run locally:
```bash
npm install
npm run db:seed
npm run dev        # starts on http://localhost:3000
```

### Merge instructions:
When done, open a PR from `frontend` → `main`. Do not merge — the human will review.
