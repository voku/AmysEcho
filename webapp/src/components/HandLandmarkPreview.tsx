import { useMemo } from 'react';

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
  title?: string;
  landmarks: number[][][];
  handedness?: string[];
  mirror?: boolean;
  confidence?: number | null;
  className?: string;
}

const clamp = (value: number): number => {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const toLandmark = (point?: number[]): Landmark | null => {
  if (!Array.isArray(point)) return null;
  const [x = 0, y = 0, z = 0] = point;
  return [x, y, z];
};

const projectPoint = (point: Landmark, mirror: boolean): { x: number; y: number } => {
  const x = clamp(mirror ? 1 - point[0] : point[0]);
  const y = clamp(point[1]);
  return { x, y };
};

const sanitizeConfidence = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || Number.isNaN(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const formatConfidence = (value: number | null): string => {
  if (value === null) return 'Sicherheit: wird ermittelt…';
  return `Sicherheit: ${Math.round(value * 100)}%`;
};

function normalizeHand(hand: unknown): number[][] {
  if (!Array.isArray(hand)) return [];
  const landmarks: number[][] = [];
  hand.forEach((point) => {
    const coords = toLandmark(Array.isArray(point) ? point : []);
    if (coords) {
      landmarks.push([...coords]);
    }
  });
  return landmarks;
}

export function HandLandmarkPreview({
  title,
  landmarks,
  handedness = [],
  mirror = false,
  confidence,
  className,
}: HandLandmarkPreviewProps) {
  const hands = useMemo(() => {
    const validHands = landmarks
      .map((hand) => normalizeHand(hand))
      .filter((hand) => hand.length >= 21)
      .filter((hand) => {
        const wrist = hand[0];
        if (!wrist || wrist.length < 2) return false;
        if (wrist[0] === 0 && wrist[1] === 0) return false;
        const nonZeroPoints = hand.filter((point) =>
          Array.isArray(point) && point.length >= 2 && (point[0] !== 0 || point[1] !== 0),
        );
        return nonZeroPoints.length >= 10;
      });

    const uniqueHands: number[][][] = [];
    for (const hand of validHands) {
      const wrist = hand[0];
      if (!wrist) continue;
      const [wristX = 0, wristY = 0] = wrist;
      const isDuplicate = uniqueHands.some((existingHand) => {
        const existingWrist = existingHand[0];
        if (!existingWrist) return false;
        const [existingX = 0, existingY = 0] = existingWrist;
        const dx = wristX - existingX;
        const dy = wristY - existingY;
        return Math.sqrt(dx * dx + dy * dy) < 0.1;
      });
      if (!isDuplicate) {
        uniqueHands.push(hand);
      }
    }

    return uniqueHands.slice(0, 2);
  }, [landmarks]);

  const safeConfidence = useMemo(() => sanitizeConfidence(confidence), [confidence]);

  return (
    <div className={`landmark-preview ${className ?? ''}`}>
      <div className="landmark-preview__header">
        <p className="eyebrow">{title ?? 'Hand-Landmarks'}</p>
        <span className="badge">{formatConfidence(safeConfidence)}</span>
      </div>

      <div className="landmark-preview__canvas" role="img" aria-label="Hand-Landmark-Vorschau">
        {hands.length === 0 ? (
          <p className="muted small">Hände werden gesucht…</p>
        ) : (
          <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet">
            {hands.map((hand, handIndex) => {
              const color = HAND_COLORS[handIndex % HAND_COLORS.length] ?? '#ffffff';
              const label = handedness[handIndex]?.toLowerCase();
              const dash = label === 'left' ? '2 1' : undefined;
              return (
                <g key={`hand-${handIndex}`}>
                  {HAND_CONNECTIONS.map(([start, end]) => {
                    const startRaw = hand[start];
                    const endRaw = hand[end];
                    if (!startRaw || !endRaw) return null;
                    const startPoint = toLandmark(startRaw);
                    const endPoint = toLandmark(endRaw);
                    if (!startPoint || !endPoint) return null;
                    const p1 = projectPoint(startPoint, mirror);
                    const p2 = projectPoint(endPoint, mirror);
                    return (
                      <line
                        key={`hand-${handIndex}-line-${start}-${end}`}
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke={color}
                        strokeWidth={0.01}
                        strokeDasharray={dash}
                      />
                    );
                  })}
                  {hand.map((point, index) => {
                    const landmark = toLandmark(point);
                    if (!landmark) return null;
                    const { x, y } = projectPoint(landmark, mirror);
                    return (
                      <circle
                        key={`hand-${handIndex}-landmark-${index}`}
                        cx={x}
                        cy={y}
                        r={0.015}
                        fill={color}
                        opacity={index === 0 ? 0.6 : 0.9}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

export default HandLandmarkPreview;
