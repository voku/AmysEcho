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
  errorMessage: string;
}

function toErrorMessage(error: unknown): string {
  const sanitize = (message: string | null | undefined): string => {
    const trimmed = message?.trim();
    if (!trimmed) {
      return 'Unbekannter Fehler';
    }
    if (trimmed.length > 400) {
      return `${trimmed.slice(0, 397)}…`;
    }
    return trimmed;
  };

  if (!error) {
    return 'Unbekannter Fehler';
  }

  if (typeof error === 'string') {
    return sanitize(error);
  }

  if (error instanceof Error) {
    return sanitize(error.message || error.name);
  }

  if (typeof error === 'object') {
    try {
      return sanitize(JSON.stringify(error));
    } catch {
      return sanitize('[Objektfehler ohne Nachricht]');
    }
  }

  return sanitize(String(error));
}

export class ChildErrorBoundary extends Component<Props, State> {
  static override contextType = AccessibilityContext;
  override context!: React.ContextType<typeof AccessibilityContext>;

  override state: State = { hasError: false, errorMessage: 'Unbekannter Fehler' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, errorMessage: toErrorMessage(error) };
  }

  override componentDidCatch(error: unknown) {
    logger.error('Uncaught error:', error);
    enqueueCrashReport(error, { boundary: 'ChildErrorBoundary' });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: 'Unbekannter Fehler' });
  };

  override render() {
    if (this.state.hasError) {
      const { largeText, highContrast } = this.context;
      const fontSize = largeText ? 20 : 16;
      const detailFontSize = largeText ? 18 : 14;
      const backgroundColor = highContrast ? COLORS.highContrastBackground : `${COLORS.warning}B3`;
      const textColor = highContrast ? COLORS.highContrastText : COLORS.text;
      return (
        <View style={[styles.overlay, { backgroundColor }]}>
          <Text testID="error-text" style={[styles.text, { color: textColor, fontSize }]}>Ups, lass es uns noch einmal versuchen!</Text>
          <Text
            testID="error-detail"
            style={[styles.detailText, { color: textColor, fontSize: detailFontSize }]}
            accessibilityLabel={`Fehlerdetails: ${this.state.errorMessage}`}
          >
            {`Fehlermeldung: ${this.state.errorMessage}`}
          </Text>
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
  detailText: {
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
