import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNavigate = jest.fn();

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const React = require('react');

  const FlatListMock = ({
    data = [],
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    ListFooterComponent,
  }: any) => (
    <>
      {ListHeaderComponent
        ? typeof ListHeaderComponent === 'function'
          ? ListHeaderComponent()
          : ListHeaderComponent
        : null}
      {Array.isArray(data) && data.length > 0
        ? data.map((item, index) => renderItem?.({ item, index }))
        : ListEmptyComponent
          ? typeof ListEmptyComponent === 'function'
            ? ListEmptyComponent({})
            : ListEmptyComponent
          : null}
      {ListFooterComponent
        ? typeof ListFooterComponent === 'function'
          ? ListFooterComponent({})
          : ListFooterComponent
        : null}
    </>
  );

  return {
    ...actual,
    FlatList: FlatListMock,
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => <>{children}</>,
}));

jest.mock('../../src/components/WorkflowStageHeader', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function MockWorkflowStageHeader({ route }: { route: string }) {
    return <Text>{route}</Text>;
  };
});

jest.mock('../../src/components/WorkflowSupportLinks', () => () => null);

jest.mock('../../src/services/gestureHistoryService', () => {
  const service = {
    getRecentHistory: jest.fn(),
  };
  return {
    gestureHistoryService: service,
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (_callback: any) => {},
}));

const { gestureHistoryService } = require('../../src/services/gestureHistoryService') as {
  gestureHistoryService: { getRecentHistory: jest.Mock };
};
const mockGetRecentHistory = gestureHistoryService.getRecentHistory as jest.Mock;

import HistoryScreen from '../../src/screens/HistoryScreen';

const baseEntry = {
  id: 'hallo',
  label: 'Hallo',
  confidence: 0.92,
  timestamp: 1716403200000,
  emoji: '👋',
  category: 'Begrüßung',
};

describe('HistoryScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGetRecentHistory.mockReset();
  });

  it('shows the self-discovery highlight when a confident entry exists', async () => {
    mockGetRecentHistory.mockReturnValue([baseEntry]);

    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<HistoryScreen />);
    });
    await act(async () => {});

    expect(mockGetRecentHistory).toHaveBeenCalled();

    const badges = component.root.findAll(
      (node) =>
        node.type === 'Text' &&
        typeof node.props.children === 'string' &&
        node.props.children.includes('Selbstentdeckung gesichert'),
    );
    expect(badges.length).toBeGreaterThan(0);

    const labels = component.root
      .findAll((node) => node.type === 'Text' && typeof node.props.children === 'string')
      .map((node) => node.props.children);
    expect(labels).toEqual(expect.arrayContaining(['Hallo']));

    const subtitleMatches = component.root.findAll(
      (node) =>
        node.type === 'Text' &&
        typeof node.props.children === 'string' &&
        node.props.children.includes('Stimme gespiegelt'),
    );
    expect(subtitleMatches).not.toHaveLength(0);
  });

  it('navigates back to the camera from the highlight CTA', async () => {
    mockGetRecentHistory.mockReturnValue([baseEntry]);

    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<HistoryScreen />);
    });
    await act(async () => {});

    const cameraCta = component.root.findAll(
      (node) => node.props?.testID === 'history-highlight-camera',
    )[0];

    expect(cameraCta).toBeDefined();

    act(() => {
      cameraCta.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Recognition');
  });

  it('renders the empty state with the self-discovery copy when no entries exist', async () => {
    mockGetRecentHistory.mockReturnValue([]);

    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<HistoryScreen />);
    });
    await act(async () => {});

    const emptyTextNodes = component.root
      .findAll((node) => node.type === 'Text' && typeof node.props.children === 'string')
      .map((node) => node.props.children);

    expect(emptyTextNodes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Noch keine Selbstentdeckungen'),
      ]),
    );
  });
});

