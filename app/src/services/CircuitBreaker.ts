export enum CircuitBreakerState {
  CLOSED,
  OPEN,
  HALF_OPEN,
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures = 0;
  private lastFailureTime: number | null = null;
  private successCounter = 0;

  constructor(
    private readonly failureThreshold: number = 3,
    private readonly recoveryTimeout: number = 10000,
    private readonly successThreshold: number = 2,
  ) {}

  public recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
    } else if (this.failures >= this.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  public recordSuccess(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCounter++;
      if (this.successCounter >= this.successThreshold) {
        this.reset();
      }
    } else {
      this.reset();
    }
  }

  public isOpen(): boolean {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successCounter = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  public isHalfOpen(): boolean {
    return this.state === CircuitBreakerState.HALF_OPEN;
  }

  public reset(): void {
    this.failures = 0;
    this.lastFailureTime = null;
    this.state = CircuitBreakerState.CLOSED;
    this.successCounter = 0;
  }
}
