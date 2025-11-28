import { registerCustomGesture } from '../../src/services/customGestureRegistry';
import { loadBackendApiToken } from '../../src/storage';
import { logger } from '../../src/utils/logger';
import { API_URL } from '../../src/constants';

jest.mock('../../src/storage');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockedLoadBackendApiToken = loadBackendApiToken as jest.MockedFunction<typeof loadBackendApiToken>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

describe('registerCustomGesture', () => {
  beforeEach(() => {
    mockedLoadBackendApiToken.mockReset();
    (mockedLogger.info as jest.Mock).mockReset();
    (mockedLogger.warn as jest.Mock).mockReset();
  });

  it('skips registration when token is missing', async () => {
    mockedLoadBackendApiToken.mockResolvedValue(null);
    const fetchMock = jest.fn();

    const result = await registerCustomGesture(
      { id: 'hilfe', label: 'Hilfe' },
      { fetchImpl: fetchMock },
    );

    expect(result).toEqual({ status: 'skipped', reason: 'missing-token' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockedLogger.warn).toHaveBeenCalled();
  });

  it('posts gesture payload to backend when token exists', async () => {
    mockedLoadBackendApiToken.mockResolvedValue('secret');
    const responseBody = {
      id: 'hilfe',
      label: 'Hilfe',
      emoji: '🖐️',
      createdAt: '2024-05-28T10:00:00Z',
      updatedAt: '2024-05-28T10:00:00Z',
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => responseBody,
    });

    const result = await registerCustomGesture(
      { id: 'hilfe', label: 'Hilfe', emoji: '🖐️' },
      { fetchImpl: fetchMock, apiBaseUrl: 'https://example.test' },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/v1/dgs/gestures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer secret',
      },
      body: JSON.stringify({ id: 'hilfe', label: 'Hilfe', emoji: '🖐️' }),
    });
    expect(result).toEqual({ status: 'registered', gesture: responseBody });
  });

  it('throws when backend rejects the payload', async () => {
    mockedLoadBackendApiToken.mockResolvedValue('secret');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid' }),
    });

    await expect(
      registerCustomGesture({ id: 'hilfe', label: 'Hilfe' }, { fetchImpl: fetchMock, apiBaseUrl: API_URL }),
    ).rejects.toThrow('Registrierung der Geste fehlgeschlagen');
  });

  it('includes profileId in request when provided', async () => {
    mockedLoadBackendApiToken.mockResolvedValue('secret');
    const responseBody = {
      id: 'mein_zeichen',
      label: 'Mein Zeichen',
      profileId: 'child-123',
      emoji: '👋',
      createdAt: '2024-05-28T10:00:00Z',
      updatedAt: '2024-05-28T10:00:00Z',
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => responseBody,
    });

    const result = await registerCustomGesture(
      { id: 'mein_zeichen', label: 'Mein Zeichen', profileId: 'child-123', emoji: '👋' },
      { fetchImpl: fetchMock, apiBaseUrl: 'https://example.test' },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/v1/dgs/gestures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer secret',
      },
      body: JSON.stringify({ id: 'mein_zeichen', label: 'Mein Zeichen', profileId: 'child-123', emoji: '👋' }),
    });
    expect(result).toEqual({ 
      status: 'registered', 
      gesture: {
        ...responseBody,
        emoji: '👋',
      }
    });
  });
});
