class LowPassFilter {
  private y = 0;
  private s = 0;
  private initialized = false;

  constructor(private alpha: number) {}

  public filter(x: number): number {
    if (!this.initialized) {
      this.y = x;
      this.s = x;
      this.initialized = true;
    } else {
      this.s = this.alpha * x + (1 - this.alpha) * this.s;
      this.y = x;
    }
    return this.s;
  }

  public filterWithAlpha(x: number, alpha: number): number {
    this.alpha = alpha;
    return this.filter(x);
  }

  public hasLastRawValue(): boolean {
    return this.initialized;
  }

  public lastRawValue(): number {
    return this.y;
  }
}

export class OneEuroFilter {
  private readonly x: LowPassFilter;
  private readonly dx: LowPassFilter;
  private lastTime: number;

  constructor(
    private readonly minCutOff: number = 1.0,
    private readonly beta: number = 0.0,
    private readonly dCutOff: number = 1.0,
  ) {
    this.x = new LowPassFilter(this.getAlpha(minCutOff));
    this.dx = new LowPassFilter(this.getAlpha(dCutOff));
    this.lastTime = -1;
  }

  private getAlpha(cutOff: number): number {
    const te = 1.0 / (2 * Math.PI * cutOff);
    return 1.0 / (1.0 + te);
  }

  public filter(x: number, timestamp: number): number {
    if (this.lastTime !== -1 && timestamp !== -1) {
      const te = timestamp - this.lastTime;
      const edx = (x - this.x.lastRawValue()) / te;
      const alpha = this.getAlpha(this.minCutOff + this.beta * Math.abs(this.dx.filterWithAlpha(edx, this.getAlpha(this.dCutOff))));
      this.lastTime = timestamp;
      return this.x.filterWithAlpha(x, alpha);
    }
    this.lastTime = timestamp;
    return this.x.filter(x);
  }
}
