import {Audio} from 'expo-av';
import * as Speech from 'expo-speech';
import {logger} from '../utils/logger';
import {AudioConfig, SpeechOptions} from '../types/audio';
import {InterruptionModeAndroid, InterruptionModeIOS} from "expo-av/src/Audio.types";
import { database } from '../../db';
import { Symbol } from '../../db/models';
import * as FileSystem from 'expo-file-system';

export class AudioService {
  private sounds: Map<string, Audio.Sound> = new Map();
  private isInitialized = false;
  private config: AudioConfig;
  private speechQueue: Array<{ text: string; options: SpeechOptions }> = [];
  private isSpeaking = false;
  private recording: Audio.Recording | null = null;

  constructor(config: AudioConfig) {
    this.config = {...config};
  }

  /**
   * Initialize audio system
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing audio service...');

      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        playThroughEarpieceAndroid: false,
      });

      // Preload common sound effects
      await this.preloadSounds();

      this.isInitialized = true;
      logger.info('Audio service initialized successfully');
    } catch (error: any) {
      logger.error('Failed to initialize audio service:', error);
      throw new Error(`Audio initialization failed: ${error.message}`);
    }
  }

  /**
   * Preload common sound effects
   */
  private async preloadSounds(): Promise<void> {
    const names = [
      'success',
      'error',
      'confirmation',
      'gesture_recognized',
      'listening',
      'thinking',
      'celebration',
    ];

    for (const name of names) {
      const bundlePath = FileSystem.bundleDirectory
        ? FileSystem.bundleDirectory + `assets/sounds/${name}.mp3`
        : null;
      const docPath = FileSystem.documentDirectory + `sounds/${name}.mp3`;

      const candidates = [bundlePath, docPath].filter(Boolean) as string[];
      let loaded = false;

      for (const filePath of candidates) {
        try {
          const info = await FileSystem.getInfoAsync(filePath);
          if (info.exists) {
            const { sound } = await Audio.Sound.createAsync(
              { uri: filePath },
              {
                shouldPlay: false,
                volume: this.config.volume,
              },
            );
            this.sounds.set(name, sound);
            logger.debug(`Preloaded sound: ${name}`);
            loaded = true;
            break;
          }
        } catch (error) {
          logger.warn(`Error loading sound ${name} from ${filePath}:`, error);
        }
      }

      if (!loaded) {
        logger.debug(`No sound asset found for ${name}`);
      }
    }
  }

