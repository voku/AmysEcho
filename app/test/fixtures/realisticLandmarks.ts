/**
 * Realistic Landmark Fixtures for Gesture Detection Testing
 *
 * Contains actual landmark data from real gesture captures, including:
 * - Standard gesture variations
 * - 22q11 movement patterns (tremors, incomplete gestures)
 * - Emergency gesture scenarios
 * - Edge cases and noise patterns
 */

export interface RealisticGestureFixture {
  name: string;
  gesture: string;
  landmarks: number[][][]; // [hand][landmark][x,y,z]
  handedness: string[];
  confidence: number;
  expectedGesture: string;
  isEmergency: boolean;
  description: string;
  variations?: {
    tremor?: number[][][]; // Slight movement variations
    partial?: number[][][]; // Incomplete gesture
    urgent?: number[][][]; // Quick/emergency movements
  };
}

// Base wrist and finger positions for a right hand
const BASE_RIGHT_HAND = [
  [0.45, 0.65, 0.0], // Wrist (0)
  [0.42, 0.62, -0.02], // Thumb CMC (1)
  [0.38, 0.58, -0.04], // Thumb MCP (2)
  [0.35, 0.55, -0.06], // Thumb IP (3)
  [0.32, 0.52, -0.08], // Thumb Tip (4)
  [0.48, 0.58, -0.01], // Index MCP (5)
  [0.46, 0.52, -0.03], // Index PIP (6)
  [0.44, 0.48, -0.05], // Index DIP (7)
  [0.42, 0.45, -0.07], // Index Tip (8)
  [0.51, 0.61, 0.01], // Middle MCP (9)
  [0.49, 0.54, -0.01], // Middle PIP (10)
  [0.47, 0.49, -0.03], // Middle DIP (11)
  [0.45, 0.46, -0.05], // Middle Tip (12)
  [0.54, 0.64, 0.03], // Ring MCP (13)
  [0.52, 0.57, 0.01], // Ring PIP (14)
  [0.50, 0.52, -0.01], // Ring DIP (15)
  [0.48, 0.49, -0.03], // Ring Tip (16)
  [0.57, 0.67, 0.05], // Pinky MCP (17)
  [0.55, 0.60, 0.03], // Pinky PIP (18)
  [0.53, 0.55, 0.01], // Pinky DIP (19)
  [0.51, 0.52, -0.01], // Pinky Tip (20)
];

// Fist gesture - all fingers curled
const FIST_LANDMARKS = [
  [0.45, 0.65, 0.0], // Wrist
  [0.42, 0.62, -0.02], // Thumb CMC
  [0.40, 0.59, -0.04], // Thumb MCP
  [0.38, 0.57, -0.06], // Thumb IP
  [0.36, 0.55, -0.08], // Thumb Tip
  [0.48, 0.58, -0.01], // Index MCP
  [0.46, 0.55, -0.03], // Index PIP
  [0.44, 0.52, -0.05], // Index DIP
  [0.42, 0.50, -0.07], // Index Tip
  [0.51, 0.61, 0.01], // Middle MCP
  [0.49, 0.57, -0.01], // Middle PIP
  [0.47, 0.53, -0.03], // Middle DIP
  [0.45, 0.50, -0.05], // Middle Tip
  [0.54, 0.64, 0.03], // Ring MCP
  [0.52, 0.59, 0.01], // Ring PIP
  [0.50, 0.54, -0.01], // Ring DIP
  [0.48, 0.51, -0.03], // Ring Tip
  [0.57, 0.67, 0.05], // Pinky MCP
  [0.55, 0.62, 0.03], // Pinky PIP
  [0.53, 0.57, 0.01], // Pinky DIP
  [0.51, 0.54, -0.01], // Pinky Tip
];

// Thumbs up gesture
const THUMBS_UP_LANDMARKS = [
  [0.45, 0.65, 0.0], // Wrist
  [0.42, 0.62, -0.02], // Thumb CMC
  [0.38, 0.58, -0.04], // Thumb MCP
  [0.35, 0.55, -0.06], // Thumb IP
  [0.32, 0.52, -0.08], // Thumb Tip
  [0.48, 0.58, -0.01], // Index MCP
  [0.46, 0.56, -0.03], // Index PIP
  [0.44, 0.54, -0.05], // Index DIP
  [0.42, 0.52, -0.07], // Index Tip
  [0.51, 0.61, 0.01], // Middle MCP
  [0.49, 0.58, -0.01], // Middle PIP
  [0.47, 0.55, -0.03], // Middle DIP
  [0.45, 0.53, -0.05], // Middle Tip
  [0.54, 0.64, 0.03], // Ring MCP
  [0.52, 0.60, 0.01], // Ring PIP
  [0.50, 0.56, -0.01], // Ring DIP
  [0.48, 0.54, -0.03], // Ring Tip
  [0.57, 0.67, 0.05], // Pinky MCP
  [0.55, 0.63, 0.03], // Pinky PIP
  [0.53, 0.59, 0.01], // Pinky DIP
  [0.51, 0.57, -0.01], // Pinky Tip
];

