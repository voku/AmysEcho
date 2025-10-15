let storageMap = new Map<string, string>();

type MockAsyncStorage = {
  setItem: jest.Mock<Promise<void>, [string, string]>;
  getItem: jest.Mock<Promise<string | null>, [string]>;
  removeItem: jest.Mock<Promise<void>, [string]>;
};

const createMockAsyncStorage = (): MockAsyncStorage => ({
  setItem: jest.fn(async (key: string, value: string) => {
    storageMap.set(key, value);
  }),
  getItem: jest.fn(async (key: string) => {
    return storageMap.has(key) ? storageMap.get(key)! : null;
  }),
  removeItem: jest.fn(async (key: string) => {
    storageMap.delete(key);
  }),
});

let mockAsyncStorage = createMockAsyncStorage();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  get default() {
    return mockAsyncStorage;
  },
}));

const mockGetInfoAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();
let mockDocumentDirectoryValue: string | null = 'file:///documents';

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  get documentDirectory() {
    return mockDocumentDirectoryValue;
  },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

jest.mock('../../src/utils/logger', () => {
  const loggerMock = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    __esModule: true,
    logger: loggerMock,
    default: loggerMock,
  };
});

type DgsModelClientModule = typeof import('../../src/services/dgsModelClient');

let fetchMlpModel: DgsModelClientModule['fetchMlpModel'];
let loadLocalMlpModel: DgsModelClientModule['loadLocalMlpModel'];
let getCachedMlpMeta: DgsModelClientModule['getCachedMlpMeta'];
let onMlpModelUpdated: DgsModelClientModule['onMlpModelUpdated'];
let restoreMlpModelBackup: DgsModelClientModule['restoreMlpModelBackup'];

const originalFetch = global.fetch;
beforeEach(async () => {
  jest.resetModules();
  storageMap = new Map<string, string>();
  mockAsyncStorage = createMockAsyncStorage();
  mockDocumentDirectoryValue = 'file:///documents';
  mockGetInfoAsync.mockReset();
  mockReadAsStringAsync.mockReset();
  mockWriteAsStringAsync.mockReset();
  global.fetch = originalFetch;
  const { logger } = jest.requireMock('../../src/utils/logger');
  Object.values(logger).forEach((fn) => {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      (fn as jest.Mock).mockReset();
    }
  });

  const module = require('../../src/services/dgsModelClient') as DgsModelClientModule;
  module.__setDgsModelClientStorageForTests(mockAsyncStorage);
  fetchMlpModel = module.fetchMlpModel;
  loadLocalMlpModel = module.loadLocalMlpModel;
  getCachedMlpMeta = module.getCachedMlpMeta;
  onMlpModelUpdated = module.onMlpModelUpdated;
  restoreMlpModelBackup = module.restoreMlpModelBackup;
});

afterAll(() => {
  global.fetch = originalFetch;
  const module = require('../../src/services/dgsModelClient') as DgsModelClientModule;
  module.__setDgsModelClientStorageForTests(null);
});

describe('dgsModelClient local persistence', () => {
  it('falls back to the persisted document model when the API is unreachable', async () => {
    const persistedModel = 'YmFzZTY0LW1vZGVs';
    mockGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: false });
    mockReadAsStringAsync.mockResolvedValue(persistedModel);

    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchMlpModel();

    expect(fetchMock).toHaveBeenCalled();
    expect(mockGetInfoAsync).toHaveBeenCalledWith('file:///documents/amy_model.npz');
    expect(result).toBe(persistedModel);
  });

  it('persists downloaded models to the document directory', async () => {
    const buffer = Buffer.from('npz-data');
    mockWriteAsStringAsync.mockResolvedValue(undefined);

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => buffer,
    })) as unknown as typeof fetch;

    const result = await fetchMlpModel('p:id-123');

    const expectedBase64 = buffer.toString('base64');
    expect(result).toBe(expectedBase64);
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      'file:///documents/amy_model_p_id-123.npz',
      expectedBase64,
      { encoding: 'base64' },
    );
  });

  it('returns null when no document directory is available', async () => {
    mockDocumentDirectoryValue = null;
    const result = await loadLocalMlpModel();
    expect(result).toBeNull();
  });
});

