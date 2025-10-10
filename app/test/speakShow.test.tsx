jest.mock('../src/utils/haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  impactAsync: jest.fn(),
}));

jest.mock('../src/services/audioService', () => ({
  audioService: { playSuccessFeedback: jest.fn() },
}));

import { triggerSpeakAndShow, audioService } from '../src/services';
import * as Haptics from '../src/utils/haptics';

describe('triggerSpeakAndShow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('triggers speech, haptics, and visual callback', async () => {
    (audioService.playSuccessFeedback as jest.Mock).mockResolvedValue(undefined);
    const show = jest.fn();
    await triggerSpeakAndShow('Hallo', 1, show);
    expect(audioService.playSuccessFeedback).toHaveBeenCalledWith('Hallo', 1);
    expect(Haptics.notificationAsync).toHaveBeenCalled();
    expect(show).toHaveBeenCalled();
  });

  it('still shows symbol when speech fails', async () => {
    (audioService.playSuccessFeedback as jest.Mock).mockRejectedValue(new Error('fail'));
    const show = jest.fn();
    await triggerSpeakAndShow('Hallo', 1, show);
    expect(show).toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalled();
  });
});
