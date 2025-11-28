/**
 * Loading Indicator Component
 * Displays a loading spinner with optional label.
 */

import React from 'react';

interface LoadingIndicatorProps {
  label?: string;
  fullscreen?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function LoadingIndicator({
  label = 'Wird geladen...',
  fullscreen = true,
  size = 'large',
}: LoadingIndicatorProps) {
  const spinnerSize = size === 'small' ? 24 : size === 'medium' ? 40 : 56;
  const fontSize = size === 'small' ? '0.875rem' : size === 'medium' ? '1rem' : '1.125rem';

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '1rem',
    gap: '1rem',
    ...(fullscreen && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      zIndex: 1000,
    }),
  };

  const spinnerStyle: React.CSSProperties = {
    width: spinnerSize,
    height: spinnerSize,
    border: `3px solid var(--color-border, #e5e5e5)`,
    borderTopColor: `var(--color-primary, #4F8EF7)`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  };

  return (
    <div style={containerStyle} role="status" aria-live="polite">
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={spinnerStyle} aria-hidden="true" />
      <span style={{ fontSize, color: 'var(--color-text, #1a1a1a)' }}>
        {label}
      </span>
    </div>
  );
}
