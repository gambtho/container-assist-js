/**
 * Result Type Tests
 * 
 * Tests the simplified Result pattern for error handling
 */

import {
  Result,
  Success,
  Failure,
  isOk,
  isFail,
} from '../../../src/domain/types/result';

describe('Result Pattern', () => {
  describe('Construction', () => {
    it('should create Success result', () => {
      const result = Success(42);

      expect(result).toEqual({
        ok: true,
        value: 42,
      });
    });

    it('should create Failure result', () => {
      const result = Failure<number>('Something went wrong');

      expect(result).toEqual({
        ok: false,
        error: 'Something went wrong',
      });
    });

    it('should handle different value types in Success', () => {
      const stringResult = Success('hello');
      const objectResult = Success({ name: 'John', age: 30 });
      const arrayResult = Success([1, 2, 3]);
      const booleanResult = Success(true);
      const nullResult = Success(null);

      expect(stringResult.ok).toBe(true);
      expect(objectResult.ok).toBe(true);
      expect(arrayResult.ok).toBe(true);
      expect(booleanResult.ok).toBe(true);
      expect(nullResult.ok).toBe(true);
      
      if (stringResult.ok) expect(stringResult.value).toBe('hello');
      if (objectResult.ok) expect(objectResult.value).toEqual({ name: 'John', age: 30 });
      if (arrayResult.ok) expect(arrayResult.value).toEqual([1, 2, 3]);
      if (booleanResult.ok) expect(booleanResult.value).toBe(true);
      if (nullResult.ok) expect(nullResult.value).toBe(null);
    });

    it('should handle different error messages in Failure', () => {
      const simpleError = Failure<string>('Error');
      const detailedError = Failure<number>('Database connection failed: timeout after 30s');
      const emptyError = Failure<boolean>('');

      expect(simpleError.ok).toBe(false);
      expect(detailedError.ok).toBe(false);
      expect(emptyError.ok).toBe(false);

      if (!simpleError.ok) expect(simpleError.error).toBe('Error');
      if (!detailedError.ok) expect(detailedError.error).toBe('Database connection failed: timeout after 30s');
      if (!emptyError.ok) expect(emptyError.error).toBe('');
    });
  });

  describe('Type Guards', () => {
    it('should identify Success results with isOk', () => {
      const successResult = Success('success');
      const failureResult = Failure<string>('error');

      expect(isOk(successResult)).toBe(true);
      expect(isOk(failureResult)).toBe(false);
    });

    it('should identify Failure results with isFail', () => {
      const successResult = Success('success');
      const failureResult = Failure<string>('error');

      expect(isFail(successResult)).toBe(false);
      expect(isFail(failureResult)).toBe(true);
    });

    it('should provide type safety with type guards', () => {
      const result: Result<string> = Success('test');

      if (isOk(result)) {
        // TypeScript should know result.value exists and is string
        expect(typeof result.value).toBe('string');
        expect(result.value).toBe('test');
        // @ts-expect-error - error property should not exist on success
        expect(result.error).toBeUndefined();
      } else {
        fail('Should not reach here');
      }
    });

    it('should provide type safety for failures', () => {
      const result: Result<number> = Failure('Invalid number');

      if (isFail(result)) {
        // TypeScript should know result.error exists and is string
        expect(typeof result.error).toBe('string');
        expect(result.error).toBe('Invalid number');
        // @ts-expect-error - value property should not exist on failure
        expect(result.value).toBeUndefined();
      } else {
        fail('Should not reach here');
      }
    });

    it('should work with complex type narrowing', () => {
      function processResult(result: Result<number>): string {
        if (isOk(result)) {
          return `Success: ${result.value * 2}`;
        } else {
          return `Error: ${result.error}`;
        }
      }

      expect(processResult(Success(10))).toBe('Success: 20');
      expect(processResult(Failure('Invalid input'))).toBe('Error: Invalid input');
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should handle division by zero pattern', () => {
      function safeDivide(a: number, b: number): Result<number> {
        if (b === 0) {
          return Failure('Division by zero');
        }
        return Success(a / b);
      }

      const validResult = safeDivide(10, 2);
      const invalidResult = safeDivide(10, 0);

      expect(isOk(validResult)).toBe(true);
      if (isOk(validResult)) {
        expect(validResult.value).toBe(5);
      }

      expect(isFail(invalidResult)).toBe(true);
      if (isFail(invalidResult)) {
        expect(invalidResult.error).toBe('Division by zero');
      }
    });

    it('should handle JSON parsing pattern', () => {
      function parseJSON<T>(jsonString: string): Result<T> {
        try {
          const parsed = JSON.parse(jsonString);
          return Success(parsed);
        } catch (error) {
          return Failure(error instanceof Error ? error.message : 'Invalid JSON');
        }
      }

      const validJson = '{"name": "John", "age": 30}';
      const invalidJson = '{invalid json}';

      const validResult = parseJSON<{ name: string; age: number }>(validJson);
      const invalidResult = parseJSON(invalidJson);

      expect(isOk(validResult)).toBe(true);
      if (isOk(validResult)) {
        expect(validResult.value).toEqual({ name: 'John', age: 30 });
      }

      expect(isFail(invalidResult)).toBe(true);
      if (isFail(invalidResult)) {
        // Different error messages in different Node versions
        expect(
          invalidResult.error.includes('Unexpected token') || 
          invalidResult.error.includes('Expected property name')
        ).toBe(true);
      }
    });

    it('should handle validation pattern', () => {
      interface User {
        name: string;
        email: string;
        age: number;
      }

      function validateUser(data: unknown): Result<User> {
        if (!data || typeof data !== 'object') {
          return Failure('Invalid user data: not an object');
        }

        const obj = data as Record<string, unknown>;

        if (typeof obj.name !== 'string' || obj.name.length === 0) {
          return Failure('Invalid user data: name must be a non-empty string');
        }

        if (typeof obj.email !== 'string' || !obj.email.includes('@')) {
          return Failure('Invalid user data: email must be a valid email address');
        }

        if (typeof obj.age !== 'number' || obj.age < 0 || obj.age > 150) {
          return Failure('Invalid user data: age must be a number between 0 and 150');
        }

        return Success({
          name: obj.name,
          email: obj.email,
          age: obj.age,
        });
      }

      const validUser = { name: 'John Doe', email: 'john@example.com', age: 30 };
      const invalidEmail = { name: 'Jane', email: 'not-an-email', age: 25 };
      const missingName = { email: 'test@example.com', age: 20 };
      const invalidAge = { name: 'Bob', email: 'bob@example.com', age: -5 };

      expect(isOk(validateUser(validUser))).toBe(true);
      expect(isFail(validateUser(invalidEmail))).toBe(true);
      expect(isFail(validateUser(missingName))).toBe(true);
      expect(isFail(validateUser(invalidAge))).toBe(true);

      const result = validateUser(invalidEmail);
      if (isFail(result)) {
        expect(result.error).toContain('email must be a valid email address');
      }
    });

    it('should handle async operation simulation', () => {
      async function fetchUser(id: number): Promise<Result<{ id: number; name: string }>> {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 1));

        if (id <= 0) {
          return Failure('Invalid user ID');
        }

        if (id === 404) {
          return Failure('User not found');
        }

        return Success({ id, name: `User ${id}` });
      }

      return Promise.all([
        fetchUser(1).then(result => {
          expect(isOk(result)).toBe(true);
          if (isOk(result)) {
            expect(result.value).toEqual({ id: 1, name: 'User 1' });
          }
        }),
        fetchUser(-1).then(result => {
          expect(isFail(result)).toBe(true);
          if (isFail(result)) {
            expect(result.error).toBe('Invalid user ID');
          }
        }),
        fetchUser(404).then(result => {
          expect(isFail(result)).toBe(true);
          if (isFail(result)) {
            expect(result.error).toBe('User not found');
          }
        }),
      ]);
    });

    it('should handle chaining operations manually', () => {
      function parseNumber(str: string): Result<number> {
        const num = Number(str);
        if (isNaN(num)) {
          return Failure(`Cannot parse "${str}" as number`);
        }
        return Success(num);
      }

      function checkPositive(num: number): Result<number> {
        if (num <= 0) {
          return Failure('Number must be positive');
        }
        return Success(num);
      }

      function calculateSquareRoot(num: number): Result<number> {
        return Success(Math.sqrt(num));
      }

      function processNumberString(str: string): Result<number> {
        const parseResult = parseNumber(str);
        if (isFail(parseResult)) {
          return parseResult;
        }

        const checkResult = checkPositive(parseResult.value);
        if (isFail(checkResult)) {
          return checkResult;
        }

        return calculateSquareRoot(checkResult.value);
      }

      const valid = processNumberString('16');
      const notANumber = processNumberString('abc');
      const negative = processNumberString('-4');

      expect(isOk(valid)).toBe(true);
      if (isOk(valid)) {
        expect(valid.value).toBe(4);
      }

      expect(isFail(notANumber)).toBe(true);
      if (isFail(notANumber)) {
        expect(notANumber.error).toContain('Cannot parse');
      }

      expect(isFail(negative)).toBe(true);
      if (isFail(negative)) {
        expect(negative.error).toBe('Number must be positive');
      }
    });

    it('should handle collecting multiple results', () => {
      function validateAll<T>(results: Result<T>[]): Result<T[]> {
        const values: T[] = [];
        
        for (const result of results) {
          if (isFail(result)) {
            return Failure(result.error);
          }
          values.push(result.value);
        }
        
        return Success(values);
      }

      const allSuccess = [Success(1), Success(2), Success(3)];
      const withFailure = [Success(1), Failure<number>('Error at index 1'), Success(3)];
      const empty: Result<any>[] = [];

      const successResult = validateAll(allSuccess);
      const failureResult = validateAll(withFailure);
      const emptyResult = validateAll(empty);

      expect(isOk(successResult)).toBe(true);
      if (isOk(successResult)) {
        expect(successResult.value).toEqual([1, 2, 3]);
      }

      expect(isFail(failureResult)).toBe(true);
      if (isFail(failureResult)) {
        expect(failureResult.error).toBe('Error at index 1');
      }

      expect(isOk(emptyResult)).toBe(true);
      if (isOk(emptyResult)) {
        expect(emptyResult.value).toEqual([]);
      }
    });
  });

  describe('Type Inference', () => {
    it('should infer types correctly', () => {
      // Type should be inferred as Result<number>
      const numberResult = Success(42);
      
      // Type should be inferred as Result<string>
      const stringResult = Success('hello');
      
      // Type should be inferred as Result<{ x: number; y: number }>
      const objectResult = Success({ x: 10, y: 20 });

      // Failures need explicit type parameter
      const failedNumber = Failure<number>('Error');
      const failedString = Failure<string>('Error');

      expect(numberResult.ok).toBe(true);
      expect(stringResult.ok).toBe(true);
      expect(objectResult.ok).toBe(true);
      expect(failedNumber.ok).toBe(false);
      expect(failedString.ok).toBe(false);
    });

    it('should maintain type safety in functions', () => {
      function processUserAge(age: Result<number>): string {
        if (isOk(age)) {
          if (age.value >= 18) {
            return 'Adult';
          } else {
            return 'Minor';
          }
        } else {
          return `Error: ${age.error}`;
        }
      }

      expect(processUserAge(Success(25))).toBe('Adult');
      expect(processUserAge(Success(15))).toBe('Minor');
      expect(processUserAge(Failure('Invalid age'))).toBe('Error: Invalid age');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined and null values', () => {
      const undefinedResult = Success(undefined);
      const nullResult = Success(null);

      expect(isOk(undefinedResult)).toBe(true);
      expect(isOk(nullResult)).toBe(true);

      if (isOk(undefinedResult)) {
        expect(undefinedResult.value).toBeUndefined();
      }
      if (isOk(nullResult)) {
        expect(nullResult.value).toBeNull();
      }
    });

    it('should handle empty string errors', () => {
      const emptyError = Failure<string>('');
      
      expect(isFail(emptyError)).toBe(true);
      if (isFail(emptyError)) {
        expect(emptyError.error).toBe('');
      }
    });

    it('should handle very long error messages', () => {
      const longError = 'x'.repeat(1000);
      const result = Failure<number>(longError);
      
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error).toHaveLength(1000);
        expect(result.error).toBe(longError);
      }
    });

    it('should handle complex nested objects', () => {
      interface ComplexType {
        level1: {
          level2: {
            level3: {
              value: string;
            };
          };
        };
      }

      const complexObject: ComplexType = {
        level1: {
          level2: {
            level3: {
              value: 'deeply nested',
            },
          },
        },
      };

      const result = Success(complexObject);
      
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.level1.level2.level3.value).toBe('deeply nested');
      }
    });
  });
});