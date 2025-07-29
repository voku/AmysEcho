let handLandmarkModel: any = null;

export function setHandLandmarkModel(model: any): void {
  handLandmarkModel = model;
}

export function extractHandLandmarks(frame: any): number[][] {
  // Mock implementation for demo
  // In production, this would use MediaPipe or similar
  const numLandmarks = 21;
  const landmarks: number[][] = [];

  for (let i = 0; i < numLandmarks; i++) {
    landmarks.push([
      Math.random() * (frame.width || 640),
      Math.random() * (frame.height || 480),
      Math.random() * 0.1,
    ]);
  }

  return landmarks;
}
