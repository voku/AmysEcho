import React, { useEffect } from 'react';
import { Canvas, Circle } from '@shopify/react-native-skia';
import { useSharedValue, withTiming, withRepeat, useDerivedValue } from 'react-native-reanimated';

import { usePerformance } from '../context/PerformanceContext';

interface PulsingCircleProps {
  size: number;
  color?: string;
}

export default function PulsingCircle({ size, color = '#ffffff' }: PulsingCircleProps) {
  const { isLowPerformanceMode } = usePerformance();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!isLowPerformanceMode) {
      progress.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
    }
  }, [progress, isLowPerformanceMode]);

  const radius = useDerivedValue(() => (size / 2) * progress.value);
  const opacity = useDerivedValue(() => 1 - progress.value);

  if (isLowPerformanceMode) {
    return (
      <Canvas style={{ width: size, height: size, position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} color={color} opacity={0.5} />
      </Canvas>
    );
  }

  return (
    <Canvas style={{ width: size, height: size, position: 'absolute' }}>
      <Circle cx={size / 2} cy={size / 2} r={radius} color={color} opacity={opacity} />
    </Canvas>
  );
}
