import crypto from 'crypto';
import { PoolClient } from 'pg';
import { idempotencyRepository } from '../repositories/idempotency.repository';
import { ConcurrencyConflictError, IdempotencyKeyReusedError } from './inventory-errors';

export function computeRequestFingerprint(payload: any): string {
  // Recursively sort keys to ensure deterministic representation
  const normalize = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(normalize);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = normalize(obj[key]);
    }
    return result;
  };

  const normalized = normalize(payload);
  const jsonStr = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

export class IdempotencyService {
  /**
   * Guards a mutation command with durable idempotency.
   * If the request is a replay of a previously completed command, returns the stored result.
   * If the key was reused with a different payload, throws IdempotencyKeyReusedError.
   * If another worker is currently processing this key, throws ConcurrencyConflictError.
   */
  async executeIdempotent<T>(
    key: string,
    scope: string,
    actorId: string,
    payload: any,
    operation: (client?: PoolClient) => Promise<{ statusCode: number; data: T }>
  ): Promise<{ cached: boolean; statusCode: number; data: T }> {
    const requestHash = computeRequestFingerprint(payload);

    // 1. Claim key
    const claimResult = await idempotencyRepository.claim(key, scope, actorId, requestHash);

    if (!claimResult.claimed && claimResult.existingRecord) {
      const record = claimResult.existingRecord;

      // Check request hash
      if (record.request_hash !== requestHash) {
        throw new IdempotencyKeyReusedError(
          `Idempotency key '${key}' was previously used with a different request payload`,
          { key, scope, actorId }
        );
      }

      // Check execution status
      if (record.status === 'COMPLETED') {
        return {
          cached: true,
          statusCode: record.response_status || 200,
          data: record.response_body
        };
      }

      if (record.status === 'PROCESSING') {
        throw new ConcurrencyConflictError(
          `A concurrent request with idempotency key '${key}' is currently being processed`,
          { key, scope }
        );
      }
    }

    // 2. Execute operation
    try {
      const result = await operation();
      // Record completed response
      await idempotencyRepository.complete(key, scope, result.statusCode, result.data);
      return {
        cached: false,
        statusCode: result.statusCode,
        data: result.data
      };
    } catch (error) {
      // Clear processing claim so safe retries are permitted
      await idempotencyRepository.fail(key, scope);
      throw error;
    }
  }
}

export const idempotencyService = new IdempotencyService();
