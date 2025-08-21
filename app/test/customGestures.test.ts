const store: Record<string, string> = {};
const stubAsync = {
  async getItem(key: string) {
    return store[key] ?? null;
  },
  async setItem(key: string, value: string) {
    store[key] = value;
  },
};

jest.mock('@react-native-async-storage/async-storage', () => stubAsync);
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
}));
jest.mock('../db', () => ({ database: { get: jest.fn(), write: jest.fn() } }));
jest.mock('../db/models', () => ({}));

import { saveCustomGesture, loadCustomGestures } from '../src/storage';
import { gestureModel, initGestureModel } from '../src/model';

describe('custom gesture persistence', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    // remove test gesture from model if present
    const idx = gestureModel.gestures.findIndex(g => g.id === 'wave');
    if (idx !== -1) gestureModel.gestures.splice(idx, 1);
  });

  it('saves and loads custom gestures', async () => {
    await saveCustomGesture({ id: 'wave', label: 'Wave' });
    const gestures = await loadCustomGestures();
    expect(gestures).toHaveLength(1);
    expect(gestures[0].id).toBe('wave');
  });

  it('initGestureModel appends custom gestures to model', async () => {
    await saveCustomGesture({ id: 'wave', label: 'Wave' });
    await initGestureModel();
    expect(gestureModel.gestures.find(g => g.id === 'wave')).toBeTruthy();
  });
});