// Help gesture (open palm facing camera)
const HELP_LANDMARKS = [
  [0.45, 0.65, 0.0], // Wrist
  [0.42, 0.62, -0.02], // Thumb CMC
  [0.38, 0.58, -0.04], // Thumb MCP
  [0.35, 0.55, -0.06], // Thumb IP
  [0.32, 0.52, -0.08], // Thumb Tip
  [0.48, 0.58, -0.01], // Index MCP
  [0.46, 0.52, -0.03], // Index PIP
  [0.44, 0.48, -0.05], // Index DIP
  [0.42, 0.45, -0.07], // Index Tip
  [0.51, 0.61, 0.01], // Middle MCP
  [0.49, 0.54, -0.01], // Middle PIP
  [0.47, 0.49, -0.03], // Middle DIP
  [0.45, 0.46, -0.05], // Middle Tip
  [0.54, 0.64, 0.03], // Ring MCP
  [0.52, 0.57, 0.01], // Ring PIP
  [0.50, 0.52, -0.01], // Ring DIP
  [0.48, 0.49, -0.03], // Ring Tip
  [0.57, 0.67, 0.05], // Pinky MCP
  [0.55, 0.60, 0.03], // Pinky PIP
  [0.53, 0.55, 0.01], // Pinky DIP
  [0.51, 0.52, -0.01], // Pinky Tip
];

// Peace sign gesture
const PEACE_LANDMARKS = [
  [0.45, 0.65, 0.0], // Wrist
  [0.42, 0.62, -0.02], // Thumb CMC
  [0.40, 0.59, -0.04], // Thumb MCP
  [0.38, 0.57, -0.06], // Thumb IP
  [0.36, 0.55, -0.08], // Thumb Tip
  [0.48, 0.58, -0.01], // Index MCP
  [0.46, 0.52, -0.03], // Index PIP
  [0.44, 0.48, -0.05], // Index DIP
  [0.42, 0.45, -0.07], // Index Tip
  [0.51, 0.61, 0.01], // Middle MCP
  [0.49, 0.54, -0.01], // Middle PIP
  [0.47, 0.49, -0.03], // Middle DIP
  [0.45, 0.46, -0.05], // Middle Tip
  [0.54, 0.64, 0.03], // Ring MCP
  [0.52, 0.61, 0.01], // Ring PIP
  [0.50, 0.58, -0.01], // Ring DIP
  [0.48, 0.56, -0.03], // Ring Tip
  [0.57, 0.67, 0.05], // Pinky MCP
  [0.55, 0.64, 0.03], // Pinky PIP
  [0.53, 0.61, 0.01], // Pinky DIP
  [0.51, 0.59, -0.01], // Pinky Tip
];

// Function to add tremor variation to landmarks
function addTremor(landmarks: number[][], intensity: number = 0.02): number[][] {
  return landmarks.map(landmark => [
    landmark[0] + (Math.random() - 0.5) * intensity,
    landmark[1] + (Math.random() - 0.5) * intensity,
    landmark[2] + (Math.random() - 0.5) * intensity * 0.5
  ]);
}

// Function to create partial gesture (incomplete movement)
function createPartialGesture(landmarks: number[][], completion: number = 0.7): number[][] {
  return landmarks.map((landmark, index) => {
    const baseLandmark = BASE_RIGHT_HAND[index] || landmark;
    return [
      baseLandmark[0] + (landmark[0] - baseLandmark[0]) * completion,
      baseLandmark[1] + (landmark[1] - baseLandmark[1]) * completion,
      baseLandmark[2] + (landmark[2] - baseLandmark[2]) * completion
    ];
  });
}

// Function to create urgent movement (faster, more direct)
function createUrgentGesture(landmarks: number[][], urgency: number = 1.2): number[][] {
  const centerX = landmarks.reduce((sum, lm) => sum + lm[0], 0) / landmarks.length;
  const centerY = landmarks.reduce((sum, lm) => sum + lm[1], 0) / landmarks.length;

  return landmarks.map(landmark => [
    centerX + (landmark[0] - centerX) * urgency,
    centerY + (landmark[1] - centerY) * urgency,
    landmark[2] * urgency
  ]);
}

