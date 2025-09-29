import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('../../src/services/contextAwareRecognitionService', () => ({
  contextAwareRecognitionService: {
    setLocation: jest.fn(),
  },
}));

import LocationSelector from '../../src/components/LocationSelector';
import { LocationProvider } from '../../src/context/LocationContext';
import { contextAwareRecognitionService } from '../../src/services/contextAwareRecognitionService';

describe('LocationSelector', () => {
  it('changes location on press', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(LocationProvider, {}, React.createElement(LocationSelector))
      );
    });
    const buttons = component.root.findAllByType('Pressable');
    const schoolButton = buttons[1];
    act(() => {
      schoolButton.props.onPress();
    });
    expect(contextAwareRecognitionService.setLocation).toHaveBeenCalledWith('school');
  });
});
