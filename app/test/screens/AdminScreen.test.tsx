import React from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { FlatList } from 'react-native';
import type { ComponentProps } from 'react';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../src/navigation/types';
import ScreenBackground from '../../src/components/ScreenBackground';
import SettingsOptionCard from '../../src/components/settings/SettingsOptionCard';

jest.mock('../../src/components/ScreenBackground', () => ({
  __esModule: true,
  default: jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
}));

const mockSubscribe = jest.fn(() => ({ unsubscribe: jest.fn() }));
const mockObserve = jest.fn(() => ({ subscribe: mockSubscribe }));
const mockQuery = jest.fn(() => ({ observe: mockObserve }));

jest.mock('../../db', () => ({
  database: {
    get: jest.fn(() => ({ query: mockQuery })),
    write: jest.fn(),
  },
}));

jest.mock('../../src/storage', () => ({
  loadOpenAIApiKey: jest.fn().mockResolvedValue(''),
  saveOpenAIApiKey: jest.fn(),
  loadBackendApiToken: jest.fn().mockResolvedValue(''),
  saveBackendApiToken: jest.fn(),
  loadActiveProfileId: jest.fn().mockResolvedValue('profile-1'),
}));

jest.mock('../../src/context/ServicesContext', () => ({
  useServices: () => ({
    audioService: {
      startRecording: jest.fn(),
      stopRecording: jest.fn().mockResolvedValue(''),
    },
    backupService: {
      exportProtectedGestures: jest.fn().mockResolvedValue(''),
      backupProtectedGestures: jest.fn().mockResolvedValue(''),
      restoreProtectedGestures: jest.fn().mockResolvedValue(true),
    },
    gdprService: {
      exportProfile: jest.fn().mockResolvedValue({}),
      deleteProfile: jest.fn().mockResolvedValue(true),
    },
  }),
}));

jest.mock('../../src/context/PerformanceContext', () => ({
  usePerformance: () => ({
    isLowPerformanceMode: false,
    toggleLowPerformanceMode: jest.fn(),
  }),
}));

jest.mock('../../src/services/dgsModelClient', () => ({
  fetchMlpModel: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/constants/audioPaths', () => ({
  CUSTOM_AUDIO_DIR: '/tmp',
  getCustomAudioPath: jest.fn((id: string) => `/tmp/${id}`),
}));

jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file://documents/' } },
}));

jest.mock('expo-file-system/legacy', () => ({
  makeDirectoryAsync: jest.fn(),
  moveAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn().mockResolvedValue('[]'),
}));

import AdminScreen from '../../src/screens/AdminScreen';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockClear();
    mockObserve.mockClear();
    mockSubscribe.mockClear();
    mockQuery.mockImplementation(() => ({ observe: mockObserve }));
    mockObserve.mockImplementation(() => ({ subscribe: mockSubscribe }));
    mockSubscribe.mockImplementation(() => ({ unsubscribe: jest.fn() }));
    const { database } = require('../../db');
    (database.get as jest.Mock).mockReturnValue({ query: mockQuery });
    (database.write as jest.Mock).mockImplementation(async (callback?: () => Promise<void>) => {
      if (callback) {
        await callback();
      }
    });
    const storage = require('../../src/storage');
    (storage.loadOpenAIApiKey as jest.Mock).mockResolvedValue('');
    (storage.loadBackendApiToken as jest.Mock).mockResolvedValue('');
    (storage.loadActiveProfileId as jest.Mock).mockResolvedValue('profile-1');
  });

  it('renders management actions inside the list footer so they scroll with the content', async () => {
    type NavigationSubset = StackNavigationProp<RootStackParamList, 'Admin'>;
    const navigation = ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      dispatch: jest.fn(),
      getState: jest.fn(() => ({
        type: 'stack',
        stale: false,
        key: 'stack-admin',
        index: 2,
        routeNames: ['Hero', 'App', 'Admin'],
        routes: [
          { key: 'Hero-1', name: 'Hero' },
          { key: 'App-1', name: 'App' },
          { key: 'Admin-1', name: 'Admin' },
        ],
        history: [],
      })),
    } as unknown) as NavigationSubset;

    await act(async () => {
      renderer.create(<AdminScreen navigation={navigation} />);
      await flushPromises();
    });

    const ScreenBackgroundMock = ScreenBackground as jest.Mock;
    expect(ScreenBackgroundMock).toHaveBeenCalled();

    const screenProps = ScreenBackgroundMock.mock.calls[0]?.[0] as {
      children?: React.ReactNode;
    };
    expect(screenProps).toBeTruthy();

    const childArray = React.Children.toArray(screenProps.children);
    const flatListElement = childArray.find(
      (child): child is React.ReactElement => React.isValidElement(child) && child.type === FlatList,
    );
    expect(flatListElement).toBeTruthy();

    const footerComponent = (flatListElement!.props as ComponentProps<typeof FlatList>).ListFooterComponent;
    expect(footerComponent).toBeTruthy();

    const footerElement = React.isValidElement(footerComponent)
      ? footerComponent
      : (footerComponent as () => React.ReactElement)();

    let footer!: renderer.ReactTestRenderer;
    act(() => {
      footer = renderer.create(footerElement);
    });
    const footerCards = footer.root.findAllByType(SettingsOptionCard);
    const footerTitles = footerCards.map(
      (node: ReactTestInstance) => (node.props as ComponentProps<typeof SettingsOptionCard>).title as string,
    );

    expect(footerTitles).toEqual(
      expect.arrayContaining(['Neuestes Modell herunterladen', 'Zurück']),
    );
  });
});
