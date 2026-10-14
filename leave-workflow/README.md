# Leave Request Workflow Engine (State Machine)

A robust, table-driven Finite State Machine (FSM) workflow engine and API for leave request approvals, built with TypeScript, Express, SQLite (`better-sqlite3`), and Zod.

---

## 1. Architecture Overview

The system strictly enforces clean unidirectional layering:

```
[ HTTP Client / Browser UI ]
           │
           ▼
[ Routes (Express Router) ]       <-- middleware/validate.ts (Zod)
           │
           ▼
[ Controllers ]                   <-- HTTP parsing & serialization only
           │
           ▼
[ Services (requestService) ]     <-- Workflow rules, atomic FSM transactions
     │                 │
     ▼                 ▼
[ Repositories ]   [ Domain Model ]  (pure FSM table, states, errors)
     │
     ▼
[ SQLite Database ] (better-sqlite3 + triggers + WAL mode)
```

- **`domain/`**: Pure logic with zero dependencies on other layers. Contains `states.ts`, `transitions.ts` (the canonical transition table), and `errors.ts`.
- **`repositories/`**: Parameterized SQL queries only, no business rules.
- **`services/`**: Orchestrates transactions, role verification, ownership checks, and optimistic concurrency locking.
- **`controllers/`**: Extracts parameters, calls services, sends HTTP responses. Never executes SQL directly.

---

## 2. Finite State Machine (FSM)

### States & Pipeline

```
[ Draft ] ──(submit: employee)──> [ Submitted ] ──(approve: manager)──> [ Manager Approved ]
                                       │                                         │
                                (reject: manager)                          (reject: hr)
                                       │                                         │
                                       ▼                                         ▼
                                  [ Rejected ] <─────────────────────────── [ HR Approved ]
                                       ▲                                         │
                                       │                                  (approve: hr)
                                       └─────────── (reject: hr) ─────────────── │
                                                                                 ▼
                                                                           [ Completed ]
```

### Transition Table (`src/domain/transitions.ts`)

| From State | Action | To State | Required Role | Rules / Constraints |
|---|---|---|---|---|
| `draft` | `submit` | `submitted` | `employee` | Must be request owner (`employee_id === actor.id`) |
| `submitted` | `approve` | `manager_approved` | `manager` | |
| `manager_approved` | `approve` | `hr_approved` | `hr` | |
| `hr_approved` | `approve` | `completed` | `hr` | Final terminal state |
| `submitted` | `reject` | `rejected` | `manager` | Terminal state |
| `manager_approved` | `reject` | `rejected` | `hr` | Terminal state |
| `hr_approved` | `reject` | `rejected` | `hr` | Terminal state |

- Any transition not in this table yields `422 INVALID_TRANSITION` along with `allowedTransitions`.
- Terminal states (`completed`, `rejected`) permit zero transitions.
- Append-only audit trail (`transitions` table) is protected by SQLite `BEFORE UPDATE` and `BEFORE DELETE` triggers.

---

## 3. Getting Started

### Prerequisites
- Node.js >= 20 LTS
- npm >= 9

### Installation & Setup

```bash
# 1. Install dependencies
npm install

# 2. Seed database with actors (emp-001 Asha, emp-002 Ravi, mgr-001 Meera, hr-001 Kabir)
npm run db:seed

# 3. Start development server (auto-reloads on file changes)
npm run dev
```

Server starts on `http://localhost:3000`.

---

## 4. Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run development server with `tsx watch` |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm start` | Run compiled production server |
| `npm test` | Run Vitest test suite with v8 coverage check (>= 90% threshold) |
| `npm run lint` | Run ESLint with TypeScript rules |
| `npm run typecheck` | Run `tsc --noEmit` type checking |
| `npm run db:seed` | Seed default actors in SQLite database |

---

## 5. API Documentation & Examples

All requests and responses use JSON.

### 5.1 Create Request
- **Endpoint**: `POST /requests`
- **Body**:
  ```json
  {
    "employeeId": "emp-001",
    "leaveType": "annual",
    "startDate": "2026-11-02",
    "endDate": "2026-11-05",
    "reason": "Family vacation"
  }
  ```
- **Example curl**:
  ```bash
  curl -X POST http://localhost:3000/requests \
    -H "Content-Type: application/json" \
    -d '{"employeeId":"emp-001","leaveType":"annual","startDate":"2026-11-02","endDate":"2026-11-05","reason":"Family vacation"}'
  ```

### 5.2 Submit / Transition Request
- **Endpoint**: `POST /requests/:id/transition`
- **Body**:
  ```json
  {
    "actorId": "emp-001",
    "action": "submit",
    "comment": "Submitting for manager review"
  }
  ```
