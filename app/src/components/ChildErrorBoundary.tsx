import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { AccessibilityContext } from './AccessibilityContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { enqueueCrashReport } from '../services/crashReporting';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ChildErrorBoundary extends Component<Props, State> {
  static override contextType = AccessibilityContext;
  override context!: React.ContextType<typeof AccessibilityContext>;

  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    logger.error('Uncaught error:', error);
    enqueueCrashReport(error, { boundary: 'ChildErrorBoundary' });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  override render() {
    if (this.state.hasError) {
      const { largeText, highContrast } = this.context;
      const fontSize = largeText ? 20 : 16;
      const backgroundColor = highContrast ? COLORS.highContrastBackground : `${COLORS.warning}B3`;
      const textColor = highContrast ? COLORS.highContrastText : COLORS.text;
      return (
        <View style={[styles.overlay, { backgroundColor }]}> 
          <Text testID="error-text" style={[styles.text, { color: textColor, fontSize }]}>Ups, lass es uns noch einmal versuchen!</Text>
          <Pressable testID="retry-button" accessibilityLabel="Nochmal versuchen" onPress={this.handleRetry} style={[styles.button, { backgroundColor: highContrast ? COLORS.highContrastPressed : COLORS.surface }]}>
            <Text style={[styles.buttonText, { color: highContrast ? COLORS.highContrastText : COLORS.text, fontSize }]}>Nochmal versuchen</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children as React.ReactNode;
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  text: {
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: DEFAULT_RADIUS,
  },
  buttonText: {
    textAlign: 'center',
  },
});

export default ChildErrorBoundary;
