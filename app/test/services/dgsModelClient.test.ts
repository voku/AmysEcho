import { fetchMlpModel, loadLocalMlpModel } from '../../src/services/dgsModelClient';

const mockGetInfoAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockFromModule = jest.fn();
let mockDocumentDirectoryValue: string | null = 'file:///documents';

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  get documentDirectory() {
    return mockDocumentDirectoryValue;
  },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: (...args: unknown[]) => mockFromModule(...args),
  },
}));

jest.mock('../../assets/amy_model.npz', () => 'mock-mlp-asset', { virtual: true });
jest.mock('../../assets/amy_model_base64.txt', () => 'mock-mlp-asset-base64', {
  virtual: true,
});

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
  mockDocumentDirectoryValue = 'file:///documents';
  mockGetInfoAsync.mockReset();
  mockReadAsStringAsync.mockReset();
  mockFromModule.mockReset();
  global.fetch = originalFetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('dgsModelClient local fallback', () => {
  it('loads the bundled base64 fallback model when the API is unreachable', async () => {
    const bundledModel = 'YmFzZTY0LW1vZGVs';
    const base64Asset = {
      localUri: 'file:///bundled/amy_model_base64.txt',
      downloadAsync: jest.fn().mockResolvedValue(undefined),
    };

    mockFromModule.mockImplementation((moduleId: unknown) => {
      if (moduleId === 'mock-mlp-asset-base64') {
        return base64Asset;
      }
      throw new Error(`Unexpected module request: ${String(moduleId)}`);
    });

    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (uri.startsWith('file:///documents')) {
        return { exists: false } as const;
      }
      return { exists: true } as const;
    });

    mockReadAsStringAsync.mockImplementation(async (uri: string, options?: any) => {
      if (uri === base64Asset.localUri) {
        expect(options).toEqual({ encoding: 'utf8' });
        return ` ${bundledModel}\n`;
      }
      throw new Error(`Unexpected read for ${uri}`);
    });

    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchMlpModel();

    expect(fetchMock).toHaveBeenCalled();
    expect(mockGetInfoAsync).toHaveBeenCalledWith('file:///documents/amy_model.npz');
    expect(mockFromModule).toHaveBeenCalledWith('mock-mlp-asset-base64');
    expect(mockReadAsStringAsync).toHaveBeenCalledWith(base64Asset.localUri, {
      encoding: 'utf8',
    });
    expect(result).toBe(bundledModel);
  });

  it('falls back to the binary bundled model when the base64 asset is unavailable', async () => {
    const bundledModel = 'YmFzZTY0LW1vZGVs';
    const binaryAsset = {
      localUri: 'file:///bundled/amy_model.npz',
      downloadAsync: jest.fn().mockResolvedValue(undefined),
    };

    mockFromModule.mockImplementation((moduleId: unknown) => {
      if (moduleId === 'mock-mlp-asset-base64') {
        throw new Error('missing base64 asset');
      }
      if (moduleId === 'mock-mlp-asset') {
        return binaryAsset;
      }
      throw new Error(`Unexpected module request: ${String(moduleId)}`);
    });

    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (uri.startsWith('file:///documents')) {
        return { exists: false } as const;
      }
      return { exists: true } as const;
    });

    mockReadAsStringAsync.mockImplementation(async (uri: string, options?: any) => {
      if (uri === binaryAsset.localUri) {
        expect(options).toEqual({ encoding: 'base64' });
        return bundledModel;
      }
      throw new Error(`Unexpected read for ${uri}`);
    });

    const result = await loadLocalMlpModel();

    expect(mockGetInfoAsync).toHaveBeenCalledWith('file:///documents/amy_model.npz');
    expect(mockFromModule).toHaveBeenCalledWith('mock-mlp-asset-base64');
    expect(mockFromModule).toHaveBeenCalledWith('mock-mlp-asset');
    expect(mockReadAsStringAsync).toHaveBeenCalledWith(binaryAsset.localUri, {
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
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
  });
});
