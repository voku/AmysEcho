import React from 'react';
import { render } from '@testing-library/react-native';

import ProfileAnalytics from '../../src/components/ProfileAnalytics';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false, update: jest.fn() }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

describe('ProfileAnalytics', () => {
  const baseStats = {
    totalGestures: 7,
    uniqueGestures: 3,
    averageConfidence: 0.82,
    mostUsedGesture: {
      id: 'hallo',
      label: 'Hallo',
      count: 5,
    },
    recentActivity: {
      today: 2,
      thisWeek: 6,
      thisMonth: 12,
    },
  } as const;

  it('renders concrete analytics values without undefined placeholders', () => {
    const { getByText, queryByText } = render(
      <ProfileAnalytics stats={baseStats} onClose={jest.fn()} onViewDetails={jest.fn()} />,
    );

    expect(getByText('Gesamt-Gesten')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    expect(getByText('Einzigartige Gesten')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('Durchschn. Sicherheit')).toBeTruthy();
    expect(getByText('82%')).toBeTruthy();
    expect(getByText('Am häufigsten verwendet:')).toBeTruthy();
    expect(getByText('Hallo')).toBeTruthy();
    expect(getByText('5 mal verwendet')).toBeTruthy();
    expect(getByText('Heute')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    expect(getByText('Diese Woche')).toBeTruthy();
    expect(getByText('6')).toBeTruthy();
    expect(getByText('Dieser Monat')).toBeTruthy();
    expect(getByText('12')).toBeTruthy();
    expect(queryByText(/undefined/i)).toBeNull();
  });
});
