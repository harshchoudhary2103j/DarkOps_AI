import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { kpiEvaluatorService } from '../services/kpi-evaluator.service';
import { CompareRunsRequestSchema } from '../domain/evaluation.schemas';

export const simulationRouter = Router();
export const evaluationRouter = Router();

// -----------------------------------------------------------------------------
// GET /api/v1/simulation/runs/:id/kpis
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

// -----------------------------------------------------------------------------
// POST /api/v1/evaluation/compare
// -----------------------------------------------------------------------------
evaluationRouter.post('/compare', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = CompareRunsRequestSchema.parse(req.body);
    const report = await kpiEvaluatorService.compareRuns(
      validated.baseline_run_id,
      validated.candidate_run_id,
      req.correlationId
    );
    res.status(200).json({ data: report });
  } catch (error) {
    next(error);
  }
});
