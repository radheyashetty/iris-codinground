/**
 * requestService.ts — Business logic layer for leave request workflow.
 * Sits between controllers (HTTP) and repositories (SQL).
 * Used by: src/controllers/requestController.ts
 */
import crypto from 'crypto';
import { getDb } from '../db/connection';
import { findTransition, getAllowedTransitions } from '../domain/transitions';
import { resolveStatusFilter } from '../domain/states';
import {
  NotFoundError,
  ForbiddenError,
  InvalidTransitionError,
  ConcurrentModificationError,
} from '../domain/errors';
import * as actorRepository from '../repositories/actorRepository';
import * as requestRepository from '../repositories/requestRepository';
import * as transitionRepository from '../repositories/transitionRepository';
import type { LeaveRequest } from '../repositories/requestRepository';
import type { TransitionRow } from '../repositories/transitionRepository';
import type { CreateRequestInput, TransitionInput, ListQuery } from '../schemas/requestSchemas';

/** Shape returned by endpoints that include timeline + allowed transitions. */
export interface RequestWithTimeline extends LeaveRequest {
  allowedTransitions: ReturnType<typeof getAllowedTransitions>;
  timeline: TransitionRow[];
}

/** Shape returned by list endpoints (summary, no timeline). */
export interface RequestSummary extends LeaveRequest {
  allowedTransitions: ReturnType<typeof getAllowedTransitions>;
}

export interface ListResult {
  data: RequestSummary[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Loads a request with its timeline and computed allowedTransitions.
 * Used internally by createRequest, transition, getRequestWithTimeline.
 */
function buildRequestWithTimeline(id: string): RequestWithTimeline {
  const request = requestRepository.findById(id);
  if (!request) throw new NotFoundError('REQUEST_NOT_FOUND', id);
  const timeline = transitionRepository.listByRequestId(id);
  return {
    ...request,
    allowedTransitions: getAllowedTransitions(request.status),
    timeline,
  };
}

/**
 * Creates a new leave request in draft state and writes the initial audit row.
 * Validates that the employee exists and has the employee role.
 * Used by: requestController.create
 */
export function createRequest(input: CreateRequestInput): RequestWithTimeline {
  const actor = actorRepository.findById(input.employeeId);
  if (!actor) throw new NotFoundError('ACTOR_NOT_FOUND', input.employeeId);
  if (actor.role !== 'employee') {
    throw new ForbiddenError(`Actor '${input.employeeId}' is not an employee.`);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  requestRepository.insert({
    id,
    employeeId: input.employeeId,
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason,
    createdAt: now,
  });

  transitionRepository.insert({
    requestId: id,
    fromState: null,
    toState: 'draft',
    action: 'create',
    actorId: actor.id,
    actorRole: actor.role,
    comment: 'Request created',
    createdAt: now,
  });

  return buildRequestWithTimeline(id);
}

/**
 * Applies one FSM transition atomically (state update + audit row in one DB transaction).
 * Enforces role rules, ownership for submit, and optimistic locking.
 * Used by: requestController.transition
 */
export function transition(requestId: string, input: TransitionInput): RequestWithTimeline {
  const db = getDb();

  return db.transaction((): RequestWithTimeline => {
    const request = requestRepository.findById(requestId);
    if (!request) throw new NotFoundError('REQUEST_NOT_FOUND', requestId);

    const actor = actorRepository.findById(input.actorId);
    if (!actor) throw new NotFoundError('ACTOR_NOT_FOUND', input.actorId);

    // Validate the transition exists in the FSM table
    const rule = findTransition(request.status, input.action);
    if (!rule) throw new InvalidTransitionError(request.status, input.action);

    // Role check
    if (actor.role !== rule.requiredRole) {
      throw new ForbiddenError(
        `Action '${input.action}' requires role '${rule.requiredRole}'.`,
      );
    }

    // Ownership check for submit
    if (input.action === 'submit' && actor.id !== request.employeeId) {
      throw new ForbiddenError('Only the request owner can submit.');
    }

    const now = new Date().toISOString();

    // Optimistic lock: WHERE id = ? AND version = ?
    const changed = requestRepository.updateStatus(request.id, rule.to, request.version, now);
    if (changed === 0) throw new ConcurrentModificationError();

    transitionRepository.insert({
      requestId: request.id,
      fromState: request.status,
      toState: rule.to,
      action: input.action,
      actorId: actor.id,
      actorRole: actor.role,
      comment: input.comment,
      createdAt: now,
    });

    return buildRequestWithTimeline(request.id);
  })();
}

/**
 * Returns a single request with its full timeline.
 * Used by: requestController.getById
 */
export function getRequestWithTimeline(id: string): RequestWithTimeline {
  return buildRequestWithTimeline(id);
}

/**
 * Returns only the ordered timeline for a request.
 * Used by: requestController.getTimeline
 */
export function getTimeline(requestId: string): TransitionRow[] {
  const request = requestRepository.findById(requestId);
  if (!request) throw new NotFoundError('REQUEST_NOT_FOUND', requestId);
  return transitionRepository.listByRequestId(requestId);
}

/**
 * Returns a paginated, filtered list of requests (no timeline, includes allowedTransitions).
 * Used by: requestController.list
 */
export function listRequests(query: ListQuery): ListResult {
  const statuses = query.status ? resolveStatusFilter(query.status) ?? undefined : undefined;

  const result = requestRepository.list({
    statuses,
    employeeId: query.employeeId,
    limit: query.limit,
    offset: query.offset,
  });

  return {
    data: result.data.map((r) => ({
      ...r,
      allowedTransitions: getAllowedTransitions(r.status),
    })),
    total: result.total,
    limit: query.limit,
    offset: query.offset,
  };
}
