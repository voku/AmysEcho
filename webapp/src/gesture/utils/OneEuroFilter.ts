/**
 * One Euro Filter - Amy First
 *
 * Adaptive noise reduction filter for landmark smoothing.
 * Reduces tremor while maintaining responsiveness for intentional movements.
 *
 * Based on: https://cristal.univ-lille.fr/~casiez/1euro/
 */

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

  public reset(): void {
    this.y = 0;
    this.s = 0;
    this.initialized = false;
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

  public reset(): void {
    this.x.reset();
    this.dx.reset();
    this.lastTime = -1;
  }
}

/**
 * One Euro Filter for 3D landmarks (x, y, z coordinates)
 */
export class OneEuroFilter3D {
  private readonly filterX: OneEuroFilter;
  private readonly filterY: OneEuroFilter;
  private readonly filterZ: OneEuroFilter;

  constructor(
    minCutOff: number = 1.0,
    beta: number = 0.0,
    dCutOff: number = 1.0,
  ) {
    this.filterX = new OneEuroFilter(minCutOff, beta, dCutOff);
    this.filterY = new OneEuroFilter(minCutOff, beta, dCutOff);
    this.filterZ = new OneEuroFilter(minCutOff, beta, dCutOff);
  }

  public filter(point: [number, number, number], timestamp: number): [number, number, number] {
    return [
      this.filterX.filter(point[0], timestamp),
      this.filterY.filter(point[1], timestamp),
      this.filterZ.filter(point[2], timestamp),
    ];
  }

  public reset(): void {
    this.filterX.reset();
    this.filterY.reset();
    this.filterZ.reset();
  }
}

/**
 * Hand landmark filter manager with One Euro filters for each landmark point
 */
export class HandLandmarkFilter {
  private readonly filters: OneEuroFilter3D[] = [];
  private readonly NUM_LANDMARKS = 21;

  constructor(
    minCutOff: number = 1.0,
    beta: number = 0.007, // Low beta for stability
    dCutOff: number = 1.0,
  ) {
    for (let i = 0; i < this.NUM_LANDMARKS; i++) {
      this.filters.push(new OneEuroFilter3D(minCutOff, beta, dCutOff));
    }
  }

  public filterLandmarks(landmarks: number[][], timestamp: number): number[][] {
    if (!landmarks || landmarks.length === 0) {
      return landmarks;
    }

    const filtered: number[][] = [];
    const numPoints = Math.min(landmarks.length, this.NUM_LANDMARKS);

    for (let i = 0; i < numPoints; i++) {
      const point = landmarks[i];
      if (point && point.length >= 3) {
        const x = point[0] ?? 0;
        const y = point[1] ?? 0;
        const z = point[2] ?? 0;
        const filteredPoint = this.filters[i]!.filter([x, y, z], timestamp);
        filtered.push([filteredPoint[0], filteredPoint[1], filteredPoint[2]]);
      } else if (point && point.length >= 2) {
        const x = point[0] ?? 0;
        const y = point[1] ?? 0;
        const filteredPoint = this.filters[i]!.filter([x, y, 0], timestamp);
        filtered.push([filteredPoint[0], filteredPoint[1], filteredPoint[2]]);
      } else {
        filtered.push([0, 0, 0]);
      }
    }

    return filtered;
  }

  public reset(): void {
    this.filters.forEach(filter => filter.reset());
  }
}

export default OneEuroFilter;
