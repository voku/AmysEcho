jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => {},
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
}));

jest.mock('@nozbe/watermelondb', () => ({
  Q: { where: () => ({}) },
}));

jest.mock('../db', () => {
  const correction = {
    actualGesture: 'wave',
    update: jest.fn(async (fn: any) => fn(correction)),
  };
  return {
    database: {
      get: jest.fn().mockReturnValue({
        query: jest.fn().mockReturnValue({
          fetch: jest.fn().mockResolvedValue([correction]),
        }),
      }),
      write: jest.fn(async (fn: any) => {
        await fn();
      }),
    },
    __correction: correction,
  };
});

import { syncService } from '../src/services/syncService';
import { API_URL, API_TOKEN } from '../src/constants';
const { __correction: correction } = require('../db');

describe('syncService.uploadPendingCorrections', () => {
  it('uploads unsynced corrections and marks them synced', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as any).fetch = fetchMock;

    await syncService.uploadPendingCorrections();

    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/corrections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ gesture: 'wave' }),
    });
    expect(correction.update).toHaveBeenCalled();
  });
});

