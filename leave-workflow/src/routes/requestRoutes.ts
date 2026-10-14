/**
 * requestRoutes.ts — Express router wiring URLs to controller functions via validation middleware.
 * Used by: src/app.ts
 */
import { Router } from 'express';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/requestController';
import {
  createRequestSchema,
  transitionSchema,
  listQuerySchema,
  idParamSchema,
} from '../schemas/requestSchemas';

const router = Router();

/** GET /health */
router.get('/health', ctrl.health);

/** GET /actors */
router.get('/actors', ctrl.listActors);

/** POST /requests */
router.post('/requests', validate(createRequestSchema, 'body'), ctrl.create);

/** GET /requests */
router.get('/requests', validate(listQuerySchema, 'query'), ctrl.list);

/** GET /requests/:id */
router.get(
  '/requests/:id',
  validate(idParamSchema, 'params'),
  ctrl.getById,
);

/** GET /requests/:id/timeline */
router.get(
  '/requests/:id/timeline',
  validate(idParamSchema, 'params'),
  ctrl.getTimeline,
);

/** POST /requests/:id/transition */
router.post(
  '/requests/:id/transition',
  validate(idParamSchema, 'params'),
  validate(transitionSchema, 'body'),
  ctrl.applyTransition,
);

export default router;
