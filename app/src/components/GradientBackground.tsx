import React from 'react';
import {
  View,
  StyleSheet,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';

export interface GradientBackgroundProps extends ViewProps {
  colors: readonly [string, string];
}

export default function GradientBackground({
  colors,
  style,
  children,
  ...rest
}: GradientBackgroundProps) {
  const rawId = React.useId();
  const gradientId = React.useMemo(
    () => `gradient-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [rawId],
  );
  const containerStyle = React.useMemo<StyleProp<ViewStyle>>(
    () => [styles.container, style],
    [style],
  );

  return (
    <View style={containerStyle} {...rest}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors[0]} stopOpacity={1} />
            <Stop offset="100%" stopColor={colors[1]} stopOpacity={1} />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
