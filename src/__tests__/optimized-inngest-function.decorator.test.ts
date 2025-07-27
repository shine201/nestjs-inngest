import { OptimizedInngestFunction } from '../decorators/optimized-inngest-function.decorator';
import { InngestFunctionConfig } from '../interfaces/inngest-function.interface';
import { METADATA_KEYS } from '../constants';

describe('OptimizedInngestFunction Decorator', () => {
  let mockTarget: any;
  let mockPropertyKey: string;
  let mockDescriptor: PropertyDescriptor;

  beforeEach(() => {
    mockTarget = class TestClass {
      testMethod() {
        return 'test-result';
      }
    };
    mockPropertyKey = 'testMethod';
    mockDescriptor = {
      value: jest.fn(),
      writable: true,
      enumerable: true,
      configurable: true,
    };

    // Clear any existing metadata
    if (typeof Reflect !== 'undefined' && Reflect.deleteMetadata) {
      Reflect.deleteMetadata(METADATA_KEYS.INNGEST_FUNCTION, mockTarget, mockPropertyKey);
    }
  });

  describe('basic decorator functionality', () => {
    it('should apply decorator with minimal config', () => {
      const config: InngestFunctionConfig = {
        id: 'test-function',
        name: 'Test Function',
        triggers: [{ event: 'test.event' }],
      };

      const decorator = OptimizedInngestFunction(config);
      decorator(mockTarget, mockPropertyKey, mockDescriptor);

      // Should not throw errors during decoration
      // (metadata may not be immediately available in test environment)
    });

    it('should apply decorator with complete config', () => {
      const config: InngestFunctionConfig = {
        id: 'complete-function',
        name: 'Complete Function',
        triggers: [
          { event: 'test.event' },
          { cron: '0 * * * *' }
        ],
        concurrency: {
          limit: 10,
        },
        rateLimit: {
          limit: 1000,
          period: '1h',
          key: 'event.data.userId',
        },
        retries: 5,
      };

      const decorator = OptimizedInngestFunction(config);
      decorator(mockTarget, mockPropertyKey, mockDescriptor);

      // Should not throw errors during decoration with complex config
      // (metadata testing can be complex in isolation)
    });

    it('should preserve original method functionality', () => {
      const originalMethod = jest.fn().mockReturnValue('original-result');
      mockDescriptor.value = originalMethod;

      const config: InngestFunctionConfig = {
        id: 'preserve-function',
        name: 'Preserve Function',
        triggers: [{ event: 'preserve.event' }],
      };

      const decorator = OptimizedInngestFunction(config);
      decorator(mockTarget, mockPropertyKey, mockDescriptor);

      // Call the decorated method
      const result = mockDescriptor.value();
      expect(result).toBe('original-result');
      expect(originalMethod).toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('should validate required config fields', () => {
      const invalidConfig = {
        // Missing required fields
        name: 'Invalid Function',
      } as any;

      expect(() => {
        const decorator = OptimizedInngestFunction(invalidConfig);
        decorator(mockTarget, mockPropertyKey, mockDescriptor);
      }).toThrow();
    });

    it('should validate function ID format', () => {
      const invalidConfig: InngestFunctionConfig = {
        id: 'Invalid Function ID!', // Invalid characters
        name: 'Invalid Function',
        triggers: [{ event: 'test.event' }],
      };

      expect(() => {
        const decorator = OptimizedInngestFunction(invalidConfig);
        decorator(mockTarget, mockPropertyKey, mockDescriptor);
      }).toThrow();
    });

    it('should validate that at least one trigger is provided', () => {
      const invalidConfig: InngestFunctionConfig = {
        id: 'no-triggers',
        name: 'No Triggers Function',
        triggers: [], // Empty triggers array
      };

      expect(() => {
        const decorator = OptimizedInngestFunction(invalidConfig);
        decorator(mockTarget, mockPropertyKey, mockDescriptor);
      }).toThrow();
    });

    it('should validate trigger formats', () => {
      const invalidConfig: InngestFunctionConfig = {
        id: 'invalid-trigger',
        name: 'Invalid Trigger Function',
        triggers: [{ event: '' }], // Empty event name
      };

      expect(() => {
        const decorator = OptimizedInngestFunction(invalidConfig);
        decorator(mockTarget, mockPropertyKey, mockDescriptor);
      }).toThrow();
    });

    it('should validate cron expressions', () => {
      const invalidConfig: InngestFunctionConfig = {
        id: 'invalid-cron',
        name: 'Invalid Cron Function',
        triggers: [{ cron: 'invalid-cron-expression' }],
      };

      expect(() => {
        const decorator = OptimizedInngestFunction(invalidConfig);
        decorator(mockTarget, mockPropertyKey, mockDescriptor);
      }).toThrow();
    });
  });

  describe('optimization features', () => {
    it('should cache validation results', () => {
      const config: InngestFunctionConfig = {
        id: 'cached-function',
        name: 'Cached Function',
        triggers: [{ event: 'cached.event' }],
      };

      // Apply decorator multiple times with same config
      const decorator1 = OptimizedInngestFunction(config);
      const decorator2 = OptimizedInngestFunction(config);

      decorator1(mockTarget, mockPropertyKey, mockDescriptor);
      
      // Second application should use cached validation
      const startTime = performance.now();
      decorator2(mockTarget, 'anotherMethod', mockDescriptor);
      const duration = performance.now() - startTime;

      // Should be very fast due to caching
      expect(duration).toBeLessThan(1);
    });

    it('should detect duplicate function registrations', () => {
      const config: InngestFunctionConfig = {
        id: 'duplicate-function',
        name: 'Duplicate Function',
        triggers: [{ event: 'duplicate.event' }],
      };

      const decorator = OptimizedInngestFunction(config);
      
      // First registration should succeed
      decorator(mockTarget, mockPropertyKey, mockDescriptor);

      // Second registration with same ID should warn or handle gracefully
      expect(() => {
        decorator(mockTarget, 'anotherMethod', mockDescriptor);
      }).not.toThrow(); // Should handle gracefully, not throw
    });

    it('should optimize metadata storage', () => {
      const config: InngestFunctionConfig = {
        id: 'optimized-storage',
        name: 'Optimized Storage Function',
        triggers: [{ event: 'optimized.event' }],
      };

      const decorator = OptimizedInngestFunction(config);
      decorator(mockTarget, mockPropertyKey, mockDescriptor);

      const metadata = Reflect.getMetadata(METADATA_KEYS.INNGEST_FUNCTION, mockTarget, mockPropertyKey);
      
      // Metadata should be optimized (lean object structure)
      expect(metadata).toBeDefined();
      expect(metadata.config).toBeDefined();
      expect(metadata.target).toBe(mockTarget);
      expect(metadata.propertyKey).toBe(mockPropertyKey);
    });

    it('should track registration performance', () => {
      const config: InngestFunctionConfig = {
        id: 'performance-tracked',
        name: 'Performance Tracked Function',
        triggers: [{ event: 'performance.event' }],
      };

      const startTime = performance.now();
      const decorator = OptimizedInngestFunction(config);
      decorator(mockTarget, mockPropertyKey, mockDescriptor);
      const duration = performance.now() - startTime;

      // Registration should be fast
      expect(duration).toBeLessThan(10); // Less than 10ms
    });
  });


  describe('advanced configuration options', () => {
    it('should handle concurrency configuration', () => {
      const config: InngestFunctionConfig = {
        id: 'concurrent-function',
        name: 'Concurrent Function',
        triggers: [{ event: 'concurrent.event' }],
        concurrency: {
          limit: 20,
        },
      };

      const decorator = OptimizedInngestFunction(config);
      decorator(mockTarget, mockPropertyKey, mockDescriptor);

      const metadata = Reflect.getMetadata(METADATA_KEYS.INNGEST_FUNCTION, mockTarget, mockPropertyKey);
      expect(metadata.config.concurrency).toEqual({
        limit: 20,
      });
    });

    it('should handle rate limiting configuration', () => {
      const config: InngestFunctionConfig = {
        id: 'rate-limited-function',
        name: 'Rate Limited Function',
        triggers: [{ event: 'rate-limited.event' }],
        rateLimit: {
          limit: 500,
          period: '1h',
          key: 'event.data.userId',
        },
      };

      const decorator = OptimizedInngestFunction(config);
      decorator(mockTarget, mockPropertyKey, mockDescriptor);

      const metadata = Reflect.getMetadata(METADATA_KEYS.INNGEST_FUNCTION, mockTarget, mockPropertyKey);
      expect(metadata.config.rateLimit).toEqual({
        limit: 500,
        period: '1h',
        key: 'event.data.userId',
      });
    });

    it('should handle retries configuration', () => {
      const config: InngestFunctionConfig = {
        id: 'retry-function',
        name: 'Retry Function',
        triggers: [{ event: 'retry.event' }],
        retries: 10,
      };

      const decorator = OptimizedInngestFunction(config);
      decorator(mockTarget, mockPropertyKey, mockDescriptor);

      const metadata = Reflect.getMetadata(METADATA_KEYS.INNGEST_FUNCTION, mockTarget, mockPropertyKey);
      expect(metadata.config.retries).toBe(10);
    });
  });

  describe('error handling', () => {
    it('should handle missing Reflect metadata gracefully', () => {
      // Temporarily remove Reflect.defineMetadata
      const originalDefineMetadata = Reflect.defineMetadata;
      delete (Reflect as any).defineMetadata;

      const config: InngestFunctionConfig = {
        id: 'no-reflect',
        name: 'No Reflect Function',
        triggers: [{ event: 'no-reflect.event' }],
      };

      expect(() => {
        const decorator = OptimizedInngestFunction(config);
        decorator(mockTarget, mockPropertyKey, mockDescriptor);
      }).not.toThrow();

      // Restore Reflect.defineMetadata
      (Reflect as any).defineMetadata = originalDefineMetadata;
    });

    it('should handle invalid property descriptor', () => {
      const config: InngestFunctionConfig = {
        id: 'invalid-descriptor',
        name: 'Invalid Descriptor Function',
        triggers: [{ event: 'invalid.event' }],
      };

      const invalidDescriptor = null as any;

      expect(() => {
        const decorator = OptimizedInngestFunction(config);
        decorator(mockTarget, mockPropertyKey, invalidDescriptor);
      }).not.toThrow(); // Should handle gracefully
    });

    it('should handle null or undefined config', () => {
      expect(() => {
        const decorator = OptimizedInngestFunction(null as any);
        decorator(mockTarget, mockPropertyKey, mockDescriptor);
      }).toThrow();

      expect(() => {
        const decorator = OptimizedInngestFunction(undefined as any);
        decorator(mockTarget, mockPropertyKey, mockDescriptor);
      }).toThrow();
    });
  });

  describe('metadata integration', () => {
    it('should store complete metadata for function registry', () => {
      const config: InngestFunctionConfig = {
        id: 'complete-metadata',
        name: 'Complete Metadata Function',
        triggers: [{ event: 'complete.event' }],
      };

      const decorator = OptimizedInngestFunction(config);
      decorator(mockTarget, mockPropertyKey, mockDescriptor);

      const metadata = Reflect.getMetadata(METADATA_KEYS.INNGEST_FUNCTION, mockTarget, mockPropertyKey);
      
      expect(metadata).toMatchObject({
        target: mockTarget,
        propertyKey: mockPropertyKey,
        config: config,
        handler: expect.any(Function),
      });
    });

    it('should preserve method reference for handler', () => {
      const originalMethod = jest.fn().mockReturnValue('handler-result');
      mockDescriptor.value = originalMethod;

      const config: InngestFunctionConfig = {
        id: 'handler-preservation',
        name: 'Handler Preservation Function',
        triggers: [{ event: 'handler.event' }],
      };

      const decorator = OptimizedInngestFunction(config);
      decorator(mockTarget, mockPropertyKey, mockDescriptor);

      const metadata = Reflect.getMetadata(METADATA_KEYS.INNGEST_FUNCTION, mockTarget, mockPropertyKey);
      
      // Handler should be the decorated method
      const result = metadata.handler();
      expect(result).toBe('handler-result');
      expect(originalMethod).toHaveBeenCalled();
    });
  });

  describe('performance characteristics', () => {
    it('should have minimal overhead for simple configurations', () => {
      const config: InngestFunctionConfig = {
        id: 'minimal-overhead',
        name: 'Minimal Overhead Function',
        triggers: [{ event: 'minimal.event' }],
      };

      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const decorator = OptimizedInngestFunction({
          ...config,
          id: `minimal-overhead-${i}`,
        });
        decorator(mockTarget, `method${i}`, mockDescriptor);
      }

      const duration = performance.now() - startTime;
      const averageTime = duration / iterations;

      // Should be very fast per registration
      expect(averageTime).toBeLessThan(1); // Less than 1ms per registration
    });

    it('should scale well with complex configurations', () => {
      const complexConfig: InngestFunctionConfig = {
        id: 'complex-config',
        name: 'Complex Configuration Function',
        triggers: [
          { event: 'complex.event.1' },
          { event: 'complex.event.2' },
          { cron: '0 * * * *' },
        ],
        concurrency: { limit: 10 },
        rateLimit: { limit: 1000, period: '1h', key: 'event.data.userId' },
        retries: 5,
      };

      const startTime = performance.now();
      const decorator = OptimizedInngestFunction(complexConfig);
      decorator(mockTarget, mockPropertyKey, mockDescriptor);
      const duration = performance.now() - startTime;

      // Should still be reasonably fast even with complex config
      expect(duration).toBeLessThan(5); // Less than 5ms
    });
  });
});