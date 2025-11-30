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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function TrainingRecorder({ profileId, label, onRecordingComplete }: TrainingRecorderProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingStartTimeRef = useRef<number | null>(null);
  const metadataReady = profileId.trim().length > 0 && label.trim().length > 0;

  const cameraSupported = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  const { start: startCamera, status, error: cameraError, lastLandmarks } = useGestureDetector(
    videoRef,
    overlayRef,
  );

  const {
    state,
    recordedData,
    startRecording,
    stopRecording,
    resetRecording,
    framesCaptured,
    clipLimitExceeded,
    maxClipBytes,
  } = useTrainingRecorder(videoRef);

  // Auto-start camera when metadata is ready and detector is not running
  useEffect(() => {
    if (!cameraSupported || !metadataReady) {
      return;
    }
    if (status === 'running' || status === 'initializing') {
      return;
    }

    startCamera();
  }, [cameraSupported, metadataReady, status, startCamera]);

  // Update recording duration
  useEffect(() => {
    if (state !== 'recording') {
      recordingStartTimeRef.current = null;
      setRecordingDuration(0);
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

  const handleStartRecording = useCallback(() => {
    if (!metadataReady) {
      return;
    }
    if (status !== 'running') {
      return;
    }
    startRecording();
  }, [metadataReady, status, startRecording]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  const handleSaveRecording = useCallback(async () => {
    if (!metadataReady) {
      return;
    }
    if (recordedData.frames.length === 0) {
      return;
    }

    // Convert still image to File if available
    let stillFile: File | null = null;
    if (recordedData.stillImage) {
      try {
        const response = await fetch(recordedData.stillImage);
        const blob = await response.blob();
        stillFile = new File([blob], 'still.jpg', { type: blob.type || 'image/jpeg' });
      } catch (error) {
        console.warn('Failed to convert still image to File', error);
      }
    }

    const payload: TrainingBundlePayload = {
      profileId: profileId.trim(),
      label: label.trim(),
      frames: recordedData.frames,
      capturedAt: new Date().toISOString(),
      source: 'web://mediapipe',
      stillFile,
      clipFile: recordedData.clipFile,
    };

    onRecordingComplete(payload);
    resetRecording();
  }, [metadataReady, recordedData, profileId, label, onRecordingComplete, resetRecording]);

  const handleSaveLandmarkJson = useCallback(() => {
    if (recordedData.frames.length === 0) {
      return;
    }
    const blob = new Blob([JSON.stringify({ frames: recordedData.frames }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'training-landmarks.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [recordedData.frames]);

  const handleDiscardRecording = useCallback(() => {
    resetRecording();
    setRecordingDuration(0);
  }, [resetRecording]);

  const detectorRunning = status === 'running';
  const hasLiveFrames = detectorRunning && lastLandmarks.length > 0;
  const detectorInactiveNotice = !detectorRunning
    ? 'Die Kameraerkennung ist angehalten. Starte sie erneut, damit Frames und Standbilder gesammelt werden.'
    : !hasLiveFrames
    ? 'Es kommen noch keine Live-Frames an. Positioniere dich vor der Kamera oder warte einen Moment.'
    : '';

  const isRecording = state === 'recording';
  const hasRecording = state === 'idle' && recordedData.frames.length > 0;
  const clipStatus = recordedData.clipFile
    ? `${recordedData.clipFile.name} (${formatBytes(recordedData.clipFile.size)})`
    : `${formatBytes(recordedData.clipSizeBytes)} aufgenommen`;
  const clipLimitNotice = clipLimitExceeded
    ? `Maximale Dateigröße überschritten (${formatBytes(maxClipBytes)}). Bitte kürzer aufnehmen.`
    : `Video wird zusammen mit den Landmarks gespeichert (Limit ${formatBytes(maxClipBytes)}).`;
  const metadataError = metadataReady
    ? ''
    : 'Bitte trage Profil-ID und Gestenlabel ein, bevor du eine Aufnahme startest oder hochlädst.';
  const uploadDisabled = clipLimitExceeded || !metadataReady || !hasLiveFrames;
  const showDetectorStart = !isRecording && (status === 'stopped' || status === 'error');
  const detectorStartLabel = status === 'error' ? 'Kamera erneut versuchen' : 'Kamera starten';

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

      {detectorInactiveNotice && (
        <div className={`notice ${detectorRunning ? 'info' : 'warning'}`}>
          <strong>Detektor pausiert.</strong> {detectorInactiveNotice}
        </div>
      )}

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
              <p className="muted small">Clip: {clipStatus}</p>
              {recordedData.clipDurationMs > 0 && (
              <p className="muted small">Dauer: {(recordedData.clipDurationMs / 1000).toFixed(1)}s</p>
            )}
            {recordedData.clipError && <div className="notice error">{recordedData.clipError}</div>}
            {!metadataReady && <div className="notice error">{metadataError}</div>}
            <div className={`notice ${clipLimitExceeded ? 'warning' : 'info'} spaced`}>
              {clipLimitNotice}
            </div>
            {!hasLiveFrames && (
              <div className="notice warning spaced">
                <strong>Keine Live-Frames.</strong> Die Kamera liefert noch keine Erkennungsergebnisse, daher bleiben Framezähler
                und Standbilder leer. Bitte starte die Kamera oder richte sie aus.
              </div>
            )}
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
            {showDetectorStart && (
              <button className="secondary" onClick={() => startCamera()}>
                {detectorStartLabel}
              </button>
            )}
            {status === 'running' && !isRecording && !hasRecording && (
              <button className="primary" onClick={handleStartRecording} disabled={!metadataReady}>
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
                <button className="primary" onClick={handleSaveRecording} disabled={uploadDisabled}>
                  Aufnahme verwenden
                </button>
                <button className="ghost" onClick={handleDiscardRecording}>
                  Verwerfen
                </button>
                <button className="ghost" onClick={handleSaveLandmarkJson}>
                  Landmarks speichern
                </button>
                {uploadDisabled && !hasLiveFrames && (
                  <p className="muted small">Upload gesperrt, bis Live-Frames eintreffen.</p>
                )}
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
