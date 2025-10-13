import { fetchMlpModel, loadLocalMlpModel } from '../../src/services/dgsModelClient';

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
  mockWriteAsStringAsync.mockReset();
  global.fetch = originalFetch;
});

afterAll(() => {
  global.fetch = originalFetch;
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
