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

import { addSchedule, listSchedules, getDueGesture } from '../src/services/practiceScheduler';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('practiceScheduler', () => {
  it('adds and lists schedules with selected days', async () => {
    await addSchedule({ gestureId: 'hello', hour: 9, minute: 30, daysOfWeek: [1, 3] } as any);
    const all = await listSchedules();
    expect(all).toHaveLength(1);
    expect(all[0].daysOfWeek).toEqual([1, 3]);
  });

  it('getDueGesture respects day of week', async () => {
    await addSchedule({ gestureId: 'hello', hour: 9, minute: 30, daysOfWeek: [2] } as any); // Tuesday
    const tuesday = new Date(Date.UTC(2023, 8, 12, 9, 30)); // Tue
    const wednesday = new Date(Date.UTC(2023, 8, 13, 9, 30)); // Wed
    expect(await getDueGesture(tuesday)).toBe('hello');
    expect(await getDueGesture(wednesday)).toBeNull();
  });
});
