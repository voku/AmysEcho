import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';

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

export const HandLandmarkPreview: React.FC<HandLandmarkPreviewProps> = ({
  landmarks,
  handedness = [],
  mirror = false,
  style,
  confidence,
}) => {
  const hands = useMemo(() => landmarks.filter((hand) => Array.isArray(hand) && hand.length > 0), [landmarks]);

  if (!hands.length) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.placeholder}>Hände werden gesucht…</Text>
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
          const color = HAND_COLORS[handIndex % HAND_COLORS.length];
          const label = handedness[handIndex]?.toLowerCase();
          const strokeDasharray = label === 'left' ? '2 1' : undefined;

          return (
            <G key={`hand-${handIndex}`} testID={`hand-group-${handIndex}`}>
              {HAND_CONNECTIONS.map(([start, end]) => {
                const startPoint = toLandmark(hand[start]);
                const endPoint = toLandmark(hand[end]);
                if (!startPoint || !endPoint) {
                  return null;
                }
                const p1 = projectPoint(startPoint, mirror);
                const p2 = projectPoint(endPoint, mirror);
                return (
                  <Line
                    key={`hand-${handIndex}-line-${start}-${end}`}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={color}
                    strokeWidth={0.01}
                    strokeDasharray={strokeDasharray}
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
      {typeof confidence === 'number' && (
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceText}>{`Sicherheit: ${(confidence * 100).toFixed(0)}%`}</Text>
        </View>
      )}
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

export default HandLandmarkPreview;