  /**
   * Play a sound effect
   */
  async playSound(soundName: string, options?: { volume?: number; loop?: boolean }): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Audio service not initialized');
      return;
    }

    const sound = this.sounds.get(soundName);
    if (!sound) {
      logger.warn(`Sound not found: ${soundName}`);
      return;
    }

    try {
      await sound.setVolumeAsync(options?.volume || this.config.volume);
      await sound.setIsLoopingAsync(options?.loop || false);
      await sound.replayAsync();
      logger.debug(`Played sound: ${soundName}`);
    } catch (error) {
      logger.error(`Failed to play sound ${soundName}:`, error);
    }
  }

  /**
   * Speak text with gesture context
   */
  async speak(text: string, options?: SpeechOptions): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Audio service not initialized');
      return;
    }

    const speechOptions: SpeechOptions = {
      language: this.config.speechLanguage,
      pitch: this.config.speechPitch,
      rate: this.config.speechRate,
      volume: this.config.volume,
      ...options,
    };

    // Add to queue if already speaking
    if (this.isSpeaking) {
      this.speechQueue.push({ text, options: speechOptions });
      return;
    }

    await this.executeSpeech(text, speechOptions);
  }

  /**
   * Execute speech with proper queue management
   */
  private async executeSpeech(text: string, options: SpeechOptions): Promise<void> {
    this.isSpeaking = true;

    try {
      // Play gentle chime before speech for audio cue
      await this.playSound('confirmation');

      // Small delay to let chime play
      await new Promise((resolve) => setTimeout(resolve, 200));

      await Speech.speak(text, {
        language: options.language,
        pitch: options.pitch,
        rate: options.rate,
        volume: options.volume,
        onDone: () => {
          this.isSpeaking = false;
          this.processNextSpeechInQueue();
        },
        onError: (error) => {
          logger.error('Speech error:', error);
          this.isSpeaking = false;
          this.processNextSpeechInQueue();
        },
      });

      logger.debug(`Speaking: ${text}`);
    } catch (error) {
      logger.error('Failed to speak:', error);
      this.isSpeaking = false;
      this.processNextSpeechInQueue();
    }
  }

  /**
   * Process the next item in the speech queue
   */
  private processNextSpeechInQueue(): void {
    if (this.speechQueue.length > 0) {
      const { text, options } = this.speechQueue.shift()!;
      this.executeSpeech(text, options);
    }
  }

  /**
   * Stop current speech
   */
  async stopSpeech(): Promise<void> {
    if (this.isSpeaking) {
      await Speech.stop();
      this.isSpeaking = false;
      this.speechQueue.length = 0; // Clear queue
    }
  }

  /**
   * Play success feedback (sound + speech)
   */
  async playSuccessFeedback(gesture: string, confidence: number): Promise<void> {
    // Play success sound
    await this.playSound('success');

    // Speak the recognized gesture
    const text = confidence > 0.9 ? `${gesture}` : `Ich denke, du meinst: ${gesture}`;

    await this.speak(text, {
      pitch: 1.1,
      rate: 0.8,
    });
  }

  /**
   * Play error feedback when gesture recognition fails
   */
  async playErrorFeedback(): Promise<void> {
    await this.playSound('error');
    await this.speak('Entschuldigung, ich habe das nicht verstanden. Kannst du es nochmal versuchen?', {
      pitch: 0.9,
      rate: 0.8,
    });
  }

  /**
   * Play listening feedback when camera is active
   */
  async playListeningFeedback(): Promise<void> {
    await this.playSound('listening');
  }

  /**
   * Play thinking feedback during processing
   */
  async playThinkingFeedback(): Promise<void> {
    await this.playSound('thinking');
  }

  /**
   * Play celebration feedback for learning achievements
   */
  async playCelebrationFeedback(): Promise<void> {
    await this.playSound('celebration');
    await this.speak('Toll gemacht, Amy!', {
      pitch: 1.2,
      rate: 0.9,
    });
  }

  /**
   * Start audio recording for custom cues
   */
  async startRecording(): Promise<void> {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Audio permission not granted');
    }
    this.recording = new Audio.Recording();
    await this.recording.prepareToRecordAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    await this.recording.startAsync();
  }

  /**
   * Stop recording and return file URI
   */
  async stopRecording(): Promise<string | null> {
    if (!this.recording) return null;
    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;
      return uri ?? null;
    } catch (err) {
      this.recording = null;
      throw err;
    }
  }

  /**
   * Play custom audio from a file URI
   */
  async playCustomAudio(uri: string): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Audio service not initialized');
      return;
    }
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        logger.warn(`Custom audio missing: ${uri}`);
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: this.config.volume },
      );
      await sound.playAsync();
      await sound.unloadAsync();
    } catch (error) {
      logger.error('Failed to play custom audio:', error);
    }
  }

  /**
   * Update audio configuration
   */
  updateConfig(newConfig: Partial<AudioConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Audio config updated');
  }

  /**
   * Clean up audio resources
   */
  async dispose(): Promise<void> {
    await this.stopSpeech();

    for (const [name, sound] of this.sounds) {
      try {
        await sound.unloadAsync();
        logger.debug(`Unloaded sound: ${name}`);
      } catch (error) {
        logger.warn(`Failed to unload sound ${name}:`, error);
      }
    }

    this.sounds.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const audioService = new AudioService({
  volume: 0.8,
  speechRate: 0.9,
  speechPitch: 1.0,
  speechLanguage: 'de-DE',
  enableHaptics: true,
});

/**
 * Convenience helper to speak the label of a symbol.
 * This mirrors the playSymbolAudio function that was used in
 * some screens before the AudioService refactor.
 */

export async function playSymbolAudio(entry: { id: string; label: string; audioUri?: string }): Promise<void> {
  let uri = entry.audioUri;
  if (!uri) {
    try {
      const symbol = await database.get<Symbol>('symbols').find(entry.id);
      uri = (symbol as any).audioUri || undefined;
    } catch {}
  }

  if (uri) {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await audioService.playCustomAudio(uri);
      return;
    }
  }

  await audioService.speak(entry.label);
}
