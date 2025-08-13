import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export function HandOverlay({
  lm, w, h,
}: { lm: Float32Array | null; w: number; h: number }) {
  if (!lm) return null;

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < lm.length; i += 3) {
    pts.push({ x: lm[i] * w, y: lm[i + 1] * h });
  }

  return (
    <View style={{ position: 'absolute', width: w, height: h, pointerEvents: 'none' }}>
      <Svg width={w} height={h}>
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill="#007aff" />
        ))}
      </Svg>
    </View>
  );
}
