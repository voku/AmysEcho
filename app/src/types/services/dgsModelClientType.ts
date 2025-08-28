import { Buffer } from 'buffer';

export type Point = [number, number, number];
export type CentroidMap = Record<string, Point[]>;

export type StorageLike = {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
};

export type MlpMeta = { etag?: string; checksum?: string; version?: string };