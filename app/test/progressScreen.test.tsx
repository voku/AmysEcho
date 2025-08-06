import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    Button: (props: any) => React.createElement('Button', props, props.children),
    FlatList: ({ data, renderItem, ListEmptyComponent }: any) =>
      React.createElement(
        'FlatList',
        null,
        data && data.length
          ? data.map((item: any, index: number) => renderItem({ item, index }))
          : ListEmptyComponent || null,
      ),
    StyleSheet: { create: () => ({}) },
  };
});

jest.mock('../src/services/usageTracker', () => ({
  loadUsageStats: jest.fn(() => Promise.resolve({ hello: 3 })),
}));

jest.mock('../src/storage', () => ({
  loadProfile: jest.fn(() =>
    Promise.resolve({
      id: 'p1',
      name: 'Test',
      consentDataUpload: true,
      consentHelpMeGetSmarter: true,
      vocabularySetId: 'basic',
    }),
  ),
}));

jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

import ProgressScreen from '../src/screens/ProgressScreen';

describe('ProgressScreen', () => {
  it('renders usage statistics', async () => {
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<ProgressScreen navigation={{ goBack: jest.fn() }} />);
    });
    const textNodes = (component as renderer.ReactTestRenderer).root.findAll((node) => node.type === 'Text');
    const contents = textNodes.map((n) => n.props.children);
    expect(contents).toContain('👋 Hallo');
    expect(contents).toContain(3);
  });
});

