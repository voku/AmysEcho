/**
 * Status Capsule Component
 * 
 * A compact status indicator that shows system/feature status
 * with color-coded visual feedback.
 */

import React from 'react';

export type StatusLevel = 'online' | 'offline' | 'warning' | 'error' | 'loading' | 'idle';

export interface StatusCapsuleProps {
  /** Current status level */
  status: StatusLevel;
  /** Label text to display */
  label: string;
  /** Optional icon (emoji or custom) */
  icon?: string;
  /** Additional details shown on hover/tap */
  details?: string;
  /** Compact mode (icon only) */
  compact?: boolean;
  /** Show pulsing animation for active states */
  pulse?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional CSS class */
  className?: string;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
}

const statusStyles: Record<StatusLevel, { bg: string; color: string; border: string; icon: string }> = {
  online: {
    bg: '#dcfce7',
    color: '#166534',
    border: '#22c55e',
    icon: '🟢',
  },
  offline: {
    bg: '#fef2f2',
    color: '#991b1b',
    border: '#ef4444',
    icon: '🔴',
  },
  warning: {
    bg: '#fef9c3',
    color: '#854d0e',
    border: '#eab308',
    icon: '🟡',
  },
  error: {
    bg: '#fee2e2',
    color: '#dc2626',
    border: '#ef4444',
    icon: '⚠️',
  },
  loading: {
    bg: '#e0e7ff',
    color: '#4338ca',
    border: '#6366f1',
    icon: '⏳',
  },
  idle: {
    bg: '#f3f4f6',
    color: '#6b7280',
    border: '#9ca3af',
    icon: '⚪',
  },
};

const sizeStyles = {
  small: {
    padding: '4px 8px',
    fontSize: '12px',
    iconSize: '12px',
    gap: '4px',
  },
  medium: {
    padding: '6px 12px',
    fontSize: '14px',
    iconSize: '14px',
    gap: '6px',
  },
  large: {
    padding: '8px 16px',
    fontSize: '16px',
    iconSize: '18px',
    gap: '8px',
  },
};

export const StatusCapsule: React.FC<StatusCapsuleProps> = ({
  status,
  label,
  icon,
  details,
  compact = false,
  pulse = false,
  onClick,
  className = '',
  size = 'medium',
}) => {
  const style = statusStyles[status];
  const sizeStyle = sizeStyles[size];
  const displayIcon = icon || style.icon;

  const shouldPulse = pulse && (status === 'online' || status === 'loading');

  return (
    <div
      className={`status-capsule status-capsule-${status} ${className}`}
      role="status"
      aria-label={`${label}: ${status}`}
      title={details}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sizeStyle.gap,
        padding: sizeStyle.padding,
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        borderRadius: '9999px',
        fontSize: sizeStyle.fontSize,
        fontWeight: 500,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        userSelect: 'none',
      }}
    >
      {/* Status Icon */}
      <span
        className="status-icon"
        style={{
          fontSize: sizeStyle.iconSize,
          display: 'flex',
          alignItems: 'center',
          ...(shouldPulse && {
            animation: 'statusPulse 1.5s ease-in-out infinite',
          }),
        }}
      >
        {status === 'loading' ? (
          <span style={{ animation: 'statusSpin 1s linear infinite', display: 'inline-block' }}>
            {displayIcon}
          </span>
        ) : (
          displayIcon
        )}
      </span>

      {/* Label */}
      {!compact && (
        <span className="status-label">
          {label}
        </span>
      )}

      <style>{`
        @keyframes statusPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes statusSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .status-capsule:hover {
          transform: scale(1.02);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </div>
  );
};

/**
 * Connection Status Capsule
 * Specialized for showing server/API connection status
 */
export interface ConnectionStatusProps {
  isConnected: boolean;
  isChecking?: boolean;
  serverName?: string;
  lastChecked?: Date;
  onClick?: () => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  isChecking = false,
  serverName = 'Server',
  lastChecked,
  onClick,
}) => {
  const status: StatusLevel = isChecking ? 'loading' : isConnected ? 'online' : 'offline';
  const label = isChecking 
    ? 'Verbinde...' 
    : isConnected 
      ? `${serverName} verbunden`
      : `${serverName} nicht erreichbar`;

  const details = lastChecked 
    ? `Zuletzt geprüft: ${lastChecked.toLocaleTimeString('de-DE')}`
    : undefined;

  return (
    <StatusCapsule
      status={status}
      label={label}
      details={details}
      pulse={isConnected}
      onClick={onClick}
    />
  );
};

/**
 * Feature Status Capsule
 * Shows availability of a specific feature
 */
export interface FeatureStatusProps {
  featureName: string;
  isAvailable: boolean;
  isLoading?: boolean;
  reason?: string;
  onClick?: () => void;
}

export const FeatureStatus: React.FC<FeatureStatusProps> = ({
  featureName,
  isAvailable,
  isLoading = false,
  reason,
  onClick,
}) => {
  const status: StatusLevel = isLoading ? 'loading' : isAvailable ? 'online' : 'warning';
  const icon = isLoading ? '⏳' : isAvailable ? '✓' : '⚠️';

  return (
    <StatusCapsule
      status={status}
      label={featureName}
      icon={icon}
      details={reason}
      onClick={onClick}
      size="small"
    />
  );
};

export default StatusCapsule;
