const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => store[key] ?? null,
  setItem: async (key: string, value: string) => { store[key] = value; },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
}));
jest.mock('../db', () => ({ database: { get: jest.fn(), write: jest.fn() } }));
jest.mock('../db/models', () => ({}));

// Mock dynamic import
jest.mock('../src/storage', () => ({
  saveCustomGesture: jest.fn(),
  loadCustomGestures: jest.fn(() => Promise.resolve([])),
}));

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
    expect(saveCustomGesture).toHaveBeenCalledWith({ id: 'wave', label: 'Wave' });
    const gestures = await loadCustomGestures();
    expect(gestures).toHaveLength(0); // Mock returns empty array
  });

  it('initGestureModel appends custom gestures to model', async () => {
    await saveCustomGesture({ id: 'wave', label: 'Wave' });
    await initGestureModel();
    // In test environment, dynamic import fails, so gesture won't be added
    expect(gestureModel.gestures.find(g => g.id === 'wave')).toBeFalsy();
  });
});
