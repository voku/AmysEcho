import { Vector3D } from '../';

export type CentroidMap = Record<string, Vector3D[]>;

export type StorageLike = {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
};

export type MlpMeta = { etag?: string; checksum?: string; version?: string };