import { Test, TestingModule } from '@nestjs/testing';
import { MemoryOptimizer } from '../utils/memory-optimizer';
import { Logger } from '@nestjs/common';

// Mock global.gc for testing
const mockGc = jest.fn();
(global as any).gc = mockGc;

describe('MemoryOptimizer', () => {
  let memoryOptimizer: MemoryOptimizer;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [MemoryOptimizer],
    }).compile();

    memoryOptimizer = module.get<MemoryOptimizer>(MemoryOptimizer);
    mockGc.mockClear();
  });

  afterEach(async () => {
    await module.close();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(memoryOptimizer).toBeDefined();
    });

    it('should start memory monitoring', () => {
      const interval = (memoryOptimizer as any).memoryCheckInterval;
      expect(interval).toBeDefined();
    });
  });

  describe('object pooling', () => {
    describe('event objects', () => {
      it('should acquire and release event objects', () => {
        const obj1 = memoryOptimizer.acquireEventObject();
        const obj2 = memoryOptimizer.acquireEventObject();
        
        expect(obj1).toBeDefined();
        expect(obj2).toBeDefined();
        expect(obj1).not.toBe(obj2);
        
        memoryOptimizer.releaseEventObject(obj1);
        memoryOptimizer.releaseEventObject(obj2);
        
        // Should reuse objects from pool
        const obj3 = memoryOptimizer.acquireEventObject();
        expect(obj3).toBe(obj1); // Should get the first released object
      });

      it('should reset objects when released', () => {
        const obj = memoryOptimizer.acquireEventObject();
        obj.testProperty = 'test';
        
        memoryOptimizer.releaseEventObject(obj);
        
        const reusedObj = memoryOptimizer.acquireEventObject();
        expect(reusedObj.testProperty).toBeUndefined();
      });
    });

    describe('metadata objects', () => {
      it('should acquire and release metadata objects', () => {
        const obj1 = memoryOptimizer.acquireMetadataObject();
        const obj2 = memoryOptimizer.acquireMetadataObject();
        
        expect(obj1).toBeDefined();
        expect(obj2).toBeDefined();
        expect(obj1).not.toBe(obj2);
        
        expect(obj1.target).toBe(null);
        expect(obj1.propertyKey).toBe('');
        expect(obj1.config).toBe(null);
        expect(obj1.handler).toBe(null);
        
        memoryOptimizer.releaseMetadataObject(obj1);
        memoryOptimizer.releaseMetadataObject(obj2);
      });

      it('should reset metadata objects when released', () => {
        const obj = memoryOptimizer.acquireMetadataObject();
        obj.target = 'test';
        obj.propertyKey = 'testKey';
        obj.config = { test: true };
        obj.handler = () => {};
        
        memoryOptimizer.releaseMetadataObject(obj);
        
        const reusedObj = memoryOptimizer.acquireMetadataObject();
        expect(reusedObj.target).toBe(null);
        expect(reusedObj.propertyKey).toBe('');
        expect(reusedObj.config).toBe(null);
        expect(reusedObj.handler).toBe(null);
      });
    });
  });

  describe('string interning', () => {
    it('should intern strings for memory deduplication', () => {
      const str1 = 'test-string';
      const str2 = 'test-string';
      
      const interned1 = memoryOptimizer.internString(str1);
      const interned2 = memoryOptimizer.internString(str2);
      
      // Should return the same reference for identical strings
      expect(interned1).toBe(interned2);
    });

    it('should handle different strings separately', () => {
      const str1 = 'string1';
      const str2 = 'string2';
      
      const interned1 = memoryOptimizer.internString(str1);
      const interned2 = memoryOptimizer.internString(str2);
      
      expect(interned1).not.toBe(interned2);
      expect(interned1).toBe(str1);
      expect(interned2).toBe(str2);
    });
  });

  describe('function metadata caching', () => {
    it('should cache and retrieve function metadata', () => {
      const metadata = { type: 'function', config: { test: true } };
      const key = 'test-function';
      
      memoryOptimizer.cacheFunctionMetadata(key, metadata);
      const cached = memoryOptimizer.getCachedFunctionMetadata(key);
      
      expect(cached).toBe(metadata);
    });

    it('should return undefined for non-existent keys', () => {
      const cached = memoryOptimizer.getCachedFunctionMetadata('non-existent');
      expect(cached).toBeUndefined();
    });
  });

  describe('config validation caching', () => {
    it('should cache and retrieve config validation results', () => {
      const key = 'test-config';
      
      memoryOptimizer.cacheConfigValidation(key, true);
      const cached = memoryOptimizer.getCachedConfigValidation(key);
      
      expect(cached).toBe(true);
    });

    it('should cache false validation results', () => {
      const key = 'invalid-config';
      
      memoryOptimizer.cacheConfigValidation(key, false);
      const cached = memoryOptimizer.getCachedConfigValidation(key);
      
      expect(cached).toBe(false);
    });
  });

  describe('object optimization', () => {
    it('should create lean objects', () => {
      const properties = {
        name: 'test',
        value: 'value',
        number: 42,
      };
      
      const leanObj = memoryOptimizer.createLeanObject(properties);
      
      expect(leanObj.name).toBe('test');
      expect(leanObj.value).toBe('value');
      expect(leanObj.number).toBe(42);
      
      // Should not have prototype
      expect(Object.getPrototypeOf(leanObj)).toBe(null);
    });

    it('should optimize existing objects', () => {
      const obj = {
        stringProp: 'test',
        numberProp: 123,
        objectProp: {
          nested: 'value',
        },
        arrayProp: ['item1', 'item2'],
      };
      
      const optimized = memoryOptimizer.optimizeObject(obj);
      
      expect(optimized.stringProp).toBe('test');
      expect(optimized.numberProp).toBe(123);
      expect(optimized.objectProp.nested).toBe('value');
      expect(optimized.arrayProp).toEqual(['item1', 'item2']);
      
      // Should not have prototype
      expect(Object.getPrototypeOf(optimized)).toBe(null);
    });

    it('should handle null and primitive values', () => {
      expect(memoryOptimizer.optimizeObject(null)).toBe(null);
      expect(memoryOptimizer.optimizeObject(undefined)).toBe(undefined);
      expect(memoryOptimizer.optimizeObject(42)).toBe(42);
      expect(memoryOptimizer.optimizeObject('string')).toBe('string');
    });
  });

  describe('efficient cloning', () => {
    it('should clone objects efficiently', () => {
      const original = {
        string: 'test',
        number: 42,
        nested: {
          prop: 'value',
        },
        array: [1, 2, 3],
      };
      
      const cloned = memoryOptimizer.efficientClone(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.nested).not.toBe(original.nested);
      expect(cloned.array).not.toBe(original.array);
    });

    it('should handle dates correctly', () => {
      const date = new Date('2023-01-01');
      const cloned = memoryOptimizer.efficientClone(date);
      
      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
      expect(cloned instanceof Date).toBe(true);
    });

    it('should handle arrays correctly', () => {
      const array = [1, 'two', { three: 3 }];
      const cloned = memoryOptimizer.efficientClone(array);
      
      expect(cloned).toEqual(array);
      expect(cloned).not.toBe(array);
      expect(cloned[2]).not.toBe(array[2]);
    });

    it('should handle primitive values', () => {
      expect(memoryOptimizer.efficientClone(null)).toBe(null);
      expect(memoryOptimizer.efficientClone(42)).toBe(42);
      expect(memoryOptimizer.efficientClone('string')).toBe('string');
    });
  });

  describe('memory monitoring', () => {
    it('should get memory statistics', () => {
      const stats = memoryOptimizer.getMemoryStats();
      
      expect(stats).toHaveProperty('heapUsed');
      expect(stats).toHaveProperty('heapTotal');
      expect(stats).toHaveProperty('external');
      expect(stats).toHaveProperty('rss');
      expect(stats).toHaveProperty('arrayBuffers');
      
      expect(typeof stats.heapUsed).toBe('number');
      expect(stats.heapUsed).toBeGreaterThan(0);
    });

    it('should get detailed memory information', () => {
      const info = memoryOptimizer.getDetailedMemoryInfo();
      
      expect(info).toHaveProperty('current');
      expect(info).toHaveProperty('thresholds');
      expect(info).toHaveProperty('poolStats');
      expect(info).toHaveProperty('cacheStats');
      expect(info).toHaveProperty('memoryTrend');
      
      expect(info.poolStats).toHaveProperty('eventObjects');
      expect(info.poolStats).toHaveProperty('metadataObjects');
      expect(info.cacheStats).toHaveProperty('functionMetadata');
      expect(info.cacheStats).toHaveProperty('configValidation');
      expect(info.cacheStats).toHaveProperty('internedStrings');
    });

    it('should analyze memory usage', () => {
      const analysis = memoryOptimizer.analyzeMemoryUsage();
      
      expect(analysis).toHaveProperty('recommendations');
      expect(analysis).toHaveProperty('severity');
      expect(analysis).toHaveProperty('optimizationOpportunities');
      
      expect(Array.isArray(analysis.recommendations)).toBe(true);
      expect(['low', 'medium', 'high']).toContain(analysis.severity);
      expect(Array.isArray(analysis.optimizationOpportunities)).toBe(true);
    });
  });

  describe('garbage collection', () => {
    it('should force garbage collection when available', () => {
      memoryOptimizer.forceGarbageCollection();
      expect(mockGc).toHaveBeenCalled();
    });

    it('should handle missing global.gc gracefully', () => {
      const originalGc = (global as any).gc;
      delete (global as any).gc;
      
      expect(() => {
        memoryOptimizer.forceGarbageCollection();
      }).not.toThrow();
      
      (global as any).gc = originalGc;
    });
  });

  describe('memory optimization', () => {
    it('should perform optimization', () => {
      const spy = jest.spyOn(memoryOptimizer as any, 'performOptimization');
      
      memoryOptimizer.optimize();
      
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should clear all caches', () => {
      // Add some data to caches
      memoryOptimizer.cacheFunctionMetadata('test', { data: 'test' });
      memoryOptimizer.cacheConfigValidation('test', true);
      
      memoryOptimizer.clearAllCaches();
      
      expect(memoryOptimizer.getCachedFunctionMetadata('test')).toBeUndefined();
      expect(memoryOptimizer.getCachedConfigValidation('test')).toBeUndefined();
    });

    it('should set custom memory thresholds', () => {
      const customThresholds = {
        warning: 100 * 1024 * 1024, // 100MB
        critical: 200 * 1024 * 1024, // 200MB
      };
      
      memoryOptimizer.setMemoryThresholds(customThresholds);
      
      const info = memoryOptimizer.getDetailedMemoryInfo();
      expect(info.thresholds.warning).toBe(customThresholds.warning);
      expect(info.thresholds.critical).toBe(customThresholds.critical);
    });
  });

  describe('memory pressure handling', () => {
    it('should handle high memory usage', () => {
      const performOptimizationSpy = jest.spyOn(memoryOptimizer as any, 'performOptimization');
      
      // Mock high memory usage
      jest.spyOn(memoryOptimizer, 'getMemoryStats').mockReturnValue({
        heapUsed: 800 * 1024 * 1024, // 800MB - above gcTrigger (750MB)
        heapTotal: 1024 * 1024 * 1024,
        external: 0,
        rss: 1024 * 1024 * 1024,
        arrayBuffers: 0,
      });
      
      (memoryOptimizer as any).checkMemoryUsage();
      
      expect(performOptimizationSpy).toHaveBeenCalled();
      
      performOptimizationSpy.mockRestore();
    });

    it('should handle critical memory usage', () => {
      const performEmergencyCleanupSpy = jest.spyOn(memoryOptimizer as any, 'performEmergencyCleanup');
      
      // Mock critical memory usage
      jest.spyOn(memoryOptimizer, 'getMemoryStats').mockReturnValue({
        heapUsed: 1200 * 1024 * 1024, // 1200MB - above critical (1024MB)
        heapTotal: 1500 * 1024 * 1024,
        external: 0,
        rss: 1500 * 1024 * 1024,
        arrayBuffers: 0,
      });
      
      (memoryOptimizer as any).checkMemoryUsage();
      
      expect(performEmergencyCleanupSpy).toHaveBeenCalled();
      
      performEmergencyCleanupSpy.mockRestore();
    });
  });

  describe('memory trend analysis', () => {
    it('should detect increasing memory trend', () => {
      // Simulate increasing memory usage
      const memoryHistory = [
        { heapUsed: 100 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 150 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 200 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 250 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 300 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
      ];
      
      (memoryOptimizer as any).memoryHistory = memoryHistory;
      
      const info = memoryOptimizer.getDetailedMemoryInfo();
      expect(info.memoryTrend.trend).toBe('increasing');
    });

    it('should detect decreasing memory trend', () => {
      // Simulate decreasing memory usage
      const memoryHistory = [
        { heapUsed: 300 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 250 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 200 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 150 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 100 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
      ];
      
      (memoryOptimizer as any).memoryHistory = memoryHistory;
      
      const info = memoryOptimizer.getDetailedMemoryInfo();
      expect(info.memoryTrend.trend).toBe('decreasing');
    });

    it('should detect stable memory trend', () => {
      // Simulate stable memory usage
      const memoryHistory = [
        { heapUsed: 200 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 202 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 198 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 201 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
        { heapUsed: 199 * 1024 * 1024, heapTotal: 500 * 1024 * 1024, external: 0, rss: 500 * 1024 * 1024, arrayBuffers: 0 },
      ];
      
      (memoryOptimizer as any).memoryHistory = memoryHistory;
      
      const info = memoryOptimizer.getDetailedMemoryInfo();
      expect(info.memoryTrend.trend).toBe('stable');
    });
  });

  describe('module lifecycle', () => {
    it('should clean up on module destroy', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const clearAllCachesSpy = jest.spyOn(memoryOptimizer, 'clearAllCaches');
      
      await memoryOptimizer.onModuleDestroy();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(clearAllCachesSpy).toHaveBeenCalled();
      
      clearIntervalSpy.mockRestore();
      clearAllCachesSpy.mockRestore();
    });
  });
});