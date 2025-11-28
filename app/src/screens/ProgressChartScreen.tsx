import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Svg, G, Line, Text as SvgText } from 'react-native-svg';
import { loadHistoricalHealthData, HistoricalHealthEntry } from '../services/healthScore';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';
import ScreenBackground from '../components/ScreenBackground';

export default function ProgressChartScreen({ route }: any) {
  const { gestureId } = route.params;
  const { largeText, highContrast } = useAccessibility();
  const [data, setData] = useState<HistoricalHealthEntry[]>([]);

  useEffect(() => {
    loadHistoricalHealthData(gestureId).then(setData);
  }, [gestureId]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: SPACING.lg,
      backgroundColor: 'transparent',
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
  });

  const width = 300;
  const height = 200;
  const padding = 20;

  const xScale = (index: number) => (width - 2 * padding) / (data.length - 1) * index + padding;
  const yScale = (value: number) => height - padding - (height - 2 * padding) * value;

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.title}>Fortschritt für {gestureId}</Text>
      <Svg height={height} width={width}>
        <G y={height}>
          {/* X-Axis */}
          <Line
            x1={padding}
            y1={-padding}
            x2={width - padding}
            y2={-padding}
            stroke={highContrast ? COLORS.highContrastText : COLORS.text}
          />
          {/* Y-Axis */}
          <Line
            x1={padding}
            y1={-padding}
            x2={padding}
            y2={-height + padding}
            stroke={highContrast ? COLORS.highContrastText : COLORS.text}
          />

          {data.map((d, i) => (
            <SvgText
              key={`label-${i}`}
              fill={highContrast ? COLORS.highContrastText : COLORS.text}
              stroke="none"
              fontSize="10"
              x={xScale(i)}
              y={-5}
              textAnchor="middle"
            >
              {new Date(d.date).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' })}
            </SvgText>
          ))}

          {data.length > 1 && (
            <G>
              {
                data.map((d, i) => {
                  if (i === 0) return null;
                  const p1 = data[i - 1];
                  if (!p1) {
                    return null;
                  }
                  const p2 = d;
                  return (
                    <Line
                      key={`line-${i}`}
                      x1={xScale(i - 1)}
                      y1={-yScale(p1.successRate)}
                      x2={xScale(i)}
                      y2={-yScale(p2.successRate)}
                      stroke={COLORS.primaryAccent}
                      strokeWidth="2"
                    />
                  );
                })
              }
            </G>
          )}
        </G>
      </Svg>
    </ScreenBackground>
  );
}
