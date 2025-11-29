/**
 * Visual Feedback Component
 * 
 * Provides visual feedback overlays for gesture recognition results.
 * Shows success/failure states with animations and colors.
 */

import React, { useEffect, useState } from 'react';

export type FeedbackType = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface VisualFeedbackProps {
  /** Type of feedback to display */
  type: FeedbackType;
  /** Whether the feedback is active/visible */
  active: boolean;
  /** Message to display */
  message?: string;
  /** Sub-message or additional info */
  subMessage?: string;
  /** Icon to display (emoji or custom) */
  icon?: string;
  /** Duration to show (ms), 0 for indefinite */
  duration?: number;
  /** Callback when feedback hides */
  onHide?: () => void;
  /** Overlay opacity (0-1) */
  opacity?: number;
  /** Position of feedback */
  position?: 'top' | 'center' | 'bottom';
  /** Animation style */
  animation?: 'pulse' | 'bounce' | 'fade' | 'shake' | 'none';
  /** Show confidence indicator */
  confidence?: number;
  /** Accessible label */
  ariaLabel?: string;
}

const feedbackStyles: Record<FeedbackType, { bg: string; border: string; text: string; iconDefault: string }> = {
  success: {
    bg: 'rgba(34, 197, 94, 0.15)',
    border: '#22c55e',
    text: '#15803d',
    iconDefault: '✓',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.15)',
    border: '#f59e0b',
    text: '#b45309',
    iconDefault: '⚠️',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.15)',
    border: '#ef4444',
    text: '#dc2626',
    iconDefault: '✗',
  },
  info: {
    bg: 'rgba(59, 130, 246, 0.15)',
    border: '#3b82f6',
    text: '#2563eb',
    iconDefault: 'ℹ️',
  },
  neutral: {
    bg: 'rgba(107, 70, 193, 0.15)',
    border: '#6b46c1',
    text: '#5b21b6',
    iconDefault: '👆',
  },
};

export const VisualFeedback: React.FC<VisualFeedbackProps> = ({
  type,
  active,
  message,
  subMessage,
  icon,
  duration = 2000,
  onHide,
  opacity = 1,
  position = 'center',
  animation = 'pulse',
  confidence,
  ariaLabel,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (active) {
      setIsVisible(true);
      setIsAnimating(true);

      if (duration > 0) {
        const timer = setTimeout(() => {
          setIsAnimating(false);
          setTimeout(() => {
            setIsVisible(false);
            onHide?.();
          }, 300); // Fade out duration
        }, duration);
        return () => clearTimeout(timer);
      }
      return; // Explicit return for duration === 0
    } else {
      setIsAnimating(false);
      setTimeout(() => setIsVisible(false), 300);
      return;
    }
  }, [active, duration, onHide]);

  if (!isVisible) return null;

  const style = feedbackStyles[type];
  const displayIcon = icon || style.iconDefault;

  const positionStyles: Record<string, React.CSSProperties> = {
    top: { top: '20px', left: '50%', transform: 'translateX(-50%)' },
    center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
    bottom: { bottom: '20px', left: '50%', transform: 'translateX(-50%)' },
  };

  return (
    <>
      <div
        className="visual-feedback-overlay"
        role="status"
        aria-live="polite"
        aria-label={ariaLabel || message || `${type} feedback`}
        style={{
          position: 'fixed',
          ...positionStyles[position],
          zIndex: 1000,
          opacity: isAnimating ? opacity : 0,
          transition: 'opacity 0.3s ease-in-out',
          pointerEvents: 'none',
        }}
      >
        <div
          className="visual-feedback-content"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '20px 30px',
            backgroundColor: style.bg,
            border: `3px solid ${style.border}`,
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            backdropFilter: 'blur(10px)',
            minWidth: '150px',
            maxWidth: '300px',
          }}
        >
          {/* Icon */}
          <div
            className="feedback-icon"
            style={{
              fontSize: '48px',
              marginBottom: message ? '12px' : 0,
              ...(animation !== 'none' && isAnimating && {
                animation: animation === 'pulse' 
                  ? 'visualFeedbackPulse 0.6s ease-in-out infinite' 
                  : undefined,
              }),
            }}
          >
            {displayIcon}
          </div>

          {/* Message */}
          {message && (
            <p
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 600,
                color: style.text,
                textAlign: 'center',
              }}
            >
              {message}
            </p>
          )}

          {/* Sub-message */}
          {subMessage && (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: '14px',
                color: '#666',
                textAlign: 'center',
              }}
            >
              {subMessage}
            </p>
          )}

          {/* Confidence Bar */}
          {confidence !== undefined && (
            <div
              style={{
                width: '100%',
                marginTop: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#666',
                  marginBottom: '4px',
                }}
              >
                <span>Konfidenz</span>
                <span>{Math.round(confidence * 100)}%</span>
              </div>
              <div
                style={{
                  height: '8px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${confidence * 100}%`,
                    backgroundColor: style.border,
                    borderRadius: '4px',
                    transition: 'width 0.3s ease-out',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes visualFeedbackPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes visualFeedbackBounce {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-10px); }
          50% { transform: translateY(0); }
          75% { transform: translateY(-5px); }
        }
        @keyframes visualFeedbackShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
        @keyframes visualFeedbackFade {
          0% { opacity: 0; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
};

/**
 * Quick helper to show gesture recognition feedback
 */
export interface GestureRecognitionFeedbackProps {
  gesture: string | null;
  confidence: number;
  isActive: boolean;
  onHide?: () => void;
}

export const GestureRecognitionFeedback: React.FC<GestureRecognitionFeedbackProps> = ({
  gesture,
  confidence,
  isActive,
  onHide,
}) => {
  const type: FeedbackType = confidence >= 0.8 ? 'success' : confidence >= 0.6 ? 'warning' : 'neutral';
  
  return (
    <VisualFeedback
      type={type}
      active={isActive && gesture !== null}
      confidence={confidence}
      animation="pulse"
      duration={2000}
      {...(gesture !== null && { message: gesture })}
      {...(onHide !== undefined && { onHide })}
    />
  );
};

export default VisualFeedback;
