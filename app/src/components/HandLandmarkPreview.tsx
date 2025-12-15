import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import Svg, { Circle, G, Line } from 'react-native-svg';

// Tolerance for landmark coordinate comparison to avoid re-renders from minor floating point variations
const LANDMARK_TOLERANCE = 0.001;


const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

const HAND_COLORS = ['#4f46e5', '#22d3ee', '#fb7185'];

type Landmark = readonly [number, number, number];

export interface HandLandmarkPreviewProps {
  landmarks: number[][][];
  handedness?: string[];
  mirror?: boolean;
  style?: StyleProp<ViewStyle>;
  confidence?: number;
}

const sanitizeConfidence = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return null;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
};

const formatConfidencePercentage = (value: number): string => `${Math.round(value * 100)}%`;

const clamp = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const projectPoint = (point: Landmark, mirror: boolean): { x: number; y: number } => {
  const x = clamp(mirror ? 1 - point[0] : point[0]);
  const y = clamp(point[1]);
  return { x, y };
};

const toLandmark = (point?: number[]): Landmark | null => {
  if (!point) return null;
  const [x = 0, y = 0, z = 0] = point;
  return [x, y, z];
};

const HandLandmarkPreviewComponent: React.FC<HandLandmarkPreviewProps> = ({
  landmarks,
  handedness = [],
  mirror = false,
  style,
  confidence,
}) => {
  const hands = useMemo(() => {
    const validHands = landmarks.filter((hand) => {
      if (!Array.isArray(hand) || hand.length < 21) return false;
      // Skip hands with invalid wrist (all zeros or wrist at 0,0)
      const wrist = hand[0];
      if (!wrist || !Array.isArray(wrist) || wrist.length < 2) return false;
      if (wrist[0] === 0 && wrist[1] === 0) return false;
      // Skip hands where most landmarks are at origin (likely false detection)
      const nonZeroPoints = hand.filter(point =>
        Array.isArray(point) && point.length >= 2 && (point[0] !== 0 || point[1] !== 0)
      );
      return nonZeroPoints.length >= 10; // Require at least 10 non-zero points
    });

    // Deduplicate hands based on wrist position (within 0.1 distance)
    const uniqueHands: number[][][] = [];
    for (const hand of validHands) {
      const wrist = hand[0];
      if (!wrist) {
        continue;
      }
      const [wristX = 0, wristY = 0] = wrist;
      const isDuplicate = uniqueHands.some(existingHand => {
        const existingWrist = existingHand[0];
        if (!existingWrist) {
          return false;
        }
        const [existingX = 0, existingY = 0] = existingWrist;
        const dx = wristX - existingX;
        const dy = wristY - existingY;
        return Math.sqrt(dx * dx + dy * dy) < 0.1; // Consider same if wrist within 0.1 units
      });
      if (!isDuplicate) {
        uniqueHands.push(hand);
      }
    }

    // For preview, show up to 2 unique valid hands
    return uniqueHands.slice(0, 2);
  }, [landmarks]);

  const safeConfidence = useMemo(() => sanitizeConfidence(confidence), [confidence]);
  const confidenceDisplay = safeConfidence !== null
    ? `Sicherheit: ${formatConfidencePercentage(safeConfidence)}`
    : 'Sicherheit: wird ermittelt…';

  if (!hands.length) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.placeholder} testID="hand-preview-placeholder">
          Hände werden gesucht…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}
      accessibilityRole="image"
      accessibilityLabel="Hand-Landmark-Vorschau"
    >
      <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet">
        {hands.map((hand, handIndex) => {
          const color = HAND_COLORS[handIndex % HAND_COLORS.length] ?? '#ffffff';
          const label = handedness[handIndex]?.toLowerCase();
          const strokeDasharray = label === 'left' ? '2 1' : undefined;

          return (
            <G key={`hand-${handIndex}`} testID={`hand-group-${handIndex}`}>
              {HAND_CONNECTIONS.map(([start, end]) => {
                const startRaw = hand[start];
                const endRaw = hand[end];
                if (!startRaw || !endRaw) {
                  return null;
                }
                const startPoint = toLandmark(startRaw);
                const endPoint = toLandmark(endRaw);
                if (!startPoint || !endPoint) {
                  return null;
                }
                const p1 = projectPoint(startPoint, mirror);
                const p2 = projectPoint(endPoint, mirror);
                const lineProps = strokeDasharray ? { strokeDasharray } : undefined;
                return (
                  <Line
                    key={`hand-${handIndex}-line-${start}-${end}`}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={color}
                    strokeWidth={0.01}
                    {...lineProps}
                  />
                );
              })}
              {hand.map((point, index) => {
                const landmark = toLandmark(point);
                if (!landmark) {
                  return null;
                }
                const { x, y } = projectPoint(landmark, mirror);
                return (
                  <Circle
                    key={`hand-${handIndex}-landmark-${index}`}
                    testID={`landmark-${handIndex}`}
                    cx={x}
                    cy={y}
                    r={0.015}
                    fill={color}
                    opacity={index === 0 ? 0.6 : 0.9}
                  />
                );
              })}
            </G>
          );
        })}
      </Svg>
      <View
        style={styles.confidenceBadge}
        accessibilityRole="text"
        accessibilityLabel={confidenceDisplay}
      >
        <Text style={styles.confidenceText}>{confidenceDisplay}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    minWidth: 148,
    minHeight: 148,
  },
  placeholder: {
    color: '#e5e7eb',
    fontSize: 12,
  },
  confidenceBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.85)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  confidenceText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
});

