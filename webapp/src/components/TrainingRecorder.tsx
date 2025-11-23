import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGestureDetector } from '../hooks/useGestureDetector';
import { useTrainingRecorder } from '../hooks/useTrainingRecorder';
import type { TrainingBundlePayload } from '../training/types';

export interface TrainingRecorderProps {
  profileId: string;
  label: string;
  onRecordingComplete: (payload: TrainingBundlePayload) => void;
}

function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TrainingRecorder({ profileId, label, onRecordingComplete }: TrainingRecorderProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingStartTimeRef = useRef<number | null>(null);

  const cameraSupported = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  const { start: startCamera, status, error: cameraError } = useGestureDetector(videoRef, overlayRef);

  const { state, recordedData, startRecording, stopRecording, resetRecording, framesCaptured } = useTrainingRecorder();

  // Update recording duration
  useEffect(() => {
    if (state !== 'recording') {
      recordingStartTimeRef.current = null;
      return;
    }

    recordingStartTimeRef.current = Date.now();
    const interval = setInterval(() => {
      if (recordingStartTimeRef.current) {
        const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        setRecordingDuration(elapsed);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state]);

  const handleStartCamera = useCallback(async () => {
    await startCamera();
  }, [startCamera]);

  const handleStartRecording = useCallback(() => {
    if (status !== 'running') {
      return;
    }
    startRecording();
  }, [status, startRecording]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  const handleSaveRecording = useCallback(() => {
    if (recordedData.frames.length === 0) {
      return;
    }

    // Convert still image to File if available
    let stillFile: File | null = null;
    if (recordedData.stillImage) {
      try {
        const parts = recordedData.stillImage.split(',');
        if (parts.length === 2 && parts[1]) {
          const base64Data = parts[1];
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          stillFile = new File([byteArray], 'still.jpg', { type: 'image/jpeg' });
        }
      } catch (error) {
        console.warn('Failed to convert still image to File', error);
      }
    }

    const payload: TrainingBundlePayload = {
      profileId,
      label,
      frames: recordedData.frames,
      capturedAt: new Date().toISOString(),
      source: 'web://mediapipe',
      stillFile,
      clipFile: null, // Video recording not implemented in webapp
    };

    onRecordingComplete(payload);
    resetRecording();
  }, [recordedData, profileId, label, onRecordingComplete, resetRecording]);

  const handleDiscardRecording = useCallback(() => {
    resetRecording();
    setRecordingDuration(0);
  }, [resetRecording]);

  const isRecording = state === 'recording';
  const hasRecording = state === 'idle' && recordedData.frames.length > 0;

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Aufnahme</p>
          <h2>Geste aufzeichnen</h2>
          <p className="muted">
            Nimm deine Geste mit der Kamera auf. Die Handbewegungen werden automatisch erkannt und gespeichert.
          </p>
        </div>
        <div className="status-chip" data-state={isRecording ? 'running' : hasRecording ? 'success' : 'idle'}>
          {isRecording ? `Aufnahme läuft (${formatRecordingTime(recordingDuration)})` : hasRecording ? 'Aufnahme bereit' : 'Bereit'}
        </div>
      </div>

      {!cameraSupported && (
        <div className="notice warning">
          <strong>Kamera nicht verfügbar.</strong> Bitte erlaube den Kamerazugriff oder nutze ein Gerät mit Webcam.
        </div>
      )}

      {cameraError && <div className="notice error">{cameraError}</div>}

      <div className="detector-shell">
        <div className="video-wrapper">
          <video ref={videoRef} className="video" playsInline muted autoPlay />
          {showOverlay && <canvas ref={overlayRef} className="overlay" />}
          {isRecording && (
            <div className="recording-indicator">
              <span className="recording-dot"></span>
              <span>Aufnahme läuft</span>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-row">
            <div>
              <p className="eyebrow">Aufnahmedetails</p>
              <p className="muted">
                Profil: <strong>{profileId}</strong>
              </p>
              <p className="muted">
                Geste: <strong>{label}</strong>
              </p>
              <p className="value">{framesCaptured} Frames erfasst</p>
            </div>
            <div className="toggle">
              <input
                id="overlay-toggle"
                type="checkbox"
                checked={showOverlay}
                onChange={(event) => setShowOverlay(event.target.checked)}
              />
              <label htmlFor="overlay-toggle">Overlay anzeigen</label>
            </div>
          </div>

          <div className="controls">
            {status !== 'running' && (
              <button className="primary" onClick={handleStartCamera} disabled={!cameraSupported}>
                Kamera starten
              </button>
            )}

            {status === 'running' && !isRecording && !hasRecording && (
              <button className="primary" onClick={handleStartRecording}>
                Aufnahme starten
              </button>
            )}

            {isRecording && (
              <button className="primary" onClick={handleStopRecording}>
                Aufnahme beenden
              </button>
            )}

            {hasRecording && (
              <>
                <button className="primary" onClick={handleSaveRecording}>
                  Aufnahme verwenden
                </button>
                <button className="ghost" onClick={handleDiscardRecording}>
                  Verwerfen
                </button>
              </>
            )}
          </div>

          {recordedData.stillImage && hasRecording && (
            <div className="still-preview">
              <p className="eyebrow">Vorschau</p>
              <img src={recordedData.stillImage} alt="Aufgenommene Geste" style={{ maxWidth: '100%', borderRadius: '8px' }} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