- **Example curl**:
  ```bash
  curl -X POST http://localhost:3000/requests/<REQUEST_ID>/transition \
    -H "Content-Type: application/json" \
    -d '{"actorId":"emp-001","action":"submit","comment":"Please approve"}'
  ```

### 5.3 Manager Approve
  ```bash
  curl -X POST http://localhost:3000/requests/<REQUEST_ID>/transition \
    -H "Content-Type: application/json" \
    -d '{"actorId":"mgr-001","action":"approve","comment":"Approved by manager"}'
  ```

### 5.4 HR Approve & Complete
  ```bash
  # Step 1: HR Approve
  curl -X POST http://localhost:3000/requests/<REQUEST_ID>/transition \
    -H "Content-Type: application/json" \
    -d '{"actorId":"hr-001","action":"approve","comment":"HR approved"}'

  # Step 2: Final Completion
  curl -X POST http://localhost:3000/requests/<REQUEST_ID>/transition \
    -H "Content-Type: application/json" \
    -d '{"actorId":"hr-001","action":"approve","comment":"Completed"}'
  ```

### 5.5 Get Request Detail
- **Endpoint**: `GET /requests/:id`
  ```bash
  curl http://localhost:3000/requests/<REQUEST_ID>
  ```

### 5.6 Get Request Timeline
- **Endpoint**: `GET /requests/:id/timeline`
  ```bash
  curl http://localhost:3000/requests/<REQUEST_ID>/timeline
  ```

### 5.7 List Requests with Filter & Aliases
- **Endpoint**: `GET /requests?status=...&limit=20&offset=0`
- Supported filter aliases:
  - `pending_manager` -> `submitted`
  - `pending_hr` -> `manager_approved`
  - `pending_completion` -> `hr_approved`
  - `pending` -> `submitted`, `manager_approved`, `hr_approved`
  ```bash
  curl "http://localhost:3000/requests?status=pending_manager"
  ```

### 5.8 List Actors
- **Endpoint**: `GET /actors`
  ```bash
  curl http://localhost:3000/actors
  ```

### 5.9 Health Probe
- **Endpoint**: `GET /health`
  ```bash
  curl http://localhost:3000/health
  ```

---

## 6. How to Add a New State

To add a new state (e.g., `DEPARTMENT_HEAD_APPROVED`):

1. **Update Domain States (`src/domain/states.ts`)**:
   - Add state to `RequestState` object and type:
     ```ts
     export const RequestState = {
       ...
       DEPT_HEAD_APPROVED: 'dept_head_approved',
     } as const;
     ```
   - Update `PIPELINE_ORDER` array if it is part of the sequential happy path.
   - Update `TERMINAL_STATES` if the new state cannot transition further.
   - Update filter aliases if desired.

2. **Update FSM Transition Table (`src/domain/transitions.ts`)**:
   - Add the valid incoming and outgoing transition rules:
     ```ts
     { from: 'submitted', action: 'approve', to: 'dept_head_approved', requiredRole: 'manager' },
     { from: 'dept_head_approved', action: 'approve', to: 'manager_approved', requiredRole: 'manager' },
     { from: 'dept_head_approved', action: 'reject', to: 'rejected', requiredRole: 'manager' },
     ```

3. **Update Database Check Constraints (if applicable)**:
   - If SQLite table constraints restrict state or role names, update `src/db/schema.sql`.

4. **Update Frontend Stepper (`public/app.js` and `public/styles.css`)**:
   - Add the state to the UI stepper pipeline list and badge styling.

5. **Update Unit and Integration Tests**:
   - Update `tests/unit/transitions.test.ts` to cover the new state transitions.
   - Add test cases in `tests/unit/requestService.test.ts` and `tests/integration/requests.api.test.ts`.

---

## 7. Assumptions & Design Decisions

- **Identity & Authentication**: Full JWT/SSO is out of scope. Actor identity is passed via `actorId` in requests and simulated via an "Acting as" selector on the client.
- **Mandatory Comments**: A non-empty comment (1–500 characters) is required on every transition (`submit`, `approve`, `reject`) for complete audit traceability.
- **Role vs State Error Codes**: Role authorization mismatches return `403 FORBIDDEN`, whereas invalid transition actions return `422 INVALID_TRANSITION` containing `allowedTransitions`.
- **Append-only Audit Log**: Database triggers on the `transitions` table reject all `UPDATE` and `DELETE` operations, guaranteeing tamper-proof audit records.
- **Optimistic Locking**: Every status change increments `version` using `UPDATE ... WHERE id=? AND version=?`, rejecting concurrent modifications with `409 CONCURRENT_MODIFICATION`.
