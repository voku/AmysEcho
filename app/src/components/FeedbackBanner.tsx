import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';

type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

type FeedbackBannerProps = {
  visible: boolean;
  message: string;
  tone?: FeedbackTone;
  testID?: string;
};

const FADE_DURATION_MS = 250;

const toneStyles: Record<FeedbackTone, { background: string; text: string }> = {
  info: { background: Colors.primary, text: Colors.inverseText },
  success: { background: Colors.success, text: Colors.inverseText },
  warning: { background: Colors.warning, text: Colors.text },
  error: { background: Colors.error, text: Colors.inverseText },
};

const FeedbackBanner: React.FC<FeedbackBannerProps> = ({
  visible,
  message,
  tone = 'info',
  testID,
}) => {
  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: FADE_DURATION_MS,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, visible]);

  const currentTone = useMemo(() => toneStyles[tone], [tone]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          backgroundColor: currentTone.background,
        },
      ]}
      testID={testID}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.textWrapper}>
        <Text style={[styles.text, { color: currentTone.text }]}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
    justifyContent: 'center',
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  textWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.semibold as any,
    textAlign: 'center',
  },
});

export default FeedbackBanner;
