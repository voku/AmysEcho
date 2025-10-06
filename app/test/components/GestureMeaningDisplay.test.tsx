import React from 'react';
import { render } from '@testing-library/react-native';
import GestureMeaningDisplay from '../../src/components/GestureMeaningDisplay';
import { optimizedGestureService } from '../../src/services/optimizedGestureService';
import type { GestureModelEntry } from '../../src/model';
import { AccessibilityContext } from '../../src/components/AccessibilityContext';

const renderWithAccessibility = (ui: React.ReactElement) =>
  render(
    <AccessibilityContext.Provider
      value={{ largeText: false, highContrast: false, update: jest.fn() }}
    >
      {ui}
    </AccessibilityContext.Provider>,
  );

describe('GestureMeaningDisplay', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prioritises OpenAI metadata when selecting die kombinierte Darstellung', () => {
    const createGesture = (id: string, emoji: string): GestureModelEntry => ({
      id,
      label: `${emoji} ${id}`,
      emoji,
    });

    const getGestureByIdSpy = jest
      .spyOn(optimizedGestureService, 'getGestureById')
      .mockImplementation((gestureId: string) => {
        switch (gestureId) {
          case 'openai-gesture':
            return createGesture('openai-gesture', '✨');
          case 'help':
            return createGesture('help', '🆘');
          default:
            return null;
        }
      });

    const { getByText } = renderWithAccessibility(
      <GestureMeaningDisplay
        gestureId="help+help"
        confidence={0.82}
        openaiValidationResult={{
          gesture: 'openai-gesture',
          confidence: 0.9,
          feedback: 'Sehr klar ausgeführt',
          quality_score: 8,
          validation_source: 'openai',
        }}
      />,
    );

    expect(getByText('✨')).toBeTruthy();
    expect(getGestureByIdSpy).toHaveBeenCalledWith('openai-gesture');
  });

  it('shows single-hand metadata when available', () => {
    const gestureMeta: GestureModelEntry = {
      id: 'hello',
      label: '👋 Hallo',
      emoji: '👋',
      category: 'greeting',
      dgsVideoUri: 'hello.mp4',
    };

    jest
      .spyOn(optimizedGestureService, 'getGestureById')
      .mockImplementation((gestureId: string) => (gestureId === 'hello' ? gestureMeta : null));

    const { getByText } = renderWithAccessibility(
      <GestureMeaningDisplay
        gestureId="hello"
        confidence={0.94}
        gestureMeta={gestureMeta}
      />,
    );

    expect(getByText('👋')).toBeTruthy();
    expect(getByText('👋 Hallo')).toBeTruthy();
    expect(getByText('COMMUNICATION')).toBeTruthy();
    expect(getByText('DGS-Video verfügbar')).toBeTruthy();
  });

  it('zeigt die Gestenfolge inklusive Schritte', () => {
    const ich: GestureModelEntry = { id: 'ich', label: '👉 Ich', emoji: '👉' };
    const liebe: GestureModelEntry = { id: 'liebe', label: '❤️ Liebe', emoji: '❤️' };
    const dich: GestureModelEntry = { id: 'dich', label: '🫵 Dich', emoji: '🫵' };

    jest.spyOn(optimizedGestureService, 'getGestureById').mockImplementation((gestureId: string) => {
      switch (gestureId) {
        case 'ich':
          return ich;
        case 'liebe':
          return liebe;
        case 'dich':
          return dich;
        default:
          return null;
      }
    });

    const { getByText } = renderWithAccessibility(
      <GestureMeaningDisplay
        gestureId="ich-hab-dich-lieb"
        confidence={0.91}
        sequenceGestures={['ich', 'liebe', 'dich']}
      />,
    );

    expect(getByText('Gestenfolge erkannt')).toBeTruthy();
    expect(getByText('Ich hab dich lieb')).toBeTruthy();
    expect(getByText(/👉 Ich/)).toBeTruthy();
    expect(getByText(/❤️ Liebe/)).toBeTruthy();
    expect(getByText(/🫵 Dich/)).toBeTruthy();
  });
});
