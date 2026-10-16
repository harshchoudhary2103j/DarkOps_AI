import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 15, // 15 seconds
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        // Do not retry 4xx client errors
        if (error?.statusCode >= 400 && error?.statusCode < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false, // Never retry mutations automatically to prevent accidental duplicates
    },
  },
});

export const queryKeys = {
  health: ['health'] as const,
  stores: ['stores'] as const,
  store: (id: string) => ['stores', id] as const,
  serviceZones: (storeId?: string) => ['service-zones', { storeId }] as const,
  skus: ['skus'] as const,
  inventory: (filters?: Record<string, any>) => ['inventory', filters] as const,
  inventoryItem: (storeId: string, skuId: string) => ['inventory', storeId, skuId] as const,
  movements: (storeId?: string, skuId?: string) => ['movements', { storeId, skuId }] as const,
  recommendations: (filters?: Record<string, any>) => ['recommendations', filters] as const,
  orders: (filters?: Record<string, any>) => ['orders', filters] as const,
  order: (id: string) => ['orders', id] as const,
  pickingTasks: (storeId?: string, status?: string) => ['picking-tasks', { storeId, status }] as const,
  pickingTask: (id: string) => ['picking-tasks', id] as const,
  layout: (storeId: string) => ['warehouse-layout', storeId] as const,
  routeOptimization: (key: string) => ['route-optimization', key] as const,
  evaluationKpis: (runId: string) => ['evaluation-kpis', runId] as const,
  evaluationCompare: (baseId: string, candId: string) => ['evaluation-compare', baseId, candId] as const,
};