/**
 * Custom comparison function for React.memo to avoid unnecessary re-renders.
 * Compares landmark arrays with tolerance for small floating point variations.
 */
const landmarksAreEqual = (
  prevLandmarks: number[][][],
  nextLandmarks: number[][][],
): boolean => {
  if (prevLandmarks === nextLandmarks) {
    return true;
  }
  if (prevLandmarks.length !== nextLandmarks.length) {
    return false;
  }
  for (let handIdx = 0; handIdx < prevLandmarks.length; handIdx++) {
    const prevHand = prevLandmarks[handIdx];
    const nextHand = nextLandmarks[handIdx];
    // Handle null/undefined cases: both null/undefined = equal, only one = not equal
    if (!prevHand && !nextHand) {
      continue;
    }
    if (!prevHand || !nextHand || prevHand.length !== nextHand.length) {
      return false;
    }
    for (let pointIdx = 0; pointIdx < prevHand.length; pointIdx++) {
      const prevPoint = prevHand[pointIdx];
      const nextPoint = nextHand[pointIdx];
      // Handle null/undefined cases: both null/undefined = equal, only one = not equal
      if (!prevPoint && !nextPoint) {
        continue;
      }
      if (!prevPoint || !nextPoint || prevPoint.length !== nextPoint.length) {
        return false;
      }
      for (let coord = 0; coord < prevPoint.length; coord++) {
        const diff = Math.abs((prevPoint[coord] ?? 0) - (nextPoint[coord] ?? 0));
        if (diff > LANDMARK_TOLERANCE) {
          return false;
        }
      }
    }
  }
  return true;
};

const handednessAreEqual = (
  prevHandedness: string[] | undefined,
  nextHandedness: string[] | undefined,
): boolean => {
  if (prevHandedness === nextHandedness) {
    return true;
  }
  if (!prevHandedness || !nextHandedness) {
    return prevHandedness === nextHandedness;
  }
  if (prevHandedness.length !== nextHandedness.length) {
    return false;
  }
  for (let i = 0; i < prevHandedness.length; i++) {
    if (prevHandedness[i] !== nextHandedness[i]) {
      return false;
    }
  }
  return true;
};

const propsAreEqual = (
  prevProps: HandLandmarkPreviewProps,
  nextProps: HandLandmarkPreviewProps,
): boolean => {
  // Fast path: check reference equality first
  if (prevProps === nextProps) {
    return true;
  }

  // Check simple props
  if (prevProps.mirror !== nextProps.mirror) {
    return false;
  }
  if (prevProps.confidence !== nextProps.confidence) {
    return false;
  }
  if (prevProps.style !== nextProps.style) {
    return false;
  }

  // Check handedness array
  if (!handednessAreEqual(prevProps.handedness, nextProps.handedness)) {
    return false;
  }

  // Check landmarks with tolerance
  return landmarksAreEqual(prevProps.landmarks, nextProps.landmarks);
};

export const HandLandmarkPreview = memo(HandLandmarkPreviewComponent, propsAreEqual);

export default HandLandmarkPreview;