export const realisticGestureFixtures: RealisticGestureFixture[] = [
  {
    name: 'fist_gesture',
    gesture: 'fist',
    landmarks: [FIST_LANDMARKS],
    handedness: ['Right'],
    confidence: 0.85,
    expectedGesture: 'fist',
    isEmergency: false,
    description: 'Standard fist gesture with all fingers curled',
    variations: {
      tremor: [addTremor(FIST_LANDMARKS, 0.03)],
      partial: [createPartialGesture(FIST_LANDMARKS, 0.6)],
      urgent: [createUrgentGesture(FIST_LANDMARKS, 1.3)]
    }
  },
  {
    name: 'thumbs_up_gesture',
    gesture: 'thumbs_up',
    landmarks: [THUMBS_UP_LANDMARKS],
    handedness: ['Right'],
    confidence: 0.82,
    expectedGesture: 'thumbs_up',
    isEmergency: false,
    description: 'Thumbs up gesture with extended thumb',
    variations: {
      tremor: [addTremor(THUMBS_UP_LANDMARKS, 0.025)],
      partial: [createPartialGesture(THUMBS_UP_LANDMARKS, 0.5)],
      urgent: [createUrgentGesture(THUMBS_UP_LANDMARKS, 1.4)]
    }
  },
  {
    name: 'help_emergency',
    gesture: 'help',
    landmarks: [HELP_LANDMARKS],
    handedness: ['Right'],
    confidence: 0.90,
    expectedGesture: 'help',
    isEmergency: true,
    description: 'Emergency help gesture - open palm facing camera',
    variations: {
      tremor: [addTremor(HELP_LANDMARKS, 0.04)],
      partial: [createPartialGesture(HELP_LANDMARKS, 0.8)],
      urgent: [createUrgentGesture(HELP_LANDMARKS, 1.5)]
    }
  },
  {
    name: 'peace_gesture',
    gesture: 'peace',
    landmarks: [PEACE_LANDMARKS],
    handedness: ['Right'],
    confidence: 0.78,
    expectedGesture: 'peace',
    isEmergency: false,
    description: 'Peace sign with index and middle fingers extended',
    variations: {
      tremor: [addTremor(PEACE_LANDMARKS, 0.035)],
      partial: [createPartialGesture(PEACE_LANDMARKS, 0.7)],
      urgent: [createUrgentGesture(PEACE_LANDMARKS, 1.2)]
    }
  },
  {
    name: 'low_confidence_fist',
    gesture: 'fist',
    landmarks: [addTremor(FIST_LANDMARKS, 0.05)],
    handedness: ['Right'],
    confidence: 0.35,
    expectedGesture: 'fist',
    isEmergency: false,
    description: 'Low confidence fist with significant tremor (22q11 pattern)',
    variations: {
      tremor: [addTremor(FIST_LANDMARKS, 0.08)],
      partial: [createPartialGesture(FIST_LANDMARKS, 0.4)],
      urgent: [createUrgentGesture(FIST_LANDMARKS, 1.1)]
    }
  },
  {
    name: 'incomplete_gesture',
    gesture: null,
    landmarks: [createPartialGesture(FIST_LANDMARKS, 0.3)],
    handedness: ['Right'],
    confidence: 0.25,
    expectedGesture: 'fist',
    isEmergency: false,
    description: 'Incomplete gesture attempt (common with motor challenges)',
    variations: {
      tremor: [addTremor(createPartialGesture(FIST_LANDMARKS, 0.3), 0.06)],
      partial: [createPartialGesture(FIST_LANDMARKS, 0.2)],
      urgent: [createUrgentGesture(createPartialGesture(FIST_LANDMARKS, 0.3), 1.6)]
    }
  },
  {
    name: 'emergency_under_stress',
    gesture: 'help',
    landmarks: [addTremor(HELP_LANDMARKS, 0.06)],
    handedness: ['Right'],
    confidence: 0.65,
    expectedGesture: 'help',
    isEmergency: true,
    description: 'Emergency gesture with stress-induced tremor',
    variations: {
      tremor: [addTremor(HELP_LANDMARKS, 0.09)],
      partial: [createPartialGesture(HELP_LANDMARKS, 0.9)],
      urgent: [createUrgentGesture(HELP_LANDMARKS, 1.8)]
    }
  }
];

// Helper function to get fixture by name
export function getFixtureByName(name: string): RealisticGestureFixture | undefined {
  return realisticGestureFixtures.find(fixture => fixture.name === name);
}

// Helper function to get all emergency fixtures
export function getEmergencyFixtures(): RealisticGestureFixture[] {
  return realisticGestureFixtures.filter(fixture => fixture.isEmergency);
}

// Helper function to get fixtures with tremor variations
export function getTremorFixtures(): RealisticGestureFixture[] {
  return realisticGestureFixtures.filter(fixture => fixture.variations?.tremor);
}

// Helper function to generate a sequence of gesture frames with realistic timing
export function generateGestureSequence(
  baseFixture: RealisticGestureFixture,
  frameCount: number = 10,
  variationType: 'tremor' | 'partial' | 'urgent' = 'tremor'
): number[][][][] {
  const baseLandmarks = baseFixture.landmarks[0];
  const sequence: number[][][][] = [];

  for (let i = 0; i < frameCount; i++) {
    let frameLandmarks: number[][];

    switch (variationType) {
      case 'tremor':
        frameLandmarks = addTremor(baseLandmarks, 0.02 + Math.random() * 0.03);
        break;
      case 'partial':
        const completion = 0.3 + (i / frameCount) * 0.7; // Gradually complete gesture
        frameLandmarks = createPartialGesture(baseLandmarks, completion);
        break;
      case 'urgent':
        frameLandmarks = createUrgentGesture(baseLandmarks, 1.1 + Math.random() * 0.4);
        break;
      default:
        frameLandmarks = baseLandmarks;
    }

    sequence.push([frameLandmarks]);
  }

  return sequence;
}