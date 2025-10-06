import React from 'react';
import { render } from '@testing-library/react-native';
import TwoHandGestureDisplay from '../../src/components/TwoHandGestureDisplay';
import { optimizedGestureService } from '../../src/services/optimizedGestureService';
import type { GestureModelEntry } from '../../src/model';
import { AccessibilityContext } from '../../src/components/AccessibilityContext';

describe('TwoHandGestureDisplay', () => {
  it('prioritises OpenAI metadata when selecting the combined emoji', () => {
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
          case 'ILoveYou':
            return createGesture('ILoveYou', '🤟');
          case 'Thumb_Up':
            return createGesture('Thumb_Up', '👍');
          default:
            return null;
        }
      });

    const { getByText } = render(
      <AccessibilityContext.Provider
        value={{ largeText: false, highContrast: false, update: jest.fn() }}
      >
        <TwoHandGestureDisplay
          gestureString="ILoveYou+Thumb_Up"
          confidence={0.82}
          openaiValidationResult={{
            gesture: 'openai-gesture',
            confidence: 0.9,
            feedback: 'Sehr klar ausgeführt',
            quality_score: 8,
            validation_source: 'openai',
          }}
        />
      </AccessibilityContext.Provider>,
    );

    expect(getByText('✨')).toBeTruthy();
    expect(getGestureByIdSpy).toHaveBeenCalledWith('openai-gesture');

    getGestureByIdSpy.mockRestore();
  });
});
