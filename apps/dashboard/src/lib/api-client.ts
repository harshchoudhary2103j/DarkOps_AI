import {
  ApiListResponse,
  ApiItemResponse,
  ApiErrorResponse,
  SkuFilterParams,
  OrderFilterParams,
  RecommendationFilterParams,
} from '../types/api';
import {
  Store,
  ServiceZone,
  SKU,
  InventoryPosition,
  InventoryMovement,
  ReplenishmentRecommendation,
  Order,
  PickingTask,
  WarehouseLayout,
  PickerRouteResponse,
  SimulationRun,
  SimulationEvent,
  ScenarioTemplate,
  CreateSimulationRunPayload,
  EvaluationSummary,
  ComparisonReport,
} from '../types/domain';

export class ApiError extends Error {
  code: string;
  statusCode: number;
  correlationId?: string;
  details?: Record<string, any>;

  constructor(code: string, message: string, statusCode: number, correlationId?: string, details?: Record<string, any>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.correlationId = correlationId;
    this.details = details;
  }
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000'
).replace(/\/+$/, '');

const OPT_API_BASE_URL = (
  import.meta.env.VITE_OPTIMIZATION_API_BASE_URL ||
  import.meta.env.VITE_OPT_API_URL ||
  'http://localhost:8000'
).replace(/\/+$/, '');

const AUTH_TOKEN = import.meta.env.VITE_API_AUTH_TOKEN || 'development_jwt_secret_change_in_production_32chars_min';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'uuid-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${AUTH_TOKEN}`);
  headers.set('X-Actor-Id', 'operations-dashboard-operator');

  if (!headers.has('X-Correlation-Id')) {
    headers.set('X-Correlation-Id', generateUUID());
  }

  // Idempotency key for mutation operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method?.toUpperCase() || '')) {
    if (!headers.has('Idempotency-Key')) {
      headers.set('Idempotency-Key', generateUUID());
    }
  }

  try {
    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      let errorBody: ApiErrorResponse | null = null;
      try {
        errorBody = await response.json();
      } catch {
        // Non-JSON response
      }

      const code = errorBody?.error?.code || `HTTP_${response.status}`;
      const message = errorBody?.error?.message || response.statusText || 'An unexpected server error occurred';
      const correlationId = errorBody?.error?.correlationId;
      const details = errorBody?.error?.details;

      throw new ApiError(code, message, response.status, correlationId, details);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('NETWORK_ERROR', (err as Error).message || 'Failed to communicate with Operational API', 0);
  }
}

