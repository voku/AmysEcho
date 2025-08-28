export type HIPEndpoint = 'HIP_1' | 'HIP_2' | 'HIP_3' | 'HIP_4';

export interface HIPEvent {
  id: string;
  hip: HIPEndpoint;
  type: string;
  timestamp: number;
  details?: Record<string, any>;
}