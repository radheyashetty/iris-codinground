/**
 * requestController.ts — HTTP glue between Express routes and the service layer.
 * No SQL, no business rules here — only HTTP parsing, calling service, and sending JSON.
 * Used by: src/routes/requestRoutes.ts
 */
import type { Request, Response, NextFunction } from 'express';
import * as requestService from '../services/requestService';
import * as actorRepository from '../repositories/actorRepository';
import type { CreateRequestInput, TransitionInput, ListQuery } from '../schemas/requestSchemas';

/**
 * POST /requests — Create a new leave request.
 */
export function create(req: Request, res: Response, next: NextFunction): void {
  try {
    const result = requestService.createRequest(req.body as CreateRequestInput);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /requests/:id/transition — Apply an FSM action to a request.
 */
export function applyTransition(req: Request, res: Response, next: NextFunction): void {
  try {
    const { id } = req.params as { id: string };
    const result = requestService.transition(id, req.body as TransitionInput);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /requests/:id — Get a single request with timeline.
 */
export function getById(req: Request, res: Response, next: NextFunction): void {
  try {
    const { id } = req.params as { id: string };
    const result = requestService.getRequestWithTimeline(id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /requests/:id/timeline — Get the ordered audit timeline for a request.
 */
export function getTimeline(req: Request, res: Response, next: NextFunction): void {
  try {
    const { id } = req.params as { id: string };
    const result = requestService.getTimeline(id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /requests — List requests with optional status/employeeId filter + pagination.
 */
export function list(req: Request, res: Response, next: NextFunction): void {
  try {
    const result = requestService.listRequests(req.query as unknown as ListQuery);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /actors — Return all actors (used by UI dropdown).
 */
export function listActors(_req: Request, res: Response, next: NextFunction): void {
  try {
    res.status(200).json(actorRepository.list());
  } catch (err) {
    next(err);
  }
}

/**
 * GET /health — Liveness probe.
 */
export function health(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok' });
}
