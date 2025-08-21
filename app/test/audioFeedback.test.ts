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
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
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

import { audioService } from '../src/services/audioService';
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

  beforeEach(() => {
    jest.clearAllMocks();
    (audioService as any).sounds = new Map([
      ['success', soundMock()],
      ['error', soundMock()],
      ['confirmation', soundMock()],
    ]);
    (audioService as any).isInitialized = true;
    (audioService as any).isSpeaking = false;
    (audioService as any).speechQueue = [];
  });

  it('plays success sound before speech with haptic feedback', async () => {
    await audioService.playSuccessFeedback('Hallo', 1);

    const successSound = (audioService as any).sounds.get('success');
    const confirmationSound = (audioService as any).sounds.get('confirmation');
    expect(successSound.play).toHaveBeenCalled();
    expect(confirmationSound.play).toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledWith(
      'Hallo',
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

  it('speaks gentle encouragement for a gesture', async () => {
    await audioService.playEncouragement('Winken');
    const phrase = (Speech.speak as jest.Mock).mock.calls[0][0];
    expect([
      'Möchtest du das Zeichen Winken nochmal üben?',
      'Lass uns Winken nochmal versuchen!',
      'Wie wäre es mit etwas Übung für Winken?',
    ]).toContain(phrase);
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
});

