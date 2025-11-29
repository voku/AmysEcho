/**
 * Error Boundary Component
 * Catches JavaScript errors and displays a fallback UI.
 */

import React, { Component, ReactNode } from 'react';
import { logger } from '../services/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    minHeight: '300px',
    textAlign: 'center' as const,
  },
  icon: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold' as const,
    color: 'var(--color-text, #1a1a1a)',
    marginBottom: '0.5rem',
  },
  message: {
    fontSize: '1rem',
    color: 'var(--color-textSecondary, #666)',
    marginBottom: '1rem',
    maxWidth: '400px',
  },
  details: {
    marginBottom: '1rem',
    textAlign: 'left' as const,
    maxWidth: '100%',
  },
  summary: {
    cursor: 'pointer' as const,
    color: 'var(--color-primary, #4F8EF7)',
  },
  errorText: {
    fontSize: '0.75rem',
    backgroundColor: 'var(--color-surface, #f5f5f5)',
    padding: '0.5rem',
    borderRadius: '4px',
    overflow: 'auto' as const,
    maxWidth: '100%',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  button: {
    backgroundColor: 'var(--color-primary, #4F8EF7)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 'bold' as const,
    cursor: 'pointer' as const,
  },
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error('Error boundary caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={styles.container} role="alert">
          <div style={styles.icon}>😔</div>
          <h2 style={styles.title}>Etwas ist schiefgelaufen</h2>
          <p style={styles.message}>
            Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.
          </p>
          {this.state.error && (
            <details style={styles.details}>
              <summary style={styles.summary}>Technische Details</summary>
              <pre style={styles.errorText}>
                {this.state.error.message}
              </pre>
            </details>
          )}
          <button style={styles.button} onClick={this.handleRetry}>
            Erneut versuchen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
