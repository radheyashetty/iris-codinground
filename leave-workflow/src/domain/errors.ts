/**
 * errors.ts — Typed application error hierarchy.
 * Used by: src/services/requestService.ts, src/middleware/errorHandler.ts
 */
import { getAllowedTransitions } from './transitions';
import type { Action, RequestState } from './states';
import { TERMINAL_STATES } from './states';

/** Base application error. All thrown errors should extend this class. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 — Request body or query params failed Zod validation. */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly details: { path: string; message: string }[],
  ) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

/** 403 — Actor lacks the required role or is not the request owner. */
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(403, 'FORBIDDEN', message);
  }
}

/** 404 — Resource not found. Code is the entity key (REQUEST_NOT_FOUND / ACTOR_NOT_FOUND). */
export class NotFoundError extends AppError {
  constructor(code: 'REQUEST_NOT_FOUND' | 'ACTOR_NOT_FOUND', id: string) {
    const entity = code === 'REQUEST_NOT_FOUND' ? 'Request' : 'Actor';
    super(404, code, `${entity} '${id}' not found`);
  }
}

/** 409 — Optimistic-lock version mismatch; another request updated the record. */
export class ConcurrentModificationError extends AppError {
  constructor() {
    super(409, 'CONCURRENT_MODIFICATION', 'The request was modified by another operation. Please retry.');
  }
}

/** 422 — The (state, action) pair is not in the transition table. */
export class InvalidTransitionError extends AppError {
  public readonly allowedTransitions: ReturnType<typeof getAllowedTransitions>;

  constructor(currentState: RequestState, action: Action) {
    const allowed = getAllowedTransitions(currentState);
    const isTerminal = TERMINAL_STATES.has(currentState);

    const message = isTerminal
      ? `Request is in terminal state '${currentState}'. No transitions allowed.`
      : allowed.length === 0
        ? `No transitions available from state '${currentState}'.`
        : `Cannot '${action}' a request in state '${currentState}'. Allowed: ${allowed.map((a) => a.action).join(', ')}.`;

    super(422, 'INVALID_TRANSITION', message);
    this.allowedTransitions = allowed;
  }
}
