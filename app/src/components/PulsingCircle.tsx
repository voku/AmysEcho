import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  withTiming,
  withRepeat,
  useAnimatedStyle,
  cancelAnimation,
} from 'react-native-reanimated';

import { usePerformance } from '../context/PerformanceContext';

interface PulsingCircleProps {
  size: number;
  color?: string;
}

export default function PulsingCircle({ size, color = '#ffffff' }: PulsingCircleProps) {
  const { isLowPerformanceMode } = usePerformance();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (isLowPerformanceMode) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
    return () => {
      cancelAnimation(progress);
    };
  }, [isLowPerformanceMode, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: progress.value }],
  }));

  if (isLowPerformanceMode) {
    return (
      <View
        pointerEvents="none"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: 0.5,
          position: 'absolute',
        }}
      />
    );
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          position: 'absolute',
        },
        animatedStyle,
      ]}
    />
  );
}
