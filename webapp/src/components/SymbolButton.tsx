/**
 * Symbol Button Component
 * Displays a vocabulary symbol as a tappable button.
 */

import React, { memo, useMemo } from 'react';

export interface Symbol {
  id: string;
  name: string;
  emoji: string;
  category?: string;
  color?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  // People / Pronouns (Yellow)
  person: '#FFF176',
  personen: '#FFF176',
  ich: '#FFF176',
  pronoun: '#FFF176',
  // Actions / Verbs (Green)
  action: '#81C784',
  aktion: '#81C784',
  verb: '#81C784',
  essen: '#81C784',
  trinken: '#81C784',
  spielen: '#81C784',
  // Adjectives / Feelings (Blue)
  feeling: '#64B5F6',
  gefuehle: '#64B5F6',
  adjective: '#64B5F6',
  // Nouns / Things / Objects (Orange)
  object: '#FFB74D',
  dinge: '#FFB74D',
  noun: '#FFB74D',
  // Social / Little Words (White/Grey)
  social: '#E0E0E0',
  interjection: '#E0E0E0',
};

const DEFAULT_COLOR = '#B5B9FF';

function getCategoryColor(category?: string): string {
  if (!category) return DEFAULT_COLOR;
  return CATEGORY_COLORS[category.toLowerCase()] ?? DEFAULT_COLOR;
}

interface SymbolButtonProps {
  symbol: Symbol;
  onPress: (symbol: Symbol) => void;
  largeText?: boolean;
  highContrast?: boolean;
}

function SymbolButtonComponent({ symbol, onPress, largeText = false, highContrast = false }: SymbolButtonProps) {
  const backgroundColor = useMemo(
    () => (highContrast ? '#000' : symbol.color ?? getCategoryColor(symbol.category)),
    [highContrast, symbol.color, symbol.category]
  );

  const buttonStyle: React.CSSProperties = {
    padding: '1rem',
    margin: '0.5rem',
    borderRadius: '12px',
    border: highContrast ? '2px solid #fff' : '1px solid transparent',
    backgroundColor,
    minWidth: '120px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'transform 0.1s, box-shadow 0.1s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  };

  const textStyle: React.CSSProperties = {
    fontSize: largeText ? '1.5rem' : '1.25rem',
    color: highContrast ? '#fff' : '#1a1a1a',
    fontWeight: 500,
  };

  const handleClick = () => {
    // Trigger haptic feedback if available
    if ('vibrate' in navigator) {
      navigator.vibrate(30);
    }
    onPress(symbol);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <button
      style={buttonStyle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={symbol.name}
      data-symbol-id={symbol.id}
      role="button"
      tabIndex={0}
    >
      <span style={textStyle}>
        {symbol.emoji} {symbol.name}
      </span>
    </button>
  );
}

// Custom comparison for memo
function arePropsEqual(prev: SymbolButtonProps, next: SymbolButtonProps): boolean {
  return (
    prev.symbol.id === next.symbol.id &&
    prev.symbol.name === next.symbol.name &&
    prev.symbol.emoji === next.symbol.emoji &&
    prev.symbol.color === next.symbol.color &&
    prev.symbol.category === next.symbol.category &&
    prev.onPress === next.onPress &&
    prev.largeText === next.largeText &&
    prev.highContrast === next.highContrast
  );
}

export const SymbolButton = memo(SymbolButtonComponent, arePropsEqual);
export default SymbolButton;
