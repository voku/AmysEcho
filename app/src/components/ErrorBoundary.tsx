import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { AccessibilityContext, AccessibilityContextType } from './AccessibilityContext';
import { SPACING, COLORS, RADIUS } from '../constants/ui';
import { logger } from '../utils/logger';

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  static contextType = AccessibilityContext;
  declare context: AccessibilityContextType;

  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    logger.error('Uncaught app error:', error, info);
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      const { largeText, highContrast } = this.context;
      return (
        <View
          style={[
            styles.container,
            highContrast && { backgroundColor: COLORS.highContrastBackground },
          ]}
        >
          <Text
            accessibilityRole="alert"
            style={[
              styles.text,
              {
                fontSize: largeText ? 22 : 18,
                color: highContrast ? COLORS.highContrastText : COLORS.text,
              },
            ]}
          >
            Oops! Something went wrong.
          </Text>
          <Pressable
            onPress={this.reset}
            accessibilityRole="button"
            style={[
              styles.button,
              {
                backgroundColor: highContrast
                  ? COLORS.highContrastText
                  : COLORS.primaryAccent,
              },
            ]}
          >
            <Text
              style={[
                styles.buttonText,
                {
                  fontSize: largeText ? 20 : 16,
                  color: highContrast
                    ? COLORS.highContrastBackground
                    : COLORS.highContrastText,
                },
              ]}
            >
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  text: {
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  button: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS,
  },
  buttonText: {
    fontWeight: 'bold',
  },
});

