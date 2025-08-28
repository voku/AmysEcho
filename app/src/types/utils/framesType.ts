import { Vector3D } from '../';

export interface FrameData {
  landmarks: Vector3D[][];
  handedness?: string[];
}