describe('dgsModelClient metadata handling', () => {
  it('stores response metadata headers and logs the version', async () => {
    const buffer = Buffer.from('npz-data');
    const etag = '"sha256-deadbeef"';
    const checksum = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const version = '1728000000000';

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          switch (name.toLowerCase()) {
            case 'etag':
              return etag;
            case 'x-checksum-sha256':
              return checksum;
            case 'x-model-version':
              return version;
            case 'x-model-source':
              return 'global';
            default:
              return null;
          }
        },
      },
      arrayBuffer: async () => buffer,
    })) as unknown as typeof fetch;

    const result = await fetchMlpModel();
    expect(result).toBe(buffer.toString('base64'));

    expect(mockAsyncStorage.setItem).toHaveBeenCalled();
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('dgsMlpModelMeta:global', expect.any(String));
    expect(storageMap.has('dgsMlpModelMeta:global')).toBe(true);
    const meta = await getCachedMlpMeta();
    expect(meta).toEqual({ etag, checksum, version, source: 'global' });
  });

  it('tracks profile metadata when provided by the API', async () => {
    const buffer = Buffer.from('npz-data');
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          switch (name.toLowerCase()) {
            case 'etag':
              return '"sha256-abc"';
            case 'x-checksum-sha256':
              return 'abc';
            case 'x-model-version':
              return '99';
            case 'x-model-source':
              return 'profile';
            case 'x-model-profile':
              return 'p123';
            default:
              return null;
          }
        },
      },
      arrayBuffer: async () => buffer,
    })) as unknown as typeof fetch;

    await fetchMlpModel('p123');
    const meta = await getCachedMlpMeta('p123');
    expect(meta).toEqual({
      etag: '"sha256-abc"',
      checksum: 'abc',
      version: '99',
      source: 'profile',
      profileId: 'p123',
    });
  });

  it('refreshes cached metadata when a 304 response advertises new profile details', async () => {
    const buffer = Buffer.from('npz-data');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            switch (name.toLowerCase()) {
              case 'etag':
                return '"sha256-old"';
              case 'x-checksum-sha256':
                return 'old';
              case 'x-model-version':
                return '1';
              case 'x-model-source':
                return 'global';
              default:
                return null;
            }
          },
        },
        arrayBuffer: async () => buffer,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 304,
        headers: {
          get: (name: string) => {
            switch (name.toLowerCase()) {
              case 'x-model-source':
                return 'profile';
              case 'x-model-profile':
                return 'p123';
              case 'x-model-version':
                return '2';
              default:
                return null;
            }
          },
        },
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchMlpModel('p123');
    const beforeMeta = await getCachedMlpMeta('p123');
    expect(beforeMeta).toMatchObject({ source: 'global' });

    const listener = jest.fn();
    const unsubscribe = onMlpModelUpdated(listener);
    await fetchMlpModel('p123');
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    const meta = await getCachedMlpMeta('p123');
    expect(meta).toEqual({
      etag: '"sha256-old"',
      checksum: 'old',
      version: '2',
      source: 'profile',
      profileId: 'p123',
    });
  });

  it('preserves fallback profile metadata when headers are missing on 304 responses', async () => {
    const buffer = Buffer.from('npz-data');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            switch (name.toLowerCase()) {
              case 'etag':
                return '"sha256-profile"';
              case 'x-checksum-sha256':
                return 'profile-checksum';
              case 'x-model-version':
                return '1';
              case 'x-model-source':
                return 'profile';
              case 'x-model-profile':
                return 'p123';
              default:
                return null;
            }
          },
        },
        arrayBuffer: async () => buffer,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 304,
        headers: {
          get: (name: string) => {
            switch (name.toLowerCase()) {
              case 'x-model-version':
                return '2';
              default:
                return null;
            }
          },
        },
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchMlpModel('p123');
    const initialMeta = await getCachedMlpMeta('p123');
    expect(initialMeta).toMatchObject({
      source: 'profile',
      profileId: 'p123',
    });

    const cached = await fetchMlpModel('p123');
    expect(cached).toBe(buffer.toString('base64'));

    const meta = await getCachedMlpMeta('p123');
    expect(meta).toEqual({
      etag: '"sha256-profile"',
      checksum: 'profile-checksum',
      version: '2',
      source: 'profile',
      profileId: 'p123',
    });
  });
});

describe('dgsModelClient backups', () => {
  it('restores backup metadata as an empty object when no backup meta exists', async () => {
    const backupKey = 'dgsMlpModelBackup:global';
    const metaKey = 'dgsMlpModelMeta:global';
    storageMap.set(backupKey, 'YmFzZTY0LWJ1ZmZlcg==');

    expect(storageMap.has(backupKey)).toBe(true);

    const restored = await restoreMlpModelBackup();

    expect(mockAsyncStorage.getItem).toHaveBeenCalledWith(backupKey);
    expect(restored).toBe(true);
    expect(storageMap.get(metaKey)).toBe('{}');

    const meta = await getCachedMlpMeta();
    expect(meta).toEqual({});
  });
});
