import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiError } from '../lib/api-client';

describe('API Client Network Integration & Error Handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends correct Authorization and Correlation headers on GET requests', async () => {
    const mockResponse = { data: [{ id: 'st-01', name: 'Brooklyn Hub', code: 'BK-01' }] };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await apiClient.listStores();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('st-01');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchSpy.mock.calls[0];
    expect(calledUrl).toContain('/api/v1/stores');

    const headers = options?.headers as Headers;
    expect(headers.get('Authorization')).toContain('Bearer ');
    expect(headers.get('X-Correlation-Id')).toBeTruthy();
  });

  it('attaches Idempotency-Key header on mutation requests', async () => {
    const mockApproved = { data: { id: 'rec-01', status: 'APPROVED' } };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockApproved,
    } as Response);

    const result = await apiClient.approveRecommendation('rec-01', 'Approved by operator');
    expect(result.data.status).toBe('APPROVED');

    const [, options] = fetchSpy.mock.calls[0];
    const headers = options?.headers as Headers;
    expect(headers.get('Idempotency-Key')).toBeTruthy();
    expect(options?.method).toBe('POST');
  });

  it('translates 4xx structured domain errors into ApiError instances', async () => {
    const mockDomainError = {
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: 'Cannot allocate order: SKU milk_01 has 0 available units.',
        correlationId: 'corr-12345',
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => mockDomainError,
    } as Response);

    try {
      await apiClient.allocateOrder('ord-out-of-stock');
      expect.fail('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe('INSUFFICIENT_STOCK');
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('Cannot allocate order');
      expect(err.correlationId).toBe('corr-12345');
    }
  });

  it('handles network failure gracefully without crashing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Failed to fetch'));

    await expect(apiClient.checkHealth()).rejects.toThrow(ApiError);
  });
});
