export type TelemetrySample = {
  t: number;
  path: 'offline' | 'cloud';
  latencyMs: number;
  label?: string;
  score?: number;
};

const buffer: TelemetrySample[] = [];
const MAX = 500;

export const record = (s: TelemetrySample): void => {
  buffer.push(s);
  if (buffer.length > MAX) {
    buffer.shift();
  }
};

export const dump = (): TelemetrySample[] => [...buffer];
