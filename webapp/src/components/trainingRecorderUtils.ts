import type { SignLanguageStatus } from '../hooks/useSignLanguageDetector';

export type PhotoMode = 'idle' | 'previewing' | 'captured';

export function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function getTrainingRecorderBannerMessage({
  photoMode,
  isRecording,
  hasRecording,
  showDetectorStart,
  detectorRunning,
}: {
  photoMode: PhotoMode;
  isRecording: boolean;
  hasRecording: boolean;
  showDetectorStart: boolean;
  detectorRunning: boolean;
}): string {
  if (photoMode === 'previewing') {
    return 'Vorschau aktiv. Positioniere dich für das Foto.';
  }
  if (photoMode === 'captured') {
    return 'Foto aufgenommen. Bestätige oder nimm ein neues auf.';
  }
  if (isRecording) {
    return 'Aufnahme läuft. Tippe auf „Aufnahme stoppen“, wenn du fertig bist.';
  }
  if (hasRecording) {
    return 'Aufnahme bereit. Prüfe sie und verwende oder verwerfe sie.';
  }
  if (showDetectorStart) {
    return 'Starte die Kamera, um eine Gebärde aufzunehmen.';
  }
  if (detectorRunning) {
    return 'Zeige die Gebärde gut sichtbar vor der Kamera.';
  }
  return 'Kamera ist pausiert. Starte sie, um aufzunehmen.';
}

export function getDetectorStatusLabel(status: SignLanguageStatus): string {
  if (status === 'running') {
    return 'Detektor gestartet';
  }
  if (status === 'initializing') {
    return 'Detektor startet…';
  }
  if (status === 'error') {
    return 'Detektorfehler';
  }
  return 'Detektor pausiert';
}

export function getDetectorStatusTone(status: SignLanguageStatus): 'running' | 'error' | 'idle' {
  switch (status) {
    case 'running':
      return 'running';
    case 'error':
      return 'error';
    case 'idle':
    case 'initializing':
    case 'stopped':
      return 'idle';
  }
}

export function getDetectorStartLabel(status: SignLanguageStatus): string {
  if (status === 'error') {
    return 'Kamera erneut versuchen';
  }
  if (status === 'initializing') {
    return 'Startet…';
  }
  return 'Kamera starten';
}

export function getRecordingStatusLabel({
  isRecording,
  hasRecording,
}: {
  isRecording: boolean;
  hasRecording: boolean;
}): string {
  if (isRecording) {
    return 'Aufnahme läuft';
  }
  if (hasRecording) {
    return 'Aufnahme bereit';
  }
  return 'Keine Aufnahme aktiv';
}

export function getRecordingStatusPill({
  isRecording,
  hasRecording,
  recordingDuration,
}: {
  isRecording: boolean;
  hasRecording: boolean;
  recordingDuration: number;
}): string | null {
  if (isRecording) {
    return `Aufnahme läuft (${formatRecordingTime(recordingDuration)})`;
  }
  if (hasRecording) {
    return 'Aufnahme bereit';
  }
  return null;
}

export function getPhotoStatusPill(photoMode: PhotoMode): string | null {
  switch (photoMode) {
    case 'previewing':
      return 'Fotovorschau aktiv';
    case 'captured':
      return 'Foto aufgenommen';
    case 'idle':
      return null;
  }
}
