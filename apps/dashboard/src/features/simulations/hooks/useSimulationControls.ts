import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import { useToast } from '../../../components/feedback/ToastProvider';

export function useSimulationControls(runId?: string | null) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const invalidateRun = () => {
    if (runId) {
      queryClient.invalidateQueries({ queryKey: ['simulation-run', runId] });
      queryClient.invalidateQueries({ queryKey: ['simulation-events', runId] });
    }
    queryClient.invalidateQueries({ queryKey: ['simulation-runs'] });
  };

  const pauseMutation = useMutation({
    mutationFn: () => {
      if (!runId) throw new Error('No simulation run selected');
      return apiClient.pauseSimulationRun(runId);
    },
    onSuccess: (resp) => {
      invalidateRun();
      showSuccess('Simulation Paused', `Run '${resp.data.id}' is paused.`);
    },
    onError: (err: any) => {
      showError('Pause Failed', err.message || 'Cannot pause simulation.');
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => {
      if (!runId) throw new Error('No simulation run selected');
      return apiClient.resumeSimulationRun(runId);
    },
    onSuccess: (resp) => {
      invalidateRun();
      showSuccess('Simulation Resumed', `Run '${resp.data.id}' resumed execution.`);
    },
    onError: (err: any) => {
      showError('Resume Failed', err.message || 'Cannot resume simulation.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason?: string) => {
      if (!runId) throw new Error('No simulation run selected');
      return apiClient.cancelSimulationRun(runId, reason);
    },
    onSuccess: (resp) => {
      invalidateRun();
      showSuccess('Simulation Cancelled', `Run '${resp.data.id}' has been cancelled.`);
    },
    onError: (err: any) => {
      showError('Cancel Failed', err.message || 'Cannot cancel simulation.');
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => {
      if (!runId) throw new Error('No simulation run selected');
      return apiClient.resetSimulationRun(runId);
    },
    onSuccess: (resp) => {
      invalidateRun();
      showSuccess('Simulation Reset', `Run '${resp.data.id}' reset to QUEUED state.`);
    },
    onError: (err: any) => {
      showError('Reset Failed', err.message || 'Cannot reset simulation.');
    },
  });

  return {
    pauseRun: pauseMutation.mutate,
    resumeRun: resumeMutation.mutate,
    cancelRun: cancelMutation.mutate,
    resetRun: resetMutation.mutate,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isCancelling: cancelMutation.isPending,
    isResetting: resetMutation.isPending,
    isAnyPending:
      pauseMutation.isPending ||
      resumeMutation.isPending ||
      cancelMutation.isPending ||
      resetMutation.isPending,
  };
}
