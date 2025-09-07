import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { COLORS } from '../constants/ui';

export type MoodType = 'calm' | 'energetic' | 'neutral';

interface MoodColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
}

interface MoodContextType {
  currentMood: MoodType;
  setMood: (mood: MoodType) => void;
  moodColors: MoodColors;
  getMoodEmoji: () => string;
  getMoodDescription: () => string;
}

const MoodContext = createContext<MoodContextType | undefined>(undefined);

// Mood-based color schemes
const moodColorSchemes: Record<MoodType, MoodColors> = {
  calm: {
    primary: '#4A90E2', // Soft blue
    secondary: '#7B92B2', // Muted blue-gray
    accent: '#A8DADC', // Light blue-green
    background: '#F8FAFC', // Very light blue-gray
    surface: '#FFFFFF', // White
    text: '#2D3748', // Dark blue-gray
    textMuted: '#718096', // Medium blue-gray
    border: '#E2E8F0', // Light blue-gray
  },
  energetic: {
    primary: '#FF6B6B', // Bright coral
    secondary: '#FFA07A', // Light salmon
    accent: '#FFD93D', // Bright yellow
    background: '#FFF8F0', // Very light orange
    surface: '#FFFFFF', // White
    text: '#2D3436', // Dark gray
    textMuted: '#636E72', // Medium gray
    border: '#FFEAA7', // Light yellow
  },
  neutral: {
    primary: COLORS.primaryAccent,
    secondary: COLORS.secondaryAccent,
    accent: '#9C88FF', // Light purple
    background: COLORS.backgroundStart,
    surface: COLORS.surface,
    text: COLORS.text,
    textMuted: COLORS.textMuted,
    border: COLORS.border,
  },
};

interface MoodProviderProps {
  children: ReactNode;
}

export function MoodProvider({ children }: MoodProviderProps) {
  const [currentMood, setCurrentMood] = useState<MoodType>('neutral');

  // Auto-detect mood based on time of day (simplified)
  useEffect(() => {
    const hour = new Date().getUTCHours();

    // Morning: calm
    if (hour >= 6 && hour < 12) {
      setCurrentMood('calm');
    }
    // Afternoon/Evening: energetic
    else if (hour >= 12 && hour < 18) {
      setCurrentMood('energetic');
    }
    // Night: calm
    else {
      setCurrentMood('calm');
    }
  }, []);

  const setMood = (mood: MoodType) => {
    setCurrentMood(mood);
  };

  const moodColors = moodColorSchemes[currentMood];

  const getMoodEmoji = (): string => {
    switch (currentMood) {
      case 'calm':
        return '😌';
      case 'energetic':
        return '⚡';
      case 'neutral':
        return '😐';
      default:
        return '😐';
    }
  };

  const getMoodDescription = (): string => {
    switch (currentMood) {
      case 'calm':
        return 'Ruhiger Modus';
      case 'energetic':
        return 'Energiegeladener Modus';
      case 'neutral':
        return 'Normaler Modus';
      default:
        return 'Normaler Modus';
    }
  };

  const value: MoodContextType = {
    currentMood,
    setMood,
    moodColors,
    getMoodEmoji,
    getMoodDescription,
  };

  return (
    <MoodContext.Provider value={value}>
      {children}
    </MoodContext.Provider>
  );
}

export function useMood(): MoodContextType {
  const context = useContext(MoodContext);
  if (context === undefined) {
    throw new Error('useMood must be used within a MoodProvider');
  }
  return context;
}

// Hook for components to get mood-adjusted colors
export function useMoodColors(): MoodColors {
  const { moodColors } = useMood();
  return moodColors;
}