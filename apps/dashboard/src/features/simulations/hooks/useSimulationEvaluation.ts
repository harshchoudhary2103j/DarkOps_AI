import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import { SimulationRunStatus } from '../../../types/domain';

export function useRunEvaluation(runId?: string | null, status?: SimulationRunStatus) {
  const isComplete = status === 'SUCCEEDED';

  return useQuery({
    queryKey: ['simulation-evaluation', runId],
    queryFn: async () => {
      if (!runId) return null;
      const resp = await apiClient.getRunKpis(runId);
      return resp.data;
    },
    enabled: Boolean(runId && isComplete),
    staleTime: 30000,
  });
}

export function useCompareRuns() {
  return useMutation({
    mutationFn: ({ baselineRunId, candidateRunId }: { baselineRunId: string; candidateRunId: string }) =>
      apiClient.compareEvaluationRuns(baselineRunId, candidateRunId),
  });
}