export const apiClient = {
  // Health
  checkHealth: async () => {
    return request<{ status: string; service: string; timestamp: string }>(`${API_BASE_URL}/healthz`);
  },

  // Stores
  listStores: async (status?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    params.append('limit', '100');
    return request<ApiListResponse<Store>>(`${API_BASE_URL}/api/v1/stores?${params.toString()}`);
  },

  getStore: async (storeId: string) => {
    return request<ApiItemResponse<Store>>(`${API_BASE_URL}/api/v1/stores/${storeId}`);
  },

  // Service Zones
  listServiceZones: async (storeId?: string) => {
    const params = new URLSearchParams();
    if (storeId) params.append('store_id', storeId);
    params.append('limit', '100');
    return request<ApiListResponse<ServiceZone>>(`${API_BASE_URL}/api/v1/service-zones?${params.toString()}`);
  },

  // SKUs
  listSkus: async () => {
    return request<ApiListResponse<SKU>>(`${API_BASE_URL}/api/v1/skus?limit=100`);
  },

  // Inventory Positions
  listInventory: async (filters: SkuFilterParams = {}) => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.store_id) params.append('store_id', filters.store_id);
    if (filters.sku_id) params.append('sku_id', filters.sku_id);
    if (filters.low_stock_only) params.append('low_stock_only', 'true');
    return request<ApiListResponse<InventoryPosition>>(`${API_BASE_URL}/api/v1/inventory?${params.toString()}`);
  },

  getInventoryPosition: async (storeId: string, skuId: string) => {
    return request<ApiItemResponse<InventoryPosition>>(`${API_BASE_URL}/api/v1/inventory/${storeId}/${skuId}`);
  },

  listMovements: async (storeId?: string, skuId?: string) => {
    const params = new URLSearchParams();
    if (storeId) params.append('store_id', storeId);
    if (skuId) params.append('sku_id', skuId);
    params.append('limit', '50');
    return request<ApiListResponse<InventoryMovement>>(`${API_BASE_URL}/api/v1/inventory/movements?${params.toString()}`);
  },

  // Replenishment Recommendations
  listRecommendations: async (filters: RecommendationFilterParams = {}) => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.store_id) params.append('store_id', filters.store_id);
    if (filters.sku_id) params.append('sku_id', filters.sku_id);
    if (filters.status) params.append('status', filters.status);
    return request<ApiListResponse<ReplenishmentRecommendation>>(`${API_BASE_URL}/api/v1/inventory/recommendations?${params.toString()}`);
  },

  generateRecommendations: async (storeId: string, safetyStockFactor = 1.5, leadTimeBufferHours = 24) => {
    return request<ApiItemResponse<ReplenishmentRecommendation[]>>(`${API_BASE_URL}/api/v1/inventory/recommendations/generate`, {
      method: 'POST',
      body: JSON.stringify({
        store_id: storeId,
        safety_stock_factor: safetyStockFactor,
        lead_time_buffer_hours: leadTimeBufferHours,
      }),
    });
  },

  approveRecommendation: async (id: string, reason?: string) => {
    return request<ApiItemResponse<ReplenishmentRecommendation>>(`${API_BASE_URL}/api/v1/inventory/recommendations/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Approved via Operations Dashboard' }),
    });
  },

  rejectRecommendation: async (id: string, reason: string) => {
    return request<ApiItemResponse<ReplenishmentRecommendation>>(`${API_BASE_URL}/api/v1/inventory/recommendations/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  executeRecommendation: async (id: string) => {
    return request<ApiItemResponse<ReplenishmentRecommendation>>(`${API_BASE_URL}/api/v1/inventory/recommendations/${id}/execute`, {
      method: 'POST',
    });
  },

  // Orders
  listOrders: async (filters: OrderFilterParams = {}) => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.store_id) params.append('store_id', filters.store_id);
    if (filters.status) params.append('status', filters.status);
    return request<ApiListResponse<Order>>(`${API_BASE_URL}/api/v1/orders?${params.toString()}`);
  },

  getOrder: async (orderId: string) => {
    return request<ApiItemResponse<Order>>(`${API_BASE_URL}/api/v1/orders/${orderId}`);
  },

  allocateOrder: async (orderId: string) => {
    return request<ApiItemResponse<Order>>(`${API_BASE_URL}/api/v1/orders/${orderId}/allocate`, {
      method: 'POST',
    });
  },

  cancelOrder: async (orderId: string, reason = 'Cancelled by operator') => {
    return request<ApiItemResponse<Order>>(`${API_BASE_URL}/api/v1/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // Picking Tasks
  listPickingTasks: async (storeId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (storeId) params.append('store_id', storeId);
    if (status) params.append('status', status);
    params.append('limit', '50');
    return request<ApiListResponse<PickingTask>>(`${API_BASE_URL}/api/v1/picking/tasks?${params.toString()}`);
  },

  getPickingTask: async (taskId: string) => {
    return request<ApiItemResponse<PickingTask>>(`${API_BASE_URL}/api/v1/picking/tasks/${taskId}`);
  },

  startPickingTask: async (taskId: string, pickerId = 'picker-01') => {
    return request<ApiItemResponse<PickingTask>>(`${API_BASE_URL}/api/v1/picking/tasks/${taskId}/start`, {
      method: 'POST',
      body: JSON.stringify({ picker_id: pickerId }),
    });
  },

  confirmPickItem: async (taskId: string, itemId: string, quantityPicked: number) => {
    return request<ApiItemResponse<PickingTask>>(`${API_BASE_URL}/api/v1/picking/tasks/${taskId}/items/${itemId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ quantity_picked: quantityPicked }),
    });
  },

  // Warehouse Layouts
  getActiveLayout: async (storeId: string) => {
    return request<ApiItemResponse<WarehouseLayout>>(`${API_BASE_URL}/api/v1/warehouse-layouts/store/${storeId}/active`);
  },

  getLayoutById: async (layoutId: string) => {
    return request<ApiItemResponse<WarehouseLayout>>(`${API_BASE_URL}/api/v1/warehouse-layouts/${layoutId}`);
  },

  // Optimization Service: Picker Route
  optimizePickerRoute: async (payload: {
    task_id?: string;
    store_id?: string;
    layout: any;
    pick_items: Array<{ item_id?: string; shelf_id?: string; sku_id?: string; quantity?: number }>;
    time_limit_seconds?: number;
    enable_fallback?: boolean;
  }) => {
    return request<PickerRouteResponse>(`${OPT_API_BASE_URL}/api/v1/optimize/picker-route`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Simulation Scenarios & Runs
  getSimulationScenarios: async () => {
    return request<ApiItemResponse<ScenarioTemplate[]>>(`${API_BASE_URL}/api/v1/simulation/scenarios`);
  },

  getSimulationRuns: async (params?: { scenario_id?: string; status?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.scenario_id) searchParams.set('scenario_id', params.scenario_id);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    const query = searchParams.toString();
    return request<ApiListResponse<SimulationRun>>(`${API_BASE_URL}/api/v1/simulation/runs${query ? `?${query}` : ''}`);
  },

  createSimulationRun: async (payload: CreateSimulationRunPayload) => {
    return request<ApiItemResponse<SimulationRun>>(`${API_BASE_URL}/api/v1/simulation/runs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getSimulationRunById: async (runId: string) => {
    return request<ApiItemResponse<SimulationRun>>(`${API_BASE_URL}/api/v1/simulation/runs/${runId}`);
  },

  pauseSimulationRun: async (runId: string) => {
    return request<ApiItemResponse<SimulationRun>>(`${API_BASE_URL}/api/v1/simulation/runs/${runId}/pause`, {
      method: 'POST',
    });
  },

  resumeSimulationRun: async (runId: string) => {
    return request<ApiItemResponse<SimulationRun>>(`${API_BASE_URL}/api/v1/simulation/runs/${runId}/resume`, {
      method: 'POST',
    });
  },

  cancelSimulationRun: async (runId: string, reason?: string) => {
    return request<ApiItemResponse<SimulationRun>>(`${API_BASE_URL}/api/v1/simulation/runs/${runId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  resetSimulationRun: async (runId: string) => {
    return request<ApiItemResponse<SimulationRun>>(`${API_BASE_URL}/api/v1/simulation/runs/${runId}/reset`, {
      method: 'POST',
    });
  },

  getSimulationEvents: async (
    runId: string,
    params?: { event_type?: string; search?: string; after_sequence_number?: number; limit?: number; offset?: number }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.event_type) searchParams.set('event_type', params.event_type);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.after_sequence_number !== undefined) searchParams.set('after_sequence_number', params.after_sequence_number.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    const query = searchParams.toString();
    return request<ApiListResponse<SimulationEvent>>(`${API_BASE_URL}/api/v1/simulation/runs/${runId}/events${query ? `?${query}` : ''}`);
  },

  // Simulation & Evaluation
  getRunKpis: async (runId: string) => {
    return request<ApiItemResponse<EvaluationSummary>>(`${API_BASE_URL}/api/v1/simulation/runs/${runId}/kpis`);
  },

  compareEvaluationRuns: async (baselineRunId: string, candidateRunId: string) => {
    return request<ApiItemResponse<ComparisonReport>>(`${API_BASE_URL}/api/v1/evaluation/compare`, {
      method: 'POST',
      body: JSON.stringify({
        baseline_run_id: baselineRunId,
        candidate_run_id: candidateRunId,
      }),
    });
  },

  // Interactive Surge Simulator
  evaluateSurgeOrder: async (payload: any) => {
    return request<ApiItemResponse<any>>(`${API_BASE_URL}/api/v1/simulation/surge/evaluate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  emergencySurgeRestock: async (payload: { store_id: string; quantity: number }) => {
    return request<ApiItemResponse<any>>(`${API_BASE_URL}/api/v1/simulation/surge/emergency-restock`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  resetSurgeDatabase: async () => {
    return request<ApiItemResponse<{ success: boolean; message: string; deletedOrdersCount: number }>>(
      `${API_BASE_URL}/api/v1/simulation/surge/reset-data`,
      {
        method: 'POST',
      }
    );
  },

  // ---------------------------------------------------------------------------
  // AI Operations Copilot Endpoints
  // ---------------------------------------------------------------------------
  copilotChat: async (payload: {
    message: string;
    store_id?: string;
    history?: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  }) => {
    return request<ApiItemResponse<{
      reply: string;
      toolCallsExecuted: Array<{
        tool_name: string;
        parameters: any;
        result?: any;
        actionProposal?: any;
        isMutating: boolean;
      }>;
      actionProposal?: any;
      correlationId: string;
    }>>(`${API_BASE_URL}/api/v1/copilot/chat`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  copilotListProposals: async () => {
    return request<ApiItemResponse<any[]>>(`${API_BASE_URL}/api/v1/copilot/proposals`);
  },

  copilotDecideProposal: async (
    proposalId: string,
    decision: 'APPROVE' | 'REJECT',
    reason?: string
  ) => {
    return request<ApiItemResponse<{
      status: string;
      message: string;
      proposal: any;
      verification?: any;
    }>>(`${API_BASE_URL}/api/v1/copilot/proposals/${proposalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    });
  },

  copilotGetAuditLogs: async () => {
    return request<ApiItemResponse<any[]>>(`${API_BASE_URL}/api/v1/copilot/audit-logs`);
  },

  copilotGetTools: async () => {
    return request<ApiItemResponse<any[]>>(`${API_BASE_URL}/api/v1/copilot/tools`);
  },
};

export const api = apiClient;

