/**
 * Celebration Component
 * Displays a celebration overlay for successful gestures.
 */

import React, { useEffect, useState } from 'react';

export const CELEBRATION_DURATION_MS = 1200;

interface CelebrationProps {
  message?: string;
  onComplete?: () => void;
}

const CELEBRATION_MESSAGES = [
  'Super gemacht! 🎉',
  'Toll! Weiter so! ⭐',
  'Fantastisch! 🌟',
  'Du bist großartig! 💪',
  'Perfekt! 👏',
];

export default function Celebration({ message, onComplete }: CelebrationProps) {
  const [opacity, setOpacity] = useState(0);
  const [celebrationMessage] = useState(
    message ?? CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)]
  );

  useEffect(() => {
    // Fade in
    const fadeInTimer = setTimeout(() => setOpacity(1), 50);
    
    // Hold
    const holdTimer = setTimeout(() => setOpacity(0), 900);
    
    // Complete
    const completeTimer = setTimeout(() => {
      onComplete?.();
    }, CELEBRATION_DURATION_MS);

    return () => {
      clearTimeout(fadeInTimer);
      clearTimeout(holdTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    opacity,
    transition: 'opacity 0.2s ease-in-out',
    zIndex: 9999,
    pointerEvents: 'none',
  };

  const emojiStyle: React.CSSProperties = {
    fontSize: '3rem',
    marginBottom: '1rem',
  };

  const messageStyle: React.CSSProperties = {
    color: '#FFFFFF',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    textAlign: 'center',
    padding: '0 1rem',
  };

  return (
    <div style={overlayStyle} role="alert" aria-live="assertive">
      <span style={emojiStyle} aria-hidden="true">🎉</span>
      <span style={messageStyle}>{celebrationMessage}</span>
    </div>
  );
}
