import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  formatRecordingTime,
  getDetectorStatusLabel,
  getDetectorStatusTone,
  getPhotoStatusPill,
  getRecordingStatusLabel,
  getRecordingStatusPill,
  getTrainingRecorderBannerMessage,
} from './trainingRecorderUtils';

describe('trainingRecorderUtils', () => {
  it('formatiert die Aufnahmezeit im Minutenformat', () => {
    expect(formatRecordingTime(0)).toBe('0:00');
    expect(formatRecordingTime(65)).toBe('1:05');
  });

  it('formatiert Byte-Angaben in MB', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('liefert die richtige Banner-Message für jeden Zustand', () => {
    expect(
      getTrainingRecorderBannerMessage({
        photoMode: 'previewing',
        isRecording: false,
        hasRecording: false,
        detectorStatus: 'idle',
        detectorRunning: false,
      }),
    ).toBe('Vorschau aktiv. Positioniere dich für das Foto.');

    expect(
      getTrainingRecorderBannerMessage({
        photoMode: 'captured',
        isRecording: false,
        hasRecording: false,
        detectorStatus: 'idle',
        detectorRunning: false,
      }),
    ).toBe('Foto aufgenommen. Bestätige oder nimm ein neues auf.');

    expect(
      getTrainingRecorderBannerMessage({
        photoMode: 'idle',
        isRecording: true,
        hasRecording: false,
        detectorStatus: 'idle',
        detectorRunning: false,
      }),
    ).toBe('Aufnahme läuft. Tippe auf „Aufnahme stoppen“, wenn du fertig bist.');

    expect(
      getTrainingRecorderBannerMessage({
        photoMode: 'idle',
        isRecording: false,
        hasRecording: true,
        detectorStatus: 'idle',
        detectorRunning: false,
      }),
    ).toBe('Aufnahme bereit. Prüfe sie und verwende oder verwerfe sie.');

    expect(
      getTrainingRecorderBannerMessage({
        photoMode: 'idle',
        isRecording: false,
        hasRecording: false,
        detectorStatus: 'running',
        detectorRunning: true,
      }),
    ).toBe('Zeige die Gebärde gut sichtbar vor der Kamera.');

    expect(
      getTrainingRecorderBannerMessage({
        photoMode: 'idle',
        isRecording: false,
        hasRecording: false,
        detectorStatus: 'error',
        detectorRunning: false,
      }),
    ).toBe('Die Kamera konnte nicht gestartet werden. Prüfe den Kamerazugriff und versuche es erneut.');

    expect(
      getTrainingRecorderBannerMessage({
        photoMode: 'idle',
        isRecording: false,
        hasRecording: false,
        detectorStatus: 'idle',
        detectorRunning: false,
      }),
    ).toBe('Kamera wird vorbereitet…');
  });

  it('liefert Statuslabels und Pills konsistent', () => {
    expect(getDetectorStatusLabel('running')).toBe('Detektor gestartet');
    expect(getDetectorStatusLabel('initializing')).toBe('Detektor startet…');
    expect(getDetectorStatusLabel('error')).toBe('Detektorfehler');
    expect(getDetectorStatusLabel('idle')).toBe('Detektor pausiert');

    expect(getDetectorStatusTone('running')).toBe('running');
    expect(getDetectorStatusTone('error')).toBe('error');
    expect(getDetectorStatusTone('idle')).toBe('idle');

    expect(getRecordingStatusLabel({ isRecording: true, hasRecording: false })).toBe('Aufnahme läuft');
    expect(getRecordingStatusLabel({ isRecording: false, hasRecording: true })).toBe('Aufnahme bereit');
    expect(getRecordingStatusLabel({ isRecording: false, hasRecording: false })).toBe('Keine Aufnahme aktiv');

    expect(
      getRecordingStatusPill({ isRecording: true, hasRecording: false, recordingDuration: 12 }),
    ).toBe('Aufnahme läuft (0:12)');
    expect(
      getRecordingStatusPill({ isRecording: false, hasRecording: true, recordingDuration: 12 }),
    ).toBe('Aufnahme bereit');
    expect(
      getRecordingStatusPill({ isRecording: false, hasRecording: false, recordingDuration: 12 }),
    ).toBeNull();

    expect(getPhotoStatusPill('previewing')).toBe('Fotovorschau aktiv');
    expect(getPhotoStatusPill('captured')).toBe('Foto aufgenommen');
    expect(getPhotoStatusPill('idle')).toBeNull();
  });
});
