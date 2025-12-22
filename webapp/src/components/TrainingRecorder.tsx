import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignLanguageDetector } from '../hooks/useSignLanguageDetector';
import { useTrainingRecorder } from '../hooks/useTrainingRecorder';
import type { TrainingBundlePayload, HandFocus } from '../training/types';
import { framesHaveHandLandmarks, suggestHandFocus } from '../training/handUtils';

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
  const isMountedRef = useRef(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingStartTimeRef = useRef<number | null>(null);
  const [manualStillFile, setManualStillFile] = useState<File | null>(null);
  const [needsStillConfirmation, setNeedsStillConfirmation] = useState(false);
  const [detectorStartFeedback, setDetectorStartFeedback] = useState('');
  const [photoMode, setPhotoMode] = useState<'idle' | 'previewing' | 'captured'>('idle');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(() => {
    try {
      const persisted = window.localStorage.getItem('cameraFacingMode');
      return persisted === 'user' || persisted === 'environment' ? persisted : 'user';
    } catch {
      // localStorage might be disabled (e.g., in private browsing)
      return 'user';
    }
  });
  const isMirroredPreview = facingMode === 'user';
  const [handFocus, setHandFocus] = useState<HandFocus>('both_equal');
  const [handFocusSuggestion, setHandFocusSuggestion] = useState<ReturnType<typeof suggestHandFocus> | null>(null);
  const metadataReady = profileId.trim().length > 0 && label.trim().length > 0;
  const metadataError = metadataReady
    ? ''
    : 'Bitte trage Profil-ID und Gebärden-Name ein, bevor du eine Aufnahme startest oder hochlädst.';

  const cameraSupported = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    (window as any).__facingMode = facingMode;
    (window as any).__mirrorOverlay = isMirroredPreview;
  }, [facingMode, isMirroredPreview]);

  const { start: startCamera, stop: stopCamera, status, error: cameraError, lastLandmarks } = useSignLanguageDetector(
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
    previewLandmarks,
    previewHandedness,
    previewPoseLandmarks,
    previewFaceLandmarks,
    lastFrameReceivedAt,
  } = useTrainingRecorder(videoRef);

  // Auto-start camera when metadata is ready and detector is idle/stopped
  useEffect(() => {
    if (!cameraSupported || !metadataReady) {
      return;
    }
    if (status === 'idle' || status === 'stopped') {
      startCamera();
    }
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

  const handleStartRecording = useCallback(async () => {
    if (!metadataReady) {
      setDetectorStartFeedback(metadataError);
      return;
    }
    setDetectorStartFeedback('');
    if (status !== 'running') {
      setDetectorStartFeedback('Detektor wird gestartet…');
      const started = await startCamera();
      if (!started) {
        setDetectorStartFeedback(
          cameraError ??
            'Kamera konnte nicht gestartet werden. Bitte erlaube den Zugriff und versuche es erneut.',
        );
        return;
      }
      setDetectorStartFeedback('Detektor gestartet. Aufnahme bereit.');
    }
    startRecording();
  }, [cameraError, metadataError, metadataReady, startCamera, startRecording, status]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    // Auto-suggest hand focus based on recorded motion after stopping
    if (recordedData.frames.length > 1) {
      const suggestion = suggestHandFocus(recordedData.frames);
      setHandFocusSuggestion(suggestion);
      // Only auto-apply if high confidence and different from current selection
      if (suggestion.confidence === 'high' && suggestion.suggestion !== handFocus) {
        setHandFocus(suggestion.suggestion);
      }
    }
  }, [stopRecording, recordedData.frames, handFocus]);

  const finalizeSaveRecording = useCallback(
    async () => {
      if (!metadataReady) {
        return;
      }
      if (recordedData.frames.length === 0) {
        return;
      }

      const hasHandLandmarks = framesHaveHandLandmarks(recordedData.frames);
      setNeedsStillConfirmation(false);
      if (!hasHandLandmarks) {
        setDetectorStartFeedback('Keine Hand-Landmarks erkannt. Bitte nimm die Gebärde erneut mit sichtbaren Händen auf.');
        return;
      }

      setDetectorStartFeedback('');

      // Convert still image to File if available
      let stillFile: File | null = null;
      if (manualStillFile) {
        stillFile = manualStillFile;
      } else if (recordedData.stillImage) {
        try {
          const response = await fetch(recordedData.stillImage);
          const blob = await response.blob();
          stillFile = new File([blob], 'still.jpg', { type: blob.type || 'image/jpeg' });
        } catch (error) {
          console.warn('Failed to convert still image to File', error);
        }
      }

      const clipBytes = recordedData.clipFile?.size ?? (recordedData.clipSizeBytes > 0 ? recordedData.clipSizeBytes : undefined);
      const clipMimeType = recordedData.clipFile?.type;
      const stillBytes = stillFile?.size;
      const stillMimeType = stillFile?.type;
      const recording = {
        ...(recordedData.frameCount > 0 ? { frameCount: recordedData.frameCount } : {}),
        ...(recordedData.clipDurationMs > 0 ? { clipDurationMs: recordedData.clipDurationMs } : {}),
        ...(typeof clipBytes === 'number' ? { clipBytes } : {}),
        ...(clipMimeType ? { clipMimeType } : {}),
        ...(typeof stillBytes === 'number' ? { stillBytes } : {}),
        ...(stillMimeType ? { stillMimeType } : {}),
      };

      const payload: TrainingBundlePayload = {
        profileId: profileId.trim(),
        label: label.trim(),
        frames: recordedData.frames,
        capturedAt: new Date().toISOString(),
        source: 'web://mediapipe',
        stillFile,
        clipFile: recordedData.clipFile,
        handFocus,
        ...(Object.keys(recording).length > 0 ? { recording } : {}),
      };

      onRecordingComplete(payload);
      resetRecording();
      setManualStillFile(null);
    },
    [
      metadataReady,
      recordedData,
      profileId,
      label,
      onRecordingComplete,
      resetRecording,
      manualStillFile,
      handFocus,
    ],
  );

  const handleSaveRecording = useCallback(() => {
    if (!metadataReady || recordedData.frames.length === 0 || clipLimitExceeded) {
      return;
    }

    if (!manualStillFile && recordedData.stillImage) {
      setNeedsStillConfirmation(true);
      setDetectorStartFeedback('Bestätige, ob du das letzte Videoframe als Referenz nutzen möchtest.');
      return;
    }

    if (!manualStillFile && !recordedData.stillImage) {
      setNeedsStillConfirmation(false);
      setDetectorStartFeedback('Bitte wähle ein Referenzbild aus, bevor du die Aufnahme verwendest.');
      return;
    }

    void finalizeSaveRecording();
  }, [clipLimitExceeded, finalizeSaveRecording, manualStillFile, metadataReady, recordedData]);

  const handleConfirmAutoStill = useCallback(() => {
    void finalizeSaveRecording();
  }, [finalizeSaveRecording]);

  const handleCancelAutoStill = useCallback(() => {
    setNeedsStillConfirmation(false);
    setDetectorStartFeedback('');
  }, []);

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
    setManualStillFile(null);
    setNeedsStillConfirmation(false);
    setDetectorStartFeedback('');
  }, [resetRecording]);

  const handleManualStillChange = useCallback(
    (file: File | null) => {
      setManualStillFile(file);
      if (file) {
        setNeedsStillConfirmation(false);
        setDetectorStartFeedback('');
      }
    },
    [],
  );

  const handleStartPhotoPreview = useCallback(async () => {
    if (!cameraSupported) {
      setDetectorStartFeedback('Kamera wird nicht unterstützt. Bitte wähle stattdessen ein Bild aus.');
      return;
    }

    if (status !== 'running') {
      setDetectorStartFeedback('Kamera wird gestartet…');
      const started = await startCamera();
      if (!started) {
        setDetectorStartFeedback(
          cameraError ?? 'Kamera konnte nicht gestartet werden. Bitte erlaube den Zugriff und versuche es erneut.',
        );
        return;
      }
    }

    setPhotoMode('previewing');
    setDetectorStartFeedback('Vorschau aktiv. Positioniere dich und klicke "Foto aufnehmen".');
  }, [cameraError, cameraSupported, startCamera, status]);

  const handleCapturePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setDetectorStartFeedback('Kamera noch nicht bereit. Bitte warte einen Moment.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setDetectorStartFeedback('Bild konnte nicht aufgenommen werden. Bitte versuche es erneut.');
      return;
    }

    if (isMirroredPreview) {
      // Flip horizontally to match the mirrored selfie preview
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Reset transformation matrix
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));

    if (!blob) {
      setDetectorStartFeedback('Bild konnte nicht aufgenommen werden. Bitte versuche es erneut.');
      return;
    }

    const capturedFile = new File([blob], 'referenzbild.jpg', { type: blob.type || 'image/jpeg' });
    setManualStillFile(capturedFile);
    setPhotoMode('captured');
    setNeedsStillConfirmation(false);
    setDetectorStartFeedback('Foto aufgenommen. Bestätige oder nimm ein neues auf.');
  }, [isMirroredPreview]);

  const handleConfirmPhoto = useCallback(() => {
    setPhotoMode('idle');
    setDetectorStartFeedback('Foto als Referenzbild übernommen.');
  }, []);

  const handleCancelPhoto = useCallback(() => {
    setPhotoMode('idle');
    setManualStillFile(null);
    setDetectorStartFeedback('');
  }, []);

  const handleSwitchCamera = useCallback(async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    
    // Persist to localStorage
    try {
      window.localStorage.setItem('cameraFacingMode', newFacingMode);
    } catch {
      // localStorage might be disabled
    }
    
    // Update component state, which will trigger an effect to update window globals
    setFacingMode(newFacingMode);
    
    // Stop and restart camera with new facing mode if it's currently running
    if (status === 'running') {
      setDetectorStartFeedback('Kamera wird gewechselt…');
      
      // Stop the current camera first
      await stopCamera();
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Start with new facing mode
      const started = await startCamera();
      if (started) {
        if (isMountedRef.current) {
          setDetectorStartFeedback(
            newFacingMode === 'user' 
              ? 'Frontkamera aktiviert' 
              : 'Rückkamera aktiviert'
          );
        }
      } else {
        if (isMountedRef.current) {
          setDetectorStartFeedback(
            cameraError ?? 'Kamera konnte nicht gewechselt werden. Bitte versuche es erneut.'
          );
        }
        // Revert facing mode if switch failed
        try {
          window.localStorage.setItem('cameraFacingMode', facingMode);
        } catch {
          // localStorage might be disabled
        }
        (window as any).__facingMode = facingMode;
        if (isMountedRef.current) {
          setFacingMode(facingMode);
        }
      }
    }
  }, [cameraError, facingMode, startCamera, stopCamera, status]);

  const [manualStillPreviewUrl, setManualStillPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!manualStillFile) {
      setManualStillPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(manualStillFile);
    setManualStillPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [manualStillFile]);

  const detectorRunning = status === 'running';
  const hasLiveFrames = detectorRunning && lastLandmarks.length > 0;
  const latestHandCount = useMemo(
    () => previewLandmarks.filter((hand) => Array.isArray(hand) && hand.length > 0).length,
    [previewLandmarks],
  );
  const latestPointCount = useMemo(
    () =>
      previewLandmarks.reduce((total, hand) => (Array.isArray(hand) ? total + hand.length : total), 0),
    [previewLandmarks],
  );
  const poseLandmarksAvailable = previewPoseLandmarks.length > 0;
  const faceLandmarksAvailable = previewFaceLandmarks.length > 0;
  const handLandmarksAvailable = latestHandCount > 0;
  const detectorInactiveNotice = !detectorRunning
    ? 'Die Kameraerkennung ist angehalten. Starte sie erneut, damit Frames und Standbilder gesammelt werden.'
    : !hasLiveFrames
    ? 'Es kommen noch keine Live-Frames an. Positioniere dich vor der Kamera oder warte einen Moment.'
    : '';
  const showModalityGuidance = detectorRunning && lastFrameReceivedAt !== null;
  const modalityNotices = showModalityGuidance
    ? [
        !handLandmarksAvailable
          ? 'Bitte halte beide Hände sichtbar im Kamerabild.'
          : null,
        !poseLandmarksAvailable
          ? 'Bitte halte deinen Oberkörper im Bild, damit Pose-Landmarks erkannt werden.'
          : null,
        !faceLandmarksAvailable
          ? 'Bitte halte dein Gesicht im Bild, damit Gesichts-Landmarks erkannt werden.'
          : null,
      ].filter((message): message is string => Boolean(message))
    : [];

  const isRecording = state === 'recording';
  const hasRecording = state === 'idle' && recordedData.frames.length > 0;
  const clipStatus = recordedData.clipFile
    ? `${recordedData.clipFile.name} (${formatBytes(recordedData.clipFile.size)})`
    : `${formatBytes(recordedData.clipSizeBytes)} aufgenommen`;
  const clipLimitNotice = clipLimitExceeded
    ? `Maximale Dateigröße überschritten (${formatBytes(maxClipBytes)}). Bitte kürzer aufnehmen.`
    : `Video wird zusammen mit den Landmarks gespeichert (Limit ${formatBytes(maxClipBytes)}).`;
  const uploadDisabled = clipLimitExceeded || !metadataReady || recordedData.frames.length === 0;
  const uploadDisabledReason = !metadataReady
    ? 'Upload gesperrt, bis Profil-ID und Gebärden-Name ausgefüllt sind.'
    : recordedData.frames.length === 0
    ? 'Upload gesperrt, da keine aufgenommenen Frames vorhanden sind.'
    : clipLimitExceeded
    ? 'Upload gesperrt, weil die maximale Dateigröße überschritten wurde.'
    : '';
  const showDetectorStart = !isRecording && status !== 'running';
  const detectorStartDisabled = status === 'initializing';
  const detectorStartLabel = status === 'error' ? 'Kamera erneut versuchen' : status === 'initializing' ? 'Startet…' : 'Kamera starten';
  const displayedLabel = label.trim() || 'Keine Gebärdenauswahl vorhanden';
  const detectorStatusLabel =
    status === 'running'
      ? 'Detektor gestartet'
      : status === 'initializing'
      ? 'Detektor startet…'
      : status === 'error'
      ? 'Detektorfehler'
      : 'Detektor pausiert';
  const detectorStatusTone = status === 'running' ? 'running' : status === 'error' ? 'error' : 'idle';
  const recordingStatusLabel = isRecording
    ? 'Aufnahme läuft'
    : hasRecording
    ? 'Aufnahme bereit'
    : 'Keine Aufnahme aktiv';
  const framesLine = framesCaptured > 0
    ? `${framesCaptured} Frames erfasst`
    : detectorRunning
    ? 'Noch keine verwertbaren Frames empfangen'
    : 'Kamera noch nicht gestartet';

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Aufnahme</p>
          <h2>Gebärde aufzeichnen</h2>
          <p className="muted">
            Nimm deine Gebärde mit der Kamera auf. Die Handbewegungen werden automatisch erkannt und gespeichert.
          </p>
        </div>
      </div>

      <div className="detector-shell">
        <div className="video-column">
          <div className="video-wrapper">
            <video
              ref={videoRef}
              className={`video${isMirroredPreview ? ' mirrored' : ''}`}
              playsInline
              muted
              autoPlay
            />
            <canvas
              ref={overlayRef}
              className={`overlay${showOverlay ? '' : ' overlay-hidden'}`}
              data-testid="overlay-canvas"
              aria-hidden={!showOverlay}
            />
            <div className="video-veil" aria-hidden="true" />

            <div className="video-hud">
              <div className="hud-row">
                <div
                  className="status-chip"
                  data-testid="status-chip"
                  data-state={
                    photoMode === 'previewing'
                      ? 'running'
                      : photoMode === 'captured'
                      ? 'success'
                      : isRecording
                      ? 'running'
                      : hasRecording
                      ? 'success'
                      : detectorStatusTone
                  }
                >
                  {photoMode === 'previewing'
                    ? 'Fotovorschau aktiv'
                    : photoMode === 'captured'
                    ? 'Foto aufgenommen'
                    : isRecording
                    ? `Aufnahme läuft (${formatRecordingTime(recordingDuration)})`
                    : hasRecording
                    ? 'Aufnahme bereit'
                    : detectorStatusLabel}
                </div>
                <div className="hud-actions">
                  {photoMode === 'idle' && (
                    <>
                      {showDetectorStart && (
                        <button
                          className="primary"
                          onClick={startCamera}
                          disabled={!cameraSupported || detectorStartDisabled}
                        >
                          {detectorStartLabel}
                        </button>
                      )}
                      {!isRecording && !hasRecording && (
                        <>
                          <button
                            className="primary"
                            onClick={handleStartRecording}
                            disabled={!metadataReady || status === 'initializing'}
                          >
                            Aufnahme starten
                          </button>
                          <button
                            className="secondary"
                            onClick={handleStartPhotoPreview}
                            disabled={!cameraSupported || !metadataReady}
                          >
                            Foto mit Kamera
                          </button>
                        </>
                      )}
                      {isRecording && (
                        <button className="primary" onClick={handleStopRecording}>
                          Aufnahme stoppen
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
                        </>
                      )}
                    </>
                  )}
                  {photoMode === 'previewing' && (
                    <>
                      <button className="primary" onClick={handleCapturePhoto}>
                        Foto aufnehmen
                      </button>
                      <button className="ghost" onClick={handleCancelPhoto}>
                        Abbrechen
                      </button>
                    </>
                  )}
                  {photoMode === 'captured' && (
                    <>
                      <button className="primary" onClick={handleConfirmPhoto}>
                        Foto verwenden
                      </button>
                      <button className="secondary" onClick={handleCapturePhoto}>
                        Erneut aufnehmen
                      </button>
                      <button className="ghost" onClick={handleCancelPhoto}>
                        Verwerfen
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="hud-row meta">
                <div className="hud-meta">
                  <p className="muted no-margin">
                    Profil: <strong>{profileId || '–'}</strong>
                  </p>
                  <p className="muted no-margin">
                    Gebärde: <strong>{displayedLabel}</strong>
                  </p>
                  <p className="muted small no-margin">{framesLine}</p>
                </div>
                <div className="hud-controls">
                  <button
                    className="ghost-inline"
                    onClick={handleSwitchCamera}
                    disabled={!cameraSupported}
                    title={facingMode === 'user' ? 'Zur Rückkamera wechseln' : 'Zur Frontkamera wechseln'}
                  >
                    {facingMode === 'user' ? '🔄 Rückkamera' : '🔄 Frontkamera'}
                  </button>
                  <div className="toggle ghost-inline">
                    <input
                      id="overlay-toggle"
                      type="checkbox"
                      checked={showOverlay}
                      onChange={(event) => setShowOverlay(event.target.checked)}
                    />
                    <label htmlFor="overlay-toggle">Overlay anzeigen</label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="notice-grid" aria-live="polite" role="status">
            {!detectorRunning && (
              <p className="muted small no-margin">
                Detektor ist nicht gestartet – Frames werden erst gezählt, wenn die Kamera läuft.
              </p>
            )}

            {!cameraSupported && (
              <div className="notice warning compact">
                <strong>Kamera nicht verfügbar.</strong> Bitte erlaube den Kamerazugriff oder nutze ein Gerät mit Webcam.
              </div>
            )}

            {cameraError && <div className="notice error compact">{cameraError}</div>}

            {detectorInactiveNotice && (
              <div className={`notice ${detectorRunning ? 'info' : 'warning'} compact`}>
                <strong>{detectorRunning ? 'Detektor aktiv, noch keine Erkennung' : 'Detektor pausiert.'}</strong>{' '}
                {detectorInactiveNotice}
              </div>
            )}

            {detectorStartFeedback && (
              <div className={`notice ${detectorRunning ? 'info' : 'warning'} compact`}>{detectorStartFeedback}</div>
            )}

            {modalityNotices.length > 0 && (
              <div className="notice warning compact">
                <strong>Hinweis zur Erkennung:</strong>
                <ul>
                  {modalityNotices.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}

            {needsStillConfirmation && (
              <div className="notice info compact">
                <p className="no-margin">
                  Kein Referenzbild ausgewählt. Möchtest du das letzte Videoframe als Referenz nutzen?
                </p>
                <div className="hud-actions">
                  <button className="primary" type="button" onClick={handleConfirmAutoStill}>
                    Ja, Frame verwenden
                  </button>
                  <button className="ghost" type="button" onClick={handleCancelAutoStill}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-row">
            <div>
              <p className="eyebrow">Aufnahmedetails</p>
              <p className="muted small">Detektor: {detectorStatusLabel}</p>
              <p className="muted small">Aufnahmestatus: {recordingStatusLabel}</p>
              <p className="muted small">Clip: {clipStatus}</p>
              {recordedData.clipDurationMs > 0 && (
                <p className="muted small">Dauer: {(recordedData.clipDurationMs / 1000).toFixed(1)}s</p>
              )}
              {recordedData.clipError && <div className="notice error">{recordedData.clipError}</div>}
              {!metadataReady && <div className="notice error">{metadataError}</div>}
              <div className="notice info spaced">
                <strong>Landmark-Stream</strong>{' '}
                {latestHandCount > 0
                  ? `${latestHandCount} Hand${latestHandCount > 1 ? 'e' : ''} · ${latestPointCount} Punkte`
                  : 'Noch keine Landmarken empfangen'}
                {lastFrameReceivedAt && (
                  <>
                    {' '}
                    · Letzter Batch um {new Date(lastFrameReceivedAt).toLocaleTimeString()}
                  </>
                )}
                {previewHandedness.length > 0 && (
                  <p className="muted small">
                    Händigkeit:{' '}
                    {previewHandedness
                      .map((value) => (value === 'Left' ? 'links' : value === 'Right' ? 'rechts' : value))
                      .join(', ')}
                  </p>
                )}
              </div>
              <div className={`notice ${clipLimitExceeded ? 'warning' : 'info'} spaced`}>
                {clipLimitNotice}
              </div>
            </div>
          </div>

          <div className="controls">
            {hasRecording && (
              <>
                <button className="ghost" onClick={handleSaveLandmarkJson}>
                  Landmarks speichern
                </button>
                {uploadDisabledReason && <p className="muted small">{uploadDisabledReason}</p>}
              </>
            )}
          </div>

          <div className="form-group mt-sm">
            <label htmlFor="hand-focus">Relevante Hand für diese Gebärde</label>
            <div className="radio-group" role="radiogroup" aria-label="Handauswahl">
              <label className={`radio-label${handFocus === 'both_equal' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="hand-focus"
                  value="both_equal"
                  checked={handFocus === 'both_equal'}
                  onChange={() => setHandFocus('both_equal')}
                />
                <span>Beide Hände gleich</span>
              </label>
              <label className={`radio-label${handFocus === 'dominant_only' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="hand-focus"
                  value="dominant_only"
                  checked={handFocus === 'dominant_only'}
                  onChange={() => setHandFocus('dominant_only')}
                />
                <span>Nur Haupthand</span>
              </label>
              <label className={`radio-label${handFocus === 'both_asymmetric' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="hand-focus"
                  value="both_asymmetric"
                  checked={handFocus === 'both_asymmetric'}
                  onChange={() => setHandFocus('both_asymmetric')}
                />
                <span>Beide unterschiedlich</span>
              </label>
              <label className={`radio-label${handFocus === 'either_hand' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="hand-focus"
                  value="either_hand"
                  checked={handFocus === 'either_hand'}
                  onChange={() => setHandFocus('either_hand')}
                />
                <span>Egal welche Hand</span>
              </label>
            </div>
            {handFocusSuggestion && (
              <div className={`notice ${handFocusSuggestion.confidence === 'high' ? 'info' : 'warning'} compact mt-sm`}>
                <strong>Automatische Erkennung:</strong> {handFocusSuggestion.reason}
              </div>
            )}
            <p className="muted small">
              Wähle, welche Hand für diese Gebärde wichtig ist. Bei einigen Gebärden (z.B. „Papa") zählt nur die Haupthand – die andere kann Rauschen erzeugen.
            </p>
          </div>

          <div className="form-group mt-sm">
            <label htmlFor="manual-still">Eigenes Referenzbild hochladen (optional)</label>
            <div className="file-input">
              <input
                id="manual-still"
                type="file"
                accept="image/*"
                onChange={(event) => handleManualStillChange(event.target.files?.[0] ?? null)}
              />
              <p className="muted small">
                {manualStillFile?.name || 'Wähle ein Bild aus deinen Dateien aus.'}
              </p>
            </div>
            <p className="muted small">
              Nutze "Foto mit Kamera" im Videobereich oder lade eine Datei hoch. Falls nichts ausgewählt ist, wirst du beim Abschluss gefragt, ob du das letzte Videoframe nutzen möchtest.
            </p>
          </div>

          {(recordedData.stillImage || manualStillPreviewUrl) && (
            <div className="still-preview">
              <p className="eyebrow">Vorschau</p>
              <img
                src={manualStillPreviewUrl ?? recordedData.stillImage ?? undefined}
                alt={manualStillPreviewUrl ? 'Hochgeladenes Referenzbild' : 'Aufgenommene Gebärde'}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
