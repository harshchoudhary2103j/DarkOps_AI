import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { kpiEvaluatorService } from '../services/kpi-evaluator.service';
import { CompareRunsRequestSchema } from '../domain/evaluation.schemas';

export { simulationRouter } from './simulation.routes';
export const evaluationRouter = Router();

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
