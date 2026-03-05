export interface GestureFixture {
  gestureName: string;
  source: 'camera' | 'recorded';
  expectedConfidence: number;
  capturedAt: string;
  landmarks: number[][][][];
  sourceLandmarksFile?: string;
}
