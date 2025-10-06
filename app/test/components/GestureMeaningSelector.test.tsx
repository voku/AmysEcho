import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import GestureMeaningSelector from '../../src/components/GestureMeaningSelector';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

describe('GestureMeaningSelector', () => {
  it('triggers selection for the chosen meaning', () => {
    const handleSelect = jest.fn();
    const handleCancel = jest.fn();

    const { getByLabelText } = render(
      <GestureMeaningSelector
        onMeaningSelected={handleSelect}
        onCancel={handleCancel}
      />
    );

    fireEvent.press(getByLabelText('Hallo auswählen'));

    expect(handleSelect).toHaveBeenCalled();
    expect(handleSelect.mock.calls[0][0].id).toBe('hallo-eine-hand');
  });

  it('filters meanings by composition', () => {
    const { getByText, queryByText } = render(
      <GestureMeaningSelector
        onMeaningSelected={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    fireEvent.press(getByText('Sequenz'));

    expect(queryByText('Hallo')).toBeNull();
    expect(getByText('Ich hab dich lieb')).toBeTruthy();
  });
});
