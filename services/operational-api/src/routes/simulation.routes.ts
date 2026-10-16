import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { simulationService } from '../services/simulation.service';
import { kpiEvaluatorService } from '../services/kpi-evaluator.service';
import {
  CreateSimulationRunRequestSchema,
  ListSimulationRunsQuerySchema,
  GetSimulationEventsQuerySchema
} from '../domain/simulation.schemas';

export const simulationRouter = Router();

// -----------------------------------------------------------------------------
// GET /api/v1/simulation/scenarios
// -----------------------------------------------------------------------------
simulationRouter.get('/scenarios', (_req: AuthenticatedRequest, res: Response) => {
  const scenarios = simulationService.getScenarios();
  res.status(200).json({ data: scenarios });
});

// -----------------------------------------------------------------------------
// GET /api/v1/simulation/runs
// -----------------------------------------------------------------------------
simulationRouter.get('/runs', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const filters = ListSimulationRunsQuerySchema.parse(req.query);
    const result = await simulationService.listRuns(filters);
    res.status(200).json({
      data: result.items,
      pagination: {
        total: result.total,
        limit: filters.limit,
        offset: filters.offset
      }
    });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// POST /api/v1/simulation/runs
// -----------------------------------------------------------------------------
simulationRouter.post('/runs', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = CreateSimulationRunRequestSchema.parse(req.body);
    const run = await simulationService.createRun(validated, req.correlationId);
    res.status(201).json({ data: run });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// GET /api/v1/simulation/runs/:id
// -----------------------------------------------------------------------------
simulationRouter.get('/runs/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const run = await simulationService.getRunById(id);
    res.status(200).json({ data: run });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// POST /api/v1/simulation/runs/:id/pause
// -----------------------------------------------------------------------------
simulationRouter.post('/runs/:id/pause', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const run = await simulationService.pauseRun(id);
    res.status(200).json({ data: run });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// POST /api/v1/simulation/runs/:id/resume
// -----------------------------------------------------------------------------
simulationRouter.post('/runs/:id/resume', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const run = await simulationService.resumeRun(id);
    res.status(200).json({ data: run });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// POST /api/v1/simulation/runs/:id/cancel
// -----------------------------------------------------------------------------
simulationRouter.post('/runs/:id/cancel', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const reason = req.body?.reason || 'Cancelled by operator';
    const run = await simulationService.cancelRun(id, reason);
    res.status(200).json({ data: run });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// POST /api/v1/simulation/runs/:id/reset
// -----------------------------------------------------------------------------
simulationRouter.post('/runs/:id/reset', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const run = await simulationService.resetRun(id);
    res.status(200).json({ data: run });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// GET /api/v1/simulation/runs/:id/events
// -----------------------------------------------------------------------------
simulationRouter.get('/runs/:id/events', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const filters = GetSimulationEventsQuerySchema.parse(req.query);
    const result = await simulationService.getEvents(id, filters);
    res.status(200).json({
      data: result.items,
      pagination: {
        total: result.total,
        limit: filters.limit,
        offset: filters.offset,
        has_more: result.has_more
      }
    });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// GET /api/v1/simulation/runs/:id/kpis (Phase 07 Contract)
// -----------------------------------------------------------------------------
simulationRouter.get('/runs/:id/kpis', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const summary = await kpiEvaluatorService.getOrComputeRunKpis(id, req.correlationId);
    res.status(200).json({ data: summary });
  } catch (error) {
    next(error);
  }
});
