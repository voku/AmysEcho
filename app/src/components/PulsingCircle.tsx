import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { usePerformance } from '../context/PerformanceContext';

interface PulsingCircleProps {
  size: number;
  color?: string;
}

export default function PulsingCircle({ size, color = '#ffffff' }: PulsingCircleProps) {
  const { isLowPerformanceMode } = usePerformance();
  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  const startAnimation = useCallback(() => {
    animationRef.current?.stop();
    progress.setValue(0);
    animationRef.current = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      { resetBeforeIteration: true },
    );
    animationRef.current.start();
  }, [progress]);

  useEffect(() => {
    if (isLowPerformanceMode) {
      animationRef.current?.stop();
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }
    startAnimation();
    return () => {
      animationRef.current?.stop();
    };
  }, [isLowPerformanceMode, progress, startAnimation]);

  const animatedStyle = {
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
    transform: [{ scale: progress }],
  } as const;

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
