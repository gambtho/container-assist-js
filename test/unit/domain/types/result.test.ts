import { describe, it, expect } from '@jest/globals';
import { 
  ok, 
  fail, 
  isOk, 
  isFail, 
  map, 
  chain, 
  unwrap, 
  unwrapOr, 
  all, 
  tryAsync, 
  trySync,
  type Result,
  type AppError 
} from '@domain/types/result.js';

describe('Result Type', () => {
  describe('ok function', () => {
    it('should create successful result', () => {
      const data = { value: 'test' };
      const result = ok(data);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.error).toBeUndefined();
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });
    
    it('should include metadata when provided', () => {
      const result = ok('data', { key: 'value' });
      expect(result.metadata).toEqual({ key: 'value' });
    });
    
    it('should not include metadata property when not provided', () => {
      const result = ok('data');
      expect('metadata' in result).toBe(false);
    });
  });
  
  describe('fail function', () => {
    it('should create failed result from string', () => {
      const result = fail('Error message');
      
      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: 'error',
        message: 'Error message'
      });
      expect(result.data).toBeUndefined();
      expect(result.timestamp).toBeDefined();
    });
    
    it('should create failed result from Error', () => {
      const error = new Error('Test error');
      const result = fail(error);
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Test error');
      expect(result.error?.cause).toBe(error);
      expect(result.error?.code).toBe('error');
    });
    
    it('should create failed result from AppError', () => {
      const appError: AppError = {
        code: 'TEST_ERROR',
        message: 'Test error message',
        context: 'test'
      };
      const result = fail(appError);
      
      expect(result.success).toBe(false);
      expect(result.error).toEqual(appError);
    });
    
    it('should include metadata when provided', () => {
      const result = fail('error', { context: 'test' });
      expect(result.metadata).toEqual({ context: 'test' });
    });
  });
  
  describe('isOk type guard', () => {
    it('should return true for successful results', () => {
      const result = ok('test');
      expect(isOk(result)).toBe(true);
      
      if (isOk(result)) {
        // TypeScript should narrow the type
        expect(result.data).toBe('test');
      }
    });
    
    it('should return false for failed results', () => {
      const result = fail('error');
      expect(isOk(result)).toBe(false);
    });
  });
  
  describe('isFail type guard', () => {
    it('should return true for failed results', () => {
      const result = fail('error');
      expect(isFail(result)).toBe(true);
      
      if (isFail(result)) {
        // TypeScript should narrow the type
        expect(result.error.message).toBe('error');
      }
    });
    
    it('should return false for successful results', () => {
      const result = ok('test');
      expect(isFail(result)).toBe(false);
    });
  });
  
  describe('map function', () => {
    it('should map successful results', () => {
      const result = ok(5);
      const mapped = map(result, x => x * 2);
      
      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.data).toBe(10);
      }
    });
    
    it('should not map failed results', () => {
      const result = fail<number>('error');
      const mapped = map(result, x => x * 2);
      
      expect(isFail(mapped)).toBe(true);
      if (isFail(mapped)) {
        expect(mapped.error.message).toBe('error');
      }
    });
    
    it('should preserve metadata in mapped results', () => {
      const result = ok(5, { original: true });
      const mapped = map(result, x => x * 2);
      
      expect(mapped.metadata).toEqual({ original: true });
    });
  });
  
  describe('chain function', () => {
    it('should chain successful results', () => {
      const result = ok(5);
      const chained = chain(result, x => ok(x * 2));
      
      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.data).toBe(10);
      }
    });
    
    it('should not chain failed results', () => {
      const result = fail<number>('error');
      const chained = chain(result, x => ok(x * 2));
      
      expect(isFail(chained)).toBe(true);
      if (isFail(chained)) {
        expect(chained.error.message).toBe('error');
      }
    });
    
    it('should merge metadata from both results', () => {
      const result = ok(5, { first: true });
      const chained = chain(result, x => ok(x * 2, { second: true }));
      
      expect(chained.metadata).toEqual({ first: true, second: true });
    });
    
    it('should preserve original metadata when new result has no metadata', () => {
      const result = ok(5, { original: true });
      const chained = chain(result, x => ok(x * 2));
      
      expect(chained.metadata).toEqual({ original: true });
    });
  });
  
  describe('unwrap function', () => {
    it('should return data from successful results', () => {
      const result = ok('test');
      expect(unwrap(result)).toBe('test');
    });
    
    it('should throw for failed results', () => {
      const result = fail('error message');
      expect(() => unwrap(result)).toThrow('error message');
    });
    
    it('should throw generic message for failed results without message', () => {
      const result: Result<string> = {
        success: false,
        timestamp: new Date().toISOString()
      };
      expect(() => unwrap(result)).toThrow('Result is not ok');
    });
  });
  
  describe('unwrapOr function', () => {
    it('should return data from successful results', () => {
      const result = ok('test');
      expect(unwrapOr(result, 'default')).toBe('test');
    });
    
    it('should return default value for failed results', () => {
      const result = fail<string>('error');
      expect(unwrapOr(result, 'default')).toBe('default');
    });
  });
  
  describe('all function', () => {
    it('should combine successful results', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = all(results);
      
      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.data).toEqual([1, 2, 3]);
      }
    });
    
    it('should fail if any result fails', () => {
      const results = [ok(1), fail<number>('error'), ok(3)];
      const combined = all(results);
      
      expect(isFail(combined)).toBe(true);
      if (isFail(combined)) {
        expect(combined.error.code).toBe('multiple_errors');
        expect(combined.error.message).toBe('1 operations failed');
      }
    });
    
    it('should include all errors in metadata', () => {
      const results = [
        ok(1), 
        fail<number>('first error'), 
        fail<number>('second error'),
        ok(4)
      ];
      const combined = all(results);
      
      expect(isFail(combined)).toBe(true);
      if (isFail(combined)) {
        expect(combined.error.message).toBe('2 operations failed');
        expect(combined.error.metadata?.errors).toHaveLength(2);
      }
    });
    
    it('should handle edge case with empty failures array', () => {
      // Test with only successful results
      const results = [ok(1), ok(2), ok(3)];
      const combined = all(results);
      
      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.data).toEqual([1, 2, 3]);
      }
    });
    
    it('should handle empty results array', () => {
      const results: Result<number>[] = [];
      const combined = all(results);
      
      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.data).toEqual([]);
      }
    });
  });
  
  describe('tryAsync function', () => {
    it('should return ok result for successful async function', async () => {
      const result = await tryAsync(async () => {
        return 'success';
      });
      
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe('success');
      }
    });
    
    it('should return fail result for rejected async function', async () => {
      const result = await tryAsync(async () => {
        throw new Error('async error');
      });
      
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.message).toBe('async error');
        expect(result.error.code).toBe('async_error');
      }
    });
    
    it('should use custom error code when provided', async () => {
      const result = await tryAsync(async () => {
        throw new Error('custom error');
      }, 'CUSTOM_ERROR');
      
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.code).toBe('CUSTOM_ERROR');
      }
    });
    
    it('should handle non-Error thrown values', async () => {
      const result = await tryAsync(async () => {
        throw 'string error';
      });
      
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.message).toBe('string error');
      }
    });
  });
  
  describe('trySync function', () => {
    it('should return ok result for successful sync function', () => {
      const result = trySync(() => {
        return 'success';
      });
      
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe('success');
      }
    });
    
    it('should return fail result for throwing sync function', () => {
      const result = trySync(() => {
        throw new Error('sync error');
      });
      
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.message).toBe('sync error');
        expect(result.error.code).toBe('sync_error');
      }
    });
    
    it('should use custom error code when provided', () => {
      const result = trySync(() => {
        throw new Error('custom error');
      }, 'CUSTOM_SYNC_ERROR');
      
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.code).toBe('CUSTOM_SYNC_ERROR');
      }
    });
    
    it('should handle non-Error thrown objects', () => {
      const result = trySync(() => {
        throw 'string error';
      });
      
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.message).toBe('string error');
        expect(result.error.code).toBe('sync_error');
      }
    });
  });
});