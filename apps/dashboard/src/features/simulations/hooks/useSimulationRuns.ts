import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import { CreateSimulationRunPayload } from '../../../types/domain';
import { useToast } from '../../../components/feedback/ToastProvider';

export function useSimulationScenarios() {
  return useQuery({
    queryKey: ['simulation-scenarios'],
    queryFn: async () => {
      const resp = await apiClient.getSimulationScenarios();
      return resp.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useSimulationRuns(filters?: { scenario_id?: string; status?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['simulation-runs', filters],
    queryFn: async () => {
      const resp = await apiClient.getSimulationRuns(filters);
      return resp;
    },
    staleTime: 5000,
  });
}

export function useSimulationRun(runId?: string | null) {
  return useQuery({
    queryKey: ['simulation-run', runId],
    queryFn: async () => {
      if (!runId) return null;
      const resp = await apiClient.getSimulationRunById(runId);
      return resp.data;
    },
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const run = query.state.data;
      if (!run) return 3000;
      // Active states poll every 2.5s; stopped/terminal runs do not poll
      if (run.status === 'RUNNING' || run.status === 'QUEUED') {
        return 2500;
      }
      return false;
    },
  });
}

export function useCreateSimulationRun() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  return useMutation({
    mutationFn: (payload: CreateSimulationRunPayload) => apiClient.createSimulationRun(payload),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ['simulation-runs'] });
      showSuccess('Simulation Run Created', `Created experiment '${resp.data.id}' with seed ${resp.data.seed}.`);
    },
    onError: (err: any) => {
      showError('Run Creation Failed', err.message || 'Unable to submit simulation run.');
    },
  });
}
