import { fetchMlpModel, loadLocalMlpModel } from '../../src/services/dgsModelClient';

const mockGetInfoAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockFromModule = jest.fn();
let mockDocumentDirectoryValue: string | null = 'file:///documents/';

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  get documentDirectory() {
    return mockDocumentDirectoryValue;
  },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...(args as [string])),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: (...args: unknown[]) => mockFromModule(...args),
  },
}));

jest.mock('../../assets/dgs_model.npz', () => 'mock-mlp-asset', { virtual: true });

jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const originalFetch = global.fetch;

beforeEach(() => {
  mockDocumentDirectoryValue = 'file:///documents/';
  mockGetInfoAsync.mockReset();
  mockReadAsStringAsync.mockReset();
  mockFromModule.mockReset();
  global.fetch = originalFetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('dgsModelClient local fallback', () => {
  it('loads the bundled fallback model when the API is unreachable', async () => {
    const bundledModel = 'YmFzZTY0LW1vZGVs';
    const asset = {
      localUri: 'file:///bundled/dgs_model.npz',
      downloadAsync: jest.fn().mockResolvedValue(undefined),
    };

    mockFromModule.mockReturnValue(asset);

    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (uri.startsWith('file:///documents/')) {
        return { exists: false } as const;
      }
      return { exists: true } as const;
    });

    mockReadAsStringAsync.mockImplementation(async (uri: string) => {
      if (uri === asset.localUri) {
        return bundledModel;
      }
      throw new Error(`Unexpected read for ${uri}`);
    });

    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchMlpModel();

    expect(fetchMock).toHaveBeenCalled();
    expect(mockFromModule).toHaveBeenCalled();
    expect(mockReadAsStringAsync).toHaveBeenCalledWith(asset.localUri, {
      encoding: 'base64',
    });
    expect(result).toBe(bundledModel);
  });

  it('returns null when no local fallback is available', async () => {
    mockDocumentDirectoryValue = null;
    mockGetInfoAsync.mockResolvedValue({ exists: false } as const);
    mockReadAsStringAsync.mockRejectedValue(new Error('not found'));
    mockFromModule.mockImplementation(() => {
      throw new Error('asset missing');
    });

    const result = await loadLocalMlpModel();

    expect(result).toBeNull();
  });
});
