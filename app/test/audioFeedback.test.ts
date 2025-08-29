jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(),
  createAudioPlayer: jest.fn(() => ({
    volume: 1,
    loop: false,
    seekTo: jest.fn(),
    play: jest.fn(),
    remove: jest.fn(),
  })),
  AudioRecorder: class {},
  RecordingPresets: { HIGH_QUALITY: 'HIGH_QUALITY' },
}));

jest.mock('expo-speech', () => ({
  speak: jest.fn((text, options) => {
    options?.onDone && options.onDone();
  }),
  stop: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('expo-file-system', () => ({
  bundleDirectory: '/bundle/',
  documentDirectory: '/doc/',
  getInfoAsync: jest.fn(),
}));

jest.mock('../db', () => ({
  database: {
    get: () => ({ find: jest.fn() }),
    write: async () => {},
  },
  Symbol: class {},
}));

import { audioService } from '../src/services';
import { AudioService } from '../src/services/audioService';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { database } from '../db';

describe('audioService feedback', () => {
  const soundMock = () => ({
    volume: 0,
    loop: false,
    seekTo: jest.fn(),
    play: jest.fn(),
    remove: jest.fn(),
  });

  const resetService = () => {
    (audioService as any).sounds = new Map([
      ['success', soundMock()],
      ['error', soundMock()],
      ['confirmation', soundMock()],
      ['celebration', soundMock()],
    ]);
    (audioService as any).isInitialized = true;
    (audioService as any).isSpeaking = false;
    (audioService as any).speechQueue = [];
    (audioService as any).lastSpokenText = '';
    (audioService as any).lastSpokenAt = 0;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetService();
  });

  it('plays success sound and speaks guidance when confidence is low', async () => {
    await audioService.playSuccessFeedback('Hallo', 0.8);

    const successSound = (audioService as any).sounds.get('success');
    const confirmationSound = (audioService as any).sounds.get('confirmation');
    expect(successSound.play).toHaveBeenCalled();
    expect(confirmationSound.play).toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledWith(
      'Ich denke, du meinst: Hallo',
      expect.objectContaining({ pitch: 1.1, rate: 0.8 })
    );
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    const soundOrder = (successSound.play as jest.Mock).mock.invocationCallOrder[0];
    const speechOrder = (Speech.speak as jest.Mock).mock.invocationCallOrder[0];
    expect(soundOrder).toBeLessThan(speechOrder);
  });

  it('plays error sound before speech with haptic feedback', async () => {
    await audioService.playErrorFeedback();

    const errorSound = (audioService as any).sounds.get('error');
    expect(errorSound.play).toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it('plays confirmation sound with haptic success', async () => {
    await audioService.playSound('confirmation');
    const confirmationSound = (audioService as any).sounds.get('confirmation');
    expect(confirmationSound.play).toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('speaks gentle encouragement for a gesture with haptic feedback', async () => {
    await audioService.playEncouragement('Winken');
    const phrase = (Speech.speak as jest.Mock).mock.calls[0][0];
    expect([
      'Möchtest du das Zeichen Winken nochmal üben?',
      'Lass uns Winken nochmal versuchen!',
      'Wie wäre es mit etwas Übung für Winken?',
    ]).toContain(phrase);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });

  it('plays celebration feedback with haptic success', async () => {
    await audioService.playCelebrationFeedback();
    const celebrationSound = (audioService as any).sounds.get('celebration');
    expect(celebrationSound.play).toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    expect(Speech.speak).toHaveBeenCalledWith(
      'Toll gemacht, Amy!',
      expect.objectContaining({ pitch: 1.2, rate: 0.9 })
    );
  });

  it('plays pre-recorded audio when available', async () => {
    const findMock = jest.fn().mockResolvedValue({ audioUri: '/doc/sounds/papa.mp3' });
    const originalGet = database.get;
    (database as any).get = jest.fn(() => ({ find: findMock }));
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    const customSpy = jest.spyOn(audioService, 'playCustomAudio').mockResolvedValue();

    await audioService.playSuccessFeedback('papa', 1);

    expect(customSpy).toHaveBeenCalledWith('/doc/sounds/papa.mp3');
    expect(Speech.speak).not.toHaveBeenCalled();

    (database as any).get = originalGet;
    customSpy.mockRestore();
  });

  it('skips duplicate speech requests in quick succession', async () => {
    await audioService.speak('Hallo');
    await audioService.speak('hallo');
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it('allows repeat after debounce window', async () => {
    await audioService.speak('Hallo');
    await new Promise((res) => setTimeout(res, 2100));
    await audioService.speak('Hallo');
    expect(Speech.speak).toHaveBeenCalledTimes(2);
  });

  it('does not enqueue duplicate while speaking', async () => {
    (audioService as any).isSpeaking = true;
    await audioService.speak('Hallo');
    await audioService.speak('  hallo  ');
    expect((audioService as any).speechQueue.length).toBe(1);
  });

  it('respects configurable duplicate window', async () => {
    const svc = new AudioService({
      volume: 1,
      speechRate: 1,
      speechPitch: 1,
      speechLanguage: 'de-DE',
      enableHaptics: false,
      duplicateSpeechDebounceMs: 0,
    });
    (svc as any).isInitialized = true;
    await svc.speak('Hallo');
    await svc.speak('hallo');
    expect(Speech.speak).toHaveBeenCalledTimes(2);
  });
});

