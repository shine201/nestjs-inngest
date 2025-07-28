/**
 * Jest test setup file
 */

// Import reflect-metadata for all tests
import "reflect-metadata";

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to ignore specific log levels during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Set test timeout
jest.setTimeout(10000);

// Mock timers if needed
// jest.useFakeTimers();
