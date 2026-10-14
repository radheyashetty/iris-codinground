/**
 * states.ts — All lifecycle states, action types, roles, and status filter aliases.
 * Used by: src/domain/transitions.ts, src/domain/errors.ts, src/schemas/requestSchemas.ts,
 *           src/repositories/requestRepository.ts, src/services/requestService.ts, public/app.js
 */

/** All lifecycle states. String values are stored in DB and sent over the API. */
export const RequestState = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  MANAGER_APPROVED: 'manager_approved',
  HR_APPROVED: 'hr_approved',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
} as const;

export type RequestState = (typeof RequestState)[keyof typeof RequestState];

/** The three actions an actor can take on a request. */
export type Action = 'submit' | 'approve' | 'reject';

/** The three roles in the system. */
export type Role = 'employee' | 'manager' | 'hr';

/** Happy-path order of the pipeline. The UI (public/app.js) hardcodes this same order for its stepper. */
export const PIPELINE_ORDER: RequestState[] = [
  'draft',
  'submitted',
  'manager_approved',
  'hr_approved',
  'completed',
];

/** Terminal states that accept no further transitions. */
export const TERMINAL_STATES: ReadonlySet<RequestState> = new Set(['completed', 'rejected']);

/** Alias map: friendly query param values -> concrete state arrays. */
const ALIASES: Record<string, RequestState[]> = {
  pending_manager: ['submitted'],
  pending_hr: ['manager_approved'],
  pending_completion: ['hr_approved'],
  pending: ['submitted', 'manager_approved', 'hr_approved'],
};

/**
 * Turns a raw `?status=` value into concrete states.
 * Returns null if the value is unknown (triggers 400 VALIDATION_ERROR).
 * Used by: src/schemas/requestSchemas.ts
 */
export function resolveStatusFilter(value: string): RequestState[] | null {
  if (value in ALIASES) return ALIASES[value];
  return (Object.values(RequestState) as string[]).includes(value) ? [value as RequestState] : null;
}
