export type NonManualFeatures = {
  headYaw: number | null;
  headPitch: number | null;
  mouthOpenness: number | null;
  eyebrowRaiseLeft: number | null;
  eyebrowRaiseRight: number | null;
  source: 'face' | 'pose' | 'mixed';
};

type Point = [number, number, number];

const FACE_NOSE_TIP = 1;
const FACE_LEFT_EYE = 33;
const FACE_RIGHT_EYE = 263;
const FACE_UPPER_LIP = 13;
const FACE_LOWER_LIP = 14;
const FACE_LEFT_EYE_UPPER = 159;
const FACE_RIGHT_EYE_UPPER = 386;
const FACE_LEFT_EYEBROW = 105;
const FACE_RIGHT_EYEBROW = 334;

const POSE_NOSE = 0;
const POSE_LEFT_SHOULDER = 11;
const POSE_RIGHT_SHOULDER = 12;

function getPoint(landmarks: number[][], index: number): Point | null {
  const point = landmarks[index];
  if (!Array.isArray(point)) {
    return null;
  }
  const [x, y, z] = point;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
    return null;
  }
  return [x, y, z];
}

function distance(a: Point, b: Point): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function average(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function extractFromFace(faceLandmarks: number[][]): Omit<NonManualFeatures, 'source'> | null {
  if (!Array.isArray(faceLandmarks) || faceLandmarks.length === 0) {
    return null;
  }

  const nose = getPoint(faceLandmarks, FACE_NOSE_TIP);
  const leftEye = getPoint(faceLandmarks, FACE_LEFT_EYE);
  const rightEye = getPoint(faceLandmarks, FACE_RIGHT_EYE);
  if (!nose || !leftEye || !rightEye) {
    return null;
  }

  const eyeCenter = average(leftEye, rightEye);
  const eyeDistance = distance(leftEye, rightEye) || 1;
  const headYaw = (nose[0] - eyeCenter[0]) / eyeDistance;
  const headPitch = (nose[1] - eyeCenter[1]) / eyeDistance;

  const upperLip = getPoint(faceLandmarks, FACE_UPPER_LIP);
  const lowerLip = getPoint(faceLandmarks, FACE_LOWER_LIP);
  const mouthOpenness = upperLip && lowerLip ? distance(upperLip, lowerLip) / eyeDistance : null;

  const leftEyeUpper = getPoint(faceLandmarks, FACE_LEFT_EYE_UPPER);
  const rightEyeUpper = getPoint(faceLandmarks, FACE_RIGHT_EYE_UPPER);
  const leftBrow = getPoint(faceLandmarks, FACE_LEFT_EYEBROW);
  const rightBrow = getPoint(faceLandmarks, FACE_RIGHT_EYEBROW);

  const eyebrowRaiseLeft = leftEyeUpper && leftBrow ? (leftEyeUpper[1] - leftBrow[1]) / eyeDistance : null;
  const eyebrowRaiseRight = rightEyeUpper && rightBrow ? (rightEyeUpper[1] - rightBrow[1]) / eyeDistance : null;

  return {
    headYaw,
    headPitch,
    mouthOpenness,
    eyebrowRaiseLeft,
    eyebrowRaiseRight,
  };
}

function extractFromPose(poseLandmarks: number[][]): Pick<NonManualFeatures, 'headYaw' | 'headPitch'> | null {
  if (!Array.isArray(poseLandmarks) || poseLandmarks.length === 0) {
    return null;
  }

  const nose = getPoint(poseLandmarks, POSE_NOSE);
  const leftShoulder = getPoint(poseLandmarks, POSE_LEFT_SHOULDER);
  const rightShoulder = getPoint(poseLandmarks, POSE_RIGHT_SHOULDER);
  if (!nose || !leftShoulder || !rightShoulder) {
    return null;
  }

  const shoulderCenter = average(leftShoulder, rightShoulder);
  const shoulderWidth = distance(leftShoulder, rightShoulder) || 1;
  return {
    headYaw: (nose[0] - shoulderCenter[0]) / shoulderWidth,
    headPitch: (nose[1] - shoulderCenter[1]) / shoulderWidth,
  };
}

export function extractNonManualFeatures(
  poseLandmarks?: number[][],
  faceLandmarks?: number[][],
): NonManualFeatures | null {
  const faceFeatures = faceLandmarks ? extractFromFace(faceLandmarks) : null;
  const poseFeatures = poseLandmarks ? extractFromPose(poseLandmarks) : null;

  if (!faceFeatures && !poseFeatures) {
    return null;
  }

  return {
    headYaw: faceFeatures?.headYaw ?? poseFeatures?.headYaw ?? null,
    headPitch: faceFeatures?.headPitch ?? poseFeatures?.headPitch ?? null,
    mouthOpenness: faceFeatures?.mouthOpenness ?? null,
    eyebrowRaiseLeft: faceFeatures?.eyebrowRaiseLeft ?? null,
    eyebrowRaiseRight: faceFeatures?.eyebrowRaiseRight ?? null,
    source: faceFeatures && poseFeatures ? 'mixed' : faceFeatures ? 'face' : 'pose',
  };
}
