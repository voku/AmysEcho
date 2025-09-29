import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: { colors: { gradientStart: '#000000', gradientEnd: '#111111' } },
    themeName: 'default',
    setTheme: jest.fn(),
    availableThemes: {},
  }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

jest.mock('../../src/model', () => ({
  gestureModel: { gestures: [{ id: 'hello', label: 'Hallo' }, { id: 'danke', label: 'Danke' }] },
}));

jest.mock('../../src/services/practiceScheduler', () => ({
  __esModule: true,
  listSchedules: jest.fn(async () => []),
  addSchedule: jest.fn(async () => {}),
  removeSchedule: jest.fn(async () => {}),
  setScheduleEnabled: jest.fn(async () => {}),
}));

jest.mock('../../src/storage', () => ({
  __esModule: true,
  loadProfile: jest.fn(async () => ({ id: 'p1', name: 'Amy' })),
}));

jest.mock('../../src/components/BottomNav', () => () => null);

import PracticeSchedulerScreen from '../../src/screens/PracticeSchedulerScreen';

describe('PracticeSchedulerScreen accessibility', () => {
  it('renders German labels and accessible buttons', async () => {
    let comp!: renderer.ReactTestRenderer;
    const storage = require('../../src/storage');
    const schedules = require('../../src/services/practiceScheduler');
    (storage.loadProfile as jest.Mock).mockResolvedValue({ id: 'p1', name: 'Amy' });
    (schedules.listSchedules as jest.Mock).mockResolvedValue([]);
    (schedules.addSchedule as jest.Mock).mockResolvedValue(undefined);
    (schedules.removeSchedule as jest.Mock).mockResolvedValue(undefined);
    (schedules.setScheduleEnabled as jest.Mock).mockResolvedValue(undefined);
    await act(async () => {
      comp = renderer.create(
        <PracticeSchedulerScreen navigation={{ goBack: jest.fn() }} route={{ params: {} }} /> as any,
      );
      await Promise.resolve();
    });
    const texts = comp.root.findAll((n) => n.type === 'Text').map((n) => n.props.children);
    expect(texts).toContain('Übungsplaner');
    expect(texts).toContain('Geste');
    expect(texts).toContain('Zeit (24h)');

    const pressables = comp.root.findAll((n) => n.type === 'Pressable');
    const labels = pressables.map((p) => p.props.accessibilityLabel).filter(Boolean);
    expect(labels).toEqual(expect.arrayContaining([
      expect.stringContaining('Geste'),
      'Plan hinzufügen',
      'Zurück',
    ]));
  });
});
