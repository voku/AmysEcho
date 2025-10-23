import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AccessibilityContext } from './AccessibilityContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { enqueueCrashReport } from '../services/crashReporting';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
}

type CopyStatus = 'idle' | 'success' | 'error';

interface State {
  hasError: boolean;
  errorMessage: string;
  copyPayload: string | null;
  copyStatus: CopyStatus;
}

const UNKNOWN_ERROR_MESSAGE = 'Unbekannter Fehler';
const MAX_ERROR_LENGTH = 400;

const redact = (input: string): string =>
  input
    // Bearer/API keys / long tokens
    .replace(/(bearer\s+)[a-z0-9._-]+/gi, '$1•••')
    .replace(/\b(?:sk|pk)_[A-Za-z0-9]{16,}\b/g, '•••')
    .replace(/\b[A-F0-9]{32,}\b/gi, '•••')
    // Query params with secrets
    .replace(/([?&](?:token|key|api[_-]?key|auth|code|password)=)[^&\s]+/gi, '$1•••');

const sanitize = (message: string | null | undefined): string => {
  const trimmed = message?.trim();
  if (!trimmed) {
    return UNKNOWN_ERROR_MESSAGE;
  }
  const redacted = redact(trimmed).replace(/\s+/g, ' ');
  if (redacted.length > MAX_ERROR_LENGTH) {
    return `${redacted.slice(0, MAX_ERROR_LENGTH - 3)}…`;
  }
  return redacted;
};

function toErrorMessage(error: unknown): string {

  if (!error) {
    return UNKNOWN_ERROR_MESSAGE;
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

function formatErrorForCopy(error: unknown): string {
  if (!error) {
    return UNKNOWN_ERROR_MESSAGE;
  }

  if (error instanceof Error) {
    const name = redact(error.name || 'Error');
    const message = redact(error.message || '');
    const stack = typeof error.stack === 'string' ? redact(error.stack) : '';
    const parts = [`Name: ${name}`];
    if (message) {
      parts.push(`Nachricht: ${message}`);
    }
    if (stack) {
      parts.push('Stacktrace:', stack);
    }
    return parts.join('\n');
  }

  if (typeof error === 'string') {
    return redact(error);
  }

  if (typeof error === 'object') {
    try {
      return redact(JSON.stringify(error, null, 2));
    } catch {
      return '[Objektfehler ohne Nachricht]';
    }
  }

  return redact(String(error));
}

export class ChildErrorBoundary extends Component<Props, State> {
  static override contextType = AccessibilityContext;
  override context!: React.ContextType<typeof AccessibilityContext>;

  override state: State = {
    hasError: false,
    errorMessage: UNKNOWN_ERROR_MESSAGE,
    copyPayload: null,
    copyStatus: 'idle',
  };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {
      hasError: true,
      errorMessage: toErrorMessage(error),
      copyPayload: null,
      copyStatus: 'idle',
    };
  }

  override componentDidCatch(error: unknown) {
    logger.error('Uncaught error:', error);
    enqueueCrashReport(error, { boundary: 'ChildErrorBoundary' });
    this.setState({ copyPayload: formatErrorForCopy(error) });
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      errorMessage: UNKNOWN_ERROR_MESSAGE,
      copyPayload: null,
      copyStatus: 'idle',
    });
  };

  private handleCopy = async () => {
    const { copyPayload } = this.state;
    if (!copyPayload) {
      this.setState({ copyStatus: 'error' });
      return;
    }

    try {
      await Clipboard.setStringAsync(copyPayload);
      this.setState({ copyStatus: 'success' });
    } catch (err) {
      logger.warn('Failed to copy error details', err as any);
      this.setState({ copyStatus: 'error' });
    }
  };

  override render() {
    if (this.state.hasError) {
      const { largeText, highContrast } = this.context;
      const { copyStatus } = this.state;
      const fontSize = largeText ? 20 : 16;
      const detailFontSize = largeText ? 18 : 14;
      const backgroundColor = highContrast ? COLORS.highContrastBackground : `${COLORS.warning}B3`;
      const textColor = highContrast ? COLORS.highContrastText : COLORS.text;
      const copyStatusColor = copyStatus === 'success'
        ? COLORS.success
        : copyStatus === 'error'
          ? COLORS.error
          : textColor;
      return (
        <View style={[styles.overlay, { backgroundColor }]}>
          <Text testID="error-text" style={[styles.text, { color: textColor, fontSize }]}>Ups, lass es uns noch einmal versuchen!</Text>
          <Text
            testID="error-detail"
            style={[styles.text, { color: textColor, fontSize: detailFontSize }]}
            accessibilityLabel={`Fehlerdetails: ${this.state.errorMessage}`}
          >
            {`Fehlermeldung: ${this.state.errorMessage}`}
          </Text>
          <Pressable
            testID="copy-error-button"
            accessibilityLabel="Fehlerdetails kopieren"
            onPress={this.handleCopy}
            disabled={!this.state.copyPayload}
            style={[
              styles.button,
              styles.copyButton,
              {
                backgroundColor: highContrast ? COLORS.highContrastPressed : COLORS.surface,
                borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
                opacity: !this.state.copyPayload ? 0.5 : 1,
              },
            ]}
          >
            <Text style={[styles.buttonText, { color: highContrast ? COLORS.highContrastText : COLORS.text, fontSize }]}>Fehlerdetails kopieren</Text>
          </Pressable>
          {(() => {
            if (copyStatus === 'idle') {
              return null;
            }

            const message =
              copyStatus === 'success'
                ? 'Fehlerdetails kopiert.'
                : 'Kopieren fehlgeschlagen. Bitte erneut versuchen.';

            return (
              <Text
                testID="copy-status"
                style={[styles.copyStatusText, { color: copyStatusColor, fontSize: detailFontSize }]}
              >
                {message}
              </Text>
            );
          })()}
          <Pressable
            testID="retry-button"
            accessibilityLabel="Nochmal versuchen"
            onPress={this.handleRetry}
            style={[
              styles.button,
              styles.retryButton,
              { backgroundColor: highContrast ? COLORS.highContrastPressed : COLORS.surface },
            ]}
          >
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
    minWidth: 220,
    alignItems: 'center',
  },
  copyButton: {
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  retryButton: {
    marginTop: SPACING.sm,
  },
  buttonText: {
    textAlign: 'center',
  },
  copyStatusText: {
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
});

export default ChildErrorBoundary;
