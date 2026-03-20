/**
 * Audio Service for Web
 * Provides sound playback, text-to-speech, and audio feedback for gestures.
 */

import { logger } from './logger';

export interface AudioConfig {
  volume: number;
  speechRate: number;
  speechPitch: number;
  speechLanguage: string;
  enableHaptics: boolean;
  duplicateSpeechDebounceMs: number;
}

export interface SpeechOptions {
  language?: string;
  pitch?: number;
  rate?: number;
  volume?: number;
}

export interface SpeakRequestOptions extends SpeechOptions {
  allowDuplicates?: boolean;
}

class AudioService {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private isInitialized = false;
  private config: AudioConfig;
  private speechQueue: Array<{ text: string; options: SpeechOptions }> = [];
  private isSpeaking = false;
  private lastSpokenText = '';
  private lastSpokenAt = 0;

  constructor(config: AudioConfig) {
    this.config = { ...config };
  }

  /**
   * Initialize audio system
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing audio service...');

      // Preload common sound effects
      await this.preloadSounds();

      this.isInitialized = true;
      logger.info('Audio service initialized successfully');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize audio service:', error);
      throw new Error(`Audio initialization failed: ${message}`);
    }
  }

  /**
   * Preload common sound effects
   */
  private async preloadSounds(): Promise<void> {
    // MP3 assets were removed from the web deployment because they were
    // not reliably available and created noisy 404 errors.
    // Keep the API surface but default to speech + haptics feedback only.
    this.sounds.clear();
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
      logger.debug(`Sound not found: ${soundName}`);
      return;
    }

    try {
      sound.volume = options?.volume ?? this.config.volume;
      sound.loop = options?.loop ?? false;
      sound.currentTime = 0;
      await sound.play();
      logger.debug(`Played sound: ${soundName}`);
      
      if (this.config.enableHaptics && soundName === 'confirmation') {
        this.triggerHaptic('success');
      }
    } catch (error) {
      logger.error(`Failed to play sound ${soundName}:`, error);
    }
  }

  /**
   * Speak text with gesture context using Web Speech API
   */
  async speak(text: string, options?: SpeakRequestOptions): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Audio service not initialized');
      return;
    }

    if (!('speechSynthesis' in window)) {
      logger.warn('Speech synthesis not supported');
      return;
    }

    const { allowDuplicates, ...speechOptions }: SpeakRequestOptions = {
      language: this.config.speechLanguage,
      pitch: this.config.speechPitch,
      rate: this.config.speechRate,
      volume: this.config.volume,
      ...(options ?? {}),
    };

    const now = Date.now();
    const key = (text ?? '').trim().toLowerCase();
    if (
      !allowDuplicates &&
      key === this.lastSpokenText &&
      now - this.lastSpokenAt < this.config.duplicateSpeechDebounceMs
    ) {
      logger.debug(`Duplicate speech skipped: ${text}`);
      return;
    }
    this.lastSpokenText = key;
    this.lastSpokenAt = now;

    // Add to queue if already speaking
    if (this.isSpeaking) {
      const lastQueued = this.speechQueue[this.speechQueue.length - 1];
      if (!lastQueued || lastQueued.text.trim().toLowerCase() !== this.lastSpokenText) {
        this.speechQueue.push({ text, options: speechOptions });
      }
      return;
    }

    await this.executeSpeech(text, speechOptions);
  }

  /**
   * Execute speech with proper queue management
   */
  private executeSpeech(text: string, options: SpeechOptions): Promise<void> {
    this.isSpeaking = true;

    return new Promise(async (resolve, reject) => {
      try {
        // Play gentle chime before speech
        await this.playSound('confirmation');

        // Small delay to let chime play
        await new Promise((res) => setTimeout(res, 200));

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = options.language ?? 'de-DE';
        utterance.pitch = options.pitch ?? 1.0;
        utterance.rate = options.rate ?? 1.0;
        utterance.volume = options.volume ?? 1.0;

        utterance.onend = () => {
          this.isSpeaking = false;
          this.processNextSpeechInQueue();
          resolve();
        };

        utterance.onerror = (event) => {
          logger.error('Speech error:', event.error);
          this.isSpeaking = false;
          this.processNextSpeechInQueue();
          reject(new Error(event.error));
        };

        window.speechSynthesis.speak(utterance);
        logger.debug(`Speaking: ${text}`);
      } catch (error) {
        logger.error('Failed to speak:', error);
        this.isSpeaking = false;
        this.processNextSpeechInQueue();
        reject(error);
      }
    });
  }

  /**
   * Process the next item in the speech queue
   */
  private processNextSpeechInQueue(): void {
    if (this.speechQueue.length > 0) {
      const item = this.speechQueue.shift();
      if (item) {
        this.executeSpeech(item.text, item.options);
      }
    }
  }

  /**
   * Stop current speech
   */
  async stopSpeech(): Promise<void> {
    if (this.isSpeaking && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.speechQueue.length = 0;
    }
  }

  /**
   * Play success feedback (sound + speech)
   */
  async playSuccessFeedback(gesture: string, confidence: number): Promise<void> {
    await this.playSound('success');
    this.triggerHaptic('success');

    if (confidence > 0.9) {
      await this.speak(gesture, { pitch: 1.1, rate: 0.9 });
    } else {
      await this.speak(`Ich denke, du meinst: ${gesture}`, {
        pitch: 1.1,
        rate: 0.8,
      });
    }
  }

  /**
   * Play error feedback when gesture recognition fails
   */
  async playErrorFeedback(): Promise<void> {
    await this.playSound('error');
    this.triggerHaptic('error');
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
    this.triggerHaptic('success');
    await this.speak('Toll gemacht, Amy!', {
      pitch: 1.2,
      rate: 0.9,
    });
  }

  /**
   * Speak encouragement message
   */
  async playEncouragement(gesture?: string): Promise<void> {
    const phrases = gesture
      ? [
          `Möchtest du die Gebärde ${gesture} nochmal üben?`,
          `Lass uns ${gesture} nochmal versuchen!`,
          `Wie wäre es mit etwas Übung für ${gesture}?`,
        ]
      : [
          'Weiter so!',
          'Du machst das toll!',
          'Prima, weiter üben!'
        ];

    const randomIndex = Math.floor(Math.random() * phrases.length);
    const phrase = phrases[randomIndex] ?? 'Weiter so!';
    this.triggerHaptic('light');
    await this.speak(phrase, { pitch: 1.1, rate: 0.9 });
  }

  /**
   * Trigger haptic feedback using Vibration API
   */
  private triggerHaptic(type: 'success' | 'error' | 'light' | 'heavy'): void {
    if (!this.config.enableHaptics) return;
    if (!('vibrate' in navigator)) return;

    try {
      switch (type) {
        case 'success':
          navigator.vibrate([50, 50, 50]);
          break;
        case 'error':
          navigator.vibrate([100, 50, 100]);
          break;
        case 'heavy':
          navigator.vibrate(100);
          break;
        case 'light':
        default:
          navigator.vibrate(30);
          break;
      }
    } catch (error) {
      logger.debug('Haptic feedback failed:', error);
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
  duplicateSpeechDebounceMs: 2000,
});

// Auto-initialize on first import
if (typeof window !== 'undefined') {
  audioService.initialize().catch((error) => {
    logger.warn('Audio service auto-initialization failed:', error);
  });
}
