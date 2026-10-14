/**
 * transitions.ts — Single source of truth for the FSM transition table.
 * Used by: src/services/requestService.ts, src/domain/errors.ts
 */
import type { Action, RequestState, Role } from './states';

/** Describes a single valid state machine transition. */
export interface TransitionRule {
  from: RequestState;
  action: Action;
  to: RequestState;
  requiredRole: Role;
}

/**
 * The complete, authoritative transition table.
 * To change the workflow, edit ONLY this table (+ tests). Never duplicate this logic elsewhere.
 */
export const TRANSITION_TABLE: readonly TransitionRule[] = [
  { from: 'draft', action: 'submit', to: 'submitted', requiredRole: 'employee' },
  { from: 'submitted', action: 'approve', to: 'manager_approved', requiredRole: 'manager' },
  { from: 'manager_approved', action: 'approve', to: 'hr_approved', requiredRole: 'hr' },
  { from: 'hr_approved', action: 'approve', to: 'completed', requiredRole: 'hr' },
  { from: 'submitted', action: 'reject', to: 'rejected', requiredRole: 'manager' },
  { from: 'manager_approved', action: 'reject', to: 'rejected', requiredRole: 'hr' },
  { from: 'hr_approved', action: 'reject', to: 'rejected', requiredRole: 'hr' },
];

/**
 * Returns the matching rule for (state, action) or undefined if the move is illegal.
 * Used by: src/services/requestService.ts
 */
export const findTransition = (
  from: RequestState,
  action: Action,
): TransitionRule | undefined =>
  TRANSITION_TABLE.find((r) => r.from === from && r.action === action);

/**
 * Returns all legal moves from a given state, shaped for API responses.
 * Used by: src/domain/errors.ts, src/services/requestService.ts
 */
export const getAllowedTransitions = (
  from: RequestState,
): { action: Action; to: RequestState; requiredRole: Role }[] =>
  TRANSITION_TABLE.filter((r) => r.from === from).map(({ action, to, requiredRole }) => ({
    action,
    to,
    requiredRole,
  }));
