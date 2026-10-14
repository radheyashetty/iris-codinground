/**
 * requestSchemas.ts — Zod validation schemas for all request/response shapes.
 * Used by: src/middleware/validate.ts, src/controllers/requestController.ts
 */
import { z } from 'zod';
import { resolveStatusFilter } from '../domain/states';

/** Validates YYYY-MM-DD and that the date is a real calendar date. */
const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format')
  .refine((val) => !isNaN(Date.parse(val)), { message: 'Must be a valid calendar date' });

/**
 * Schema for POST /requests body.
 * Used by: requestController.create
 */
export const createRequestSchema = z
  .object({
    employeeId: z.string().min(1, 'employeeId is required'),
    leaveType: z.enum(['annual', 'sick', 'casual', 'unpaid']),
    startDate: isoDateString,
    endDate: isoDateString,
    reason: z.string().trim().min(1, 'reason is required').max(500, 'reason max 500 chars'),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

/**
 * Schema for POST /requests/:id/transition body.
 * Used by: requestController.transition
 */
export const transitionSchema = z.object({
  actorId: z.string().min(1, 'actorId is required'),
  action: z.enum(['submit', 'approve', 'reject']),
  comment: z.string().trim().min(1, 'comment is required').max(500, 'comment max 500 chars'),
});

export type TransitionInput = z.infer<typeof transitionSchema>;

/**
 * Schema for GET /requests query params.
 * Used by: requestController.list
 */
export const listQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .refine(
      (val) => val === undefined || resolveStatusFilter(val) !== null,
      { message: 'Unknown status filter value' },
    ),
  employeeId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * Schema for route params containing :id (must be a UUID v4).
 * Used by: requestController.getById, requestController.transition, requestController.getTimeline
 */
export const idParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});
