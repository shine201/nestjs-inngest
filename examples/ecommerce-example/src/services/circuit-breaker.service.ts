import { Injectable, Logger } from '@nestjs/common';

enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  resetTimeout: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, any>();

  createCircuitBreaker(name: string, config: CircuitBreakerConfig) {
    const breaker = {
      name,
      state: CircuitBreakerState.CLOSED,
      failureCount: 0,
      lastFailureTime: null,
      config,
    };

    this.breakers.set(name, breaker);
    return breaker;
  }

  async execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const breaker = this.breakers.get(name);
    
    if (!breaker) {
      throw new Error(`Circuit breaker ${name} not found`);
    }

    if (breaker.state === CircuitBreakerState.OPEN) {
      if (Date.now() - breaker.lastFailureTime < breaker.config.resetTimeout) {
        throw new Error(`Circuit breaker ${name} is open`);
      }
      
      breaker.state = CircuitBreakerState.HALF_OPEN;
      this.logger.log(`Circuit breaker ${name} moved to half-open state`);
    }

    try {
      const result = await fn();
      
      if (breaker.state === CircuitBreakerState.HALF_OPEN) {
        breaker.state = CircuitBreakerState.CLOSED;
        breaker.failureCount = 0;
        this.logger.log(`Circuit breaker ${name} closed`);
      }
      
      return result;
    } catch (error) {
      breaker.failureCount++;
      breaker.lastFailureTime = Date.now();
      
      if (breaker.failureCount >= breaker.config.failureThreshold) {
        breaker.state = CircuitBreakerState.OPEN;
        this.logger.warn(`Circuit breaker ${name} opened after ${breaker.failureCount} failures`);
      }
      
      throw error;
    }
  }

  getState(name: string): CircuitBreakerState | null {
    const breaker = this.breakers.get(name);
    return breaker ? breaker.state : null;
  }
}