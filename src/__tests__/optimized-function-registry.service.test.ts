import { Test, TestingModule } from '@nestjs/testing';
import { OptimizedFunctionRegistry } from '../services/optimized-function-registry.service';
import { DiscoveryService, MetadataScanner, ModuleRef } from '@nestjs/core';
import { MemoryOptimizer } from '../utils/memory-optimizer';
import { InngestFunctionMetadata } from '../interfaces/inngest-function.interface';
import { METADATA_KEYS } from '../constants';

describe('OptimizedFunctionRegistry', () => {
  let registry: OptimizedFunctionRegistry;
  let discoveryService: DiscoveryService;
  let metadataScanner: MetadataScanner;
  let moduleRef: ModuleRef;
  let memoryOptimizer: MemoryOptimizer;
  let module: TestingModule;

  const mockFunctionConfig = {
    id: 'test-function',
    name: 'Test Function',
    triggers: [{ event: 'test.event' }],
  };

  beforeEach(async () => {
    const mockDiscoveryService = {
      getProviders: jest.fn().mockReturnValue([
        {
          instance: { testMethod: jest.fn() },
          metatype: class TestClass {},
          name: 'TestProvider',
        },
      ]),
    };

    const mockMetadataScanner = {
      scanFromPrototype: jest.fn().mockReturnValue(['testMethod']),
    };

    const mockModuleRef = {
      get: jest.fn(),
    };

    const mockMemoryOptimizer = {
      createLeanObject: jest.fn().mockImplementation((obj) => obj),
      optimizeObject: jest.fn().mockImplementation((obj) => obj),
      internString: jest.fn().mockImplementation((str) => str),
      acquireMetadataObject: jest.fn().mockReturnValue({
        target: null,
        propertyKey: '',
        config: null,
        handler: null,
      }),
      releaseMetadataObject: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        OptimizedFunctionRegistry,
        {
          provide: DiscoveryService,
          useValue: mockDiscoveryService,
        },
        {
          provide: MetadataScanner,
          useValue: mockMetadataScanner,
        },
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
        {
          provide: MemoryOptimizer,
          useValue: mockMemoryOptimizer,
        },
      ],
    }).compile();

    registry = module.get<OptimizedFunctionRegistry>(OptimizedFunctionRegistry);
    discoveryService = module.get<DiscoveryService>(DiscoveryService);
    metadataScanner = module.get<MetadataScanner>(MetadataScanner);
    moduleRef = module.get<ModuleRef>(ModuleRef);
    memoryOptimizer = module.get<MemoryOptimizer>(MemoryOptimizer);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(registry).toBeDefined();
    });

    it('should discover functions on module init', async () => {
      const discoverFunctionsSpy = jest.spyOn(registry as any, 'discoverFunctions');
      
      await registry.onModuleInit();
      
      expect(discoverFunctionsSpy).toHaveBeenCalled();
      discoverFunctionsSpy.mockRestore();
    });

    it('should precompute indexes after discovery', async () => {
      const precomputeIndexesSpy = jest.spyOn(registry as any, 'precomputeIndexes');
      
      await registry.onModuleInit();
      
      expect(precomputeIndexesSpy).toHaveBeenCalled();
      precomputeIndexesSpy.mockRestore();
    });

    it('should log discovery time', async () => {
      const logSpy = jest.spyOn(registry['logger'], 'log');
      
      await registry.onModuleInit();
      
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Discovered \d+ Inngest function\(s\) in \d+\.\d+ms/)
      );
    });
  });

  describe('function registration', () => {
    it('should register a function with metadata', async () => {
      const target = { testMethod: jest.fn() };
      
      await registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
      
      const functions = registry.getFunctions();
      expect(functions).toHaveLength(1);
      expect(functions[0].config.id).toBe('test-function');
    });

    it('should use memory optimizer for function registration', async () => {
      const target = { testMethod: jest.fn() };
      
      await registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
      
      expect(memoryOptimizer.acquireMetadataObject).toHaveBeenCalled();
      expect(memoryOptimizer.optimizeObject).toHaveBeenCalled();
    });

    it('should handle duplicate function registration', async () => {
      const target = { testMethod: jest.fn() };
      
      await registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
      
      await expect(
        registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig)
      ).rejects.toThrow();
    });

    it('should validate function method exists', async () => {
      const target = {};
      
      await expect(
        registry.registerFunctionOptimized(target, 'nonExistentMethod', mockFunctionConfig)
      ).rejects.toThrow();
    });
  });

  describe('function lookup', () => {
    beforeEach(async () => {
      const target = { testMethod: jest.fn() };
      await registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
    });

    it('should find function by ID', () => {
      const found = registry.getFunction('test-function');
      expect(found).toBeDefined();
      expect(found?.config.id).toBe('test-function');
    });

    it('should return undefined for non-existent function', () => {
      const found = registry.getFunction('non-existent');
      expect(found).toBeUndefined();
    });

    it('should check if function exists', () => {
      expect(registry.hasFunction('test-function')).toBe(true);
      expect(registry.hasFunction('non-existent')).toBe(false);
    });

    it('should get all functions', () => {
      const functions = registry.getFunctions();
      expect(functions).toHaveLength(1);
      expect(functions[0].config.id).toBe('test-function');
    });

    it('should get function count', () => {
      expect(registry.getFunctionCount()).toBe(1);
    });

    it('should get function IDs', () => {
      const ids = registry.getFunctionIds();
      expect(ids).toEqual(['test-function']);
    });
  });

  describe('function lookup by criteria', () => {
    beforeEach(async () => {
      const eventTarget = { eventMethod: jest.fn() };
      const cronTarget = { cronMethod: jest.fn() };

      await registry.registerFunctionOptimized(eventTarget, 'eventMethod', {
        id: 'event-function',
        name: 'Event Function',
        triggers: [{ event: 'test.event' }],
      });

      await registry.registerFunctionOptimized(cronTarget, 'cronMethod', {
        id: 'cron-function',
        name: 'Cron Function',
        triggers: [{ cron: '0 * * * *' }],
      });
    });

    it('should get functions by event trigger', () => {
      const eventFunctions = registry.getFunctionsByEvent('test.event');
      expect(eventFunctions).toHaveLength(1);
      expect(eventFunctions[0].config.id).toBe('event-function');
    });

    it('should get functions by cron trigger', () => {
      const cronFunctions = registry.getFunctionsByCron('0 * * * *');
      expect(cronFunctions).toHaveLength(1);
      expect(cronFunctions[0].config.id).toBe('cron-function');
    });

    it('should get functions by class', () => {
      const target = { eventMethod: jest.fn() };
      const classFunctions = registry.getFunctionsByClass(target.constructor);
      // This will be empty since we registered with object instances, not classes
      expect(Array.isArray(classFunctions)).toBe(true);
    });

    it('should return empty array for non-existent event', () => {
      const functions = registry.getFunctionsByEvent('non-existent.event');
      expect(functions).toEqual([]);
    });

    it('should return empty array for non-existent cron', () => {
      const functions = registry.getFunctionsByCron('non-existent-cron');
      expect(functions).toEqual([]);
    });
  });

  describe('function definition creation', () => {
    beforeEach(async () => {
      const target = { testMethod: jest.fn() };
      await registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
    });

    it('should create Inngest function definitions', () => {
      const definitions = registry.createInngestFunctions();
      expect(Array.isArray(definitions)).toBe(true);
      expect(definitions.length).toBeGreaterThan(0);
    });

    it('should cache function definitions', () => {
      // First call
      const definitions1 = registry.createInngestFunctions();
      
      // Second call should use cached definitions
      const definitions2 = registry.createInngestFunctions();
      
      expect(definitions1).toEqual(definitions2);
    });

    it('should handle function definition creation errors', () => {
      // Mock an error in the function creation process
      jest.spyOn(registry as any, 'createInngestFunctionOptimized').mockImplementation(() => {
        throw new Error('Function creation failed');
      });

      expect(() => {
        registry.createInngestFunctions();
      }).toThrow();
    });
  });

  describe('performance optimization', () => {
    it('should use cached results within TTL', () => {
      // Register a function first
      const target = { testMethod: jest.fn() };
      registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
      
      // First call
      const functions1 = registry.getFunctions();
      
      // Second call within TTL should use cache
      const functions2 = registry.getFunctions();
      
      expect(functions1).toBe(functions2); // Same reference due to caching
    });

    it('should invalidate cache after TTL', () => {
      const target = { testMethod: jest.fn() };
      registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
      
      // First call
      const functions1 = registry.getFunctions();
      
      // Mock time passage beyond TTL
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 70000); // 70 seconds
      
      // Force cache invalidation
      (registry as any).invalidateCache();
      
      // Second call should recompute
      const functions2 = registry.getFunctions();
      
      expect(functions1).not.toBe(functions2); // Different references due to cache invalidation
      
      (Date.now as jest.Mock).mockRestore();
    });

    it('should batch process providers efficiently', async () => {
      // Mock many providers with proper InstanceWrapper structure
      const manyProviders = Array.from({ length: 10 }, (_, i) => ({
        instance: { [`method${i}`]: jest.fn() },
        metatype: class TestClass {},
        name: `TestProvider${i}`,
        token: `TestProvider${i}`,
        isAlias: false,
        values: new Map(),
        isTreeStatic: true,
      })) as any[];

      jest.spyOn(discoveryService, 'getProviders').mockReturnValue(manyProviders);

      const startTime = performance.now();
      await registry.onModuleInit();
      const duration = performance.now() - startTime;

      // Should be reasonably fast for 10 providers
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });
  });

  describe('statistics and monitoring', () => {
    beforeEach(async () => {
      const eventTarget = { eventMethod: jest.fn() };
      const cronTarget = { cronMethod: jest.fn() };

      await registry.registerFunctionOptimized(eventTarget, 'eventMethod', {
        id: 'event-function',
        name: 'Event Function',
        triggers: [{ event: 'test.event' }],
      });

      await registry.registerFunctionOptimized(cronTarget, 'cronMethod', {
        id: 'cron-function',
        name: 'Cron Function',
        triggers: [{ cron: '0 * * * *' }],
      });
    });

    it('should provide comprehensive statistics', () => {
      const stats = registry.getStats();
      
      expect(stats).toHaveProperty('totalFunctions');
      expect(stats).toHaveProperty('functionsByTriggerType');
      expect(stats).toHaveProperty('functionsByClass');
      expect(stats).toHaveProperty('lastDiscoveryTime');
      expect(stats).toHaveProperty('discoveryDuration');
      
      expect(stats.totalFunctions).toBe(2);
    });

    it('should provide performance metrics', () => {
      const perfMetrics = registry.getPerformanceMetrics();
      
      expect(perfMetrics).toHaveProperty('registrationTimes');
      expect(perfMetrics).toHaveProperty('cacheHitRate');
      expect(perfMetrics).toHaveProperty('totalMemoryUsage');
      expect(perfMetrics).toHaveProperty('avgLookupTime');
      
      expect(perfMetrics.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(perfMetrics.totalMemoryUsage).toBeGreaterThan(0);
    });
  });

  describe('bulk operations', () => {
    it('should register multiple functions efficiently', async () => {
      const targets = Array.from({ length: 10 }, (_, i) => ({
        [`method${i}`]: jest.fn(),
      }));

      const startTime = performance.now();
      
      for (let i = 0; i < targets.length; i++) {
        await registry.registerFunctionOptimized(targets[i], `method${i}`, {
          id: `bulk-function-${i}`,
          name: `Bulk Function ${i}`,
          triggers: [{ event: `bulk.event.${i}` }],
        });
      }
      
      const duration = performance.now() - startTime;
      
      expect(duration).toBeLessThan(100); // Should be fast
      expect(registry.getFunctionCount()).toBe(10);
    });

    it('should bulk get functions', async () => {
      // Register multiple functions
      for (let i = 0; i < 3; i++) {
        const target = { [`method${i}`]: jest.fn() };
        await registry.registerFunctionOptimized(target, `method${i}`, {
          id: `bulk-function-${i}`,
          name: `Bulk Function ${i}`,
          triggers: [{ event: `bulk.event.${i}` }],
        });
      }

      const ids = ['bulk-function-0', 'bulk-function-2', 'non-existent'];
      const functions = registry.bulkGetFunctions(ids);
      
      expect(functions).toHaveLength(2); // Only existing functions
      expect(functions[0].config.id).toBe('bulk-function-0');
      expect(functions[1].config.id).toBe('bulk-function-2');
    });

    it('should clear all functions', async () => {
      const target = { testMethod: jest.fn() };
      await registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
      
      expect(registry.getFunctionCount()).toBe(1);
      
      registry.clear();
      
      expect(registry.getFunctionCount()).toBe(0);
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      const target = { testMethod: jest.fn() };
      await registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
    });

    it('should clear cache on invalidation', () => {
      // Generate cache entries
      registry.getFunctions();
      registry.createInngestFunctions();
      
      (registry as any).invalidateCache();
      
      const cachedFunctionsList = (registry as any).cachedFunctionsList;
      const cachedStats = (registry as any).cachedStats;
      
      expect(cachedFunctionsList).toBeNull();
      expect(cachedStats).toBeNull();
    });

    it('should cleanup old cache entries', () => {
      // Create cached definition
      registry.createInngestFunctions();
      
      // Mock old timestamp
      const cache = (registry as any).functionDefinitionCache;
      const cachedEntry = cache.get('test-function');
      if (cachedEntry) {
        cachedEntry.lastAccessed = Date.now() - 70000; // 70 seconds ago
      }
      
      // Trigger cleanup
      (registry as any).cleanupCache();
      
      // Old entries should be removed
      expect(cache.has('test-function')).toBe(false);
    });
  });

  describe('optimization methods', () => {
    beforeEach(async () => {
      const target = { testMethod: jest.fn() };
      await registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
    });

    it('should precompute indexes', async () => {
      await (registry as any).precomputeIndexes();
      
      // Should complete without errors and populate caches
      expect((registry as any).cachedFunctionsList).toBeDefined();
    });

    it('should invalidate cache', () => {
      // Populate cache first
      registry.getFunctions();
      registry.getStats();
      
      (registry as any).invalidateCache();
      
      expect((registry as any).cachedFunctionsList).toBeNull();
      expect((registry as any).cachedStats).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle invalid function config gracefully', async () => {
      const target = { testMethod: jest.fn() };
      const invalidConfig = null as any;
      
      await expect(
        registry.registerFunctionOptimized(target, 'testMethod', invalidConfig)
      ).rejects.toThrow();
    });

    it('should handle memory optimizer failures gracefully', async () => {
      jest.spyOn(memoryOptimizer, 'acquireMetadataObject').mockImplementation(() => {
        throw new Error('Memory optimizer failed');
      });
      
      const target = { testMethod: jest.fn() };
      
      await expect(
        registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig)
      ).rejects.toThrow();
    });

    it('should handle provider scanning errors gracefully', async () => {
      jest.spyOn(registry as any, 'scanProvider').mockImplementation(() => {
        throw new Error('Provider scan failed');
      });
      
      await expect(registry.onModuleInit()).rejects.toThrow();
    });
  });

  describe('memory efficiency', () => {
    it('should release metadata objects when clearing', async () => {
      const target = { testMethod: jest.fn() };
      await registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
      
      registry.clear();
      
      // Memory optimizer should be used for cleanup
      expect(memoryOptimizer.releaseMetadataObject).toHaveBeenCalled();
    });

    it('should optimize object storage', async () => {
      const target = { testMethod: jest.fn() };
      await registry.registerFunctionOptimized(target, 'testMethod', mockFunctionConfig);
      
      expect(memoryOptimizer.optimizeObject).toHaveBeenCalledWith(mockFunctionConfig);
    });
  });
});