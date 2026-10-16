import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import { SimulationRunStatus } from '../../../types/domain';

interface UseSimulationEventsParams {
  runId?: string | null;
  runStatus?: SimulationRunStatus;
  eventType?: string;
  search?: string;
  limit?: number;
  offset?: number;
  afterSequenceNumber?: number;
}

export function useSimulationEvents({
  runId,
  runStatus,
  eventType,
  search,
  limit = 50,
  offset = 0,
  afterSequenceNumber,
}: UseSimulationEventsParams) {
  return useQuery({
    queryKey: ['simulation-events', runId, eventType, search, limit, offset, afterSequenceNumber],
    queryFn: async () => {
      if (!runId) return { data: [], pagination: { total: 0, limit, offset, has_more: false } };
      const resp = await apiClient.getSimulationEvents(runId, {
        event_type: eventType,
        search,
        limit,
        offset,
        after_sequence_number: afterSequenceNumber,
      });
      return resp;
    },
    enabled: Boolean(runId),
    refetchInterval: () => {
      // Bounded polling: only poll while simulation is actively RUNNING
      if (runStatus === 'RUNNING') {
        return 2000;
      }
      return false;
    },
    staleTime: 1000,
  });
}
