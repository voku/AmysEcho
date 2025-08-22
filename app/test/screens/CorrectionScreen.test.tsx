import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (p: any) => React.createElement('View', p, p.children),
    Text: (p: any) => React.createElement('Text', p, p.children),
    Pressable: (p: any) => React.createElement('Pressable', p, p.children),
    SafeAreaView: (p: any) => React.createElement('SafeAreaView', p, p.children),
    StyleSheet: { create: (s: any) => s },
  } as any;
});

jest.mock('../../src/storage', () => ({ logCorrection: jest.fn() }));
import { logCorrection } from '../../src/storage';

jest.mock('../../src/services/correctionService', () => ({ correctionService: { logCorrection: jest.fn() } }));
import { correctionService } from '../../src/services/correctionService';

import CorrectionScreen from '../../src/screens/CorrectionScreen';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));
jest.mock('../../src/components/PulsingCircle', () => () => null);

describe('CorrectionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submit logs correction and goes back', async () => {
    const goBack = jest.fn();
    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<CorrectionScreen navigation={{ goBack }} />);
    });
    await act(async () => {
      component.root.findByProps({ testID: 'btn-submit-correction' }).props.onPress();
    });
    expect(correctionService.logCorrection).toHaveBeenCalledWith('correction');
    expect(logCorrection).toHaveBeenCalledWith('correction');
    expect(goBack).toHaveBeenCalled();
  });

  it('cancel goes back without logging', async () => {
    const goBack = jest.fn();
    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<CorrectionScreen navigation={{ goBack }} />);
    });
    act(() => {
      component.root.findByProps({ testID: 'btn-cancel-correction' }).props.onPress();
    });
    expect(goBack).toHaveBeenCalled();
    expect(correctionService.logCorrection).not.toHaveBeenCalled();
    expect(logCorrection).not.toHaveBeenCalled();
  });
});
