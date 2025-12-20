import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGestureDetector } from '../hooks/useGestureDetector';
import { useAppState } from '../hooks/useAppState';
import { useMlpModelInjection } from '../hooks/useMlpModelInjection';
import { audioService } from '../services/audioService';
import { gestureMeaningService } from '../services/gestureMeaningService';

function formatStatusLabel(status: string): string {
  switch (status) {
    case 'initializing':
      return 'Kamera wird vorbereitet…';
    case 'running':
      return 'Ich höre zu…';
    case 'stopped':
      return 'Kamera pausiert';
    case 'error':
      return 'Kamera nicht bereit';
    default:
      return 'Bereit für die Kamera';
  }
}

function toTitleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function GestureRecorder() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(() => {
    try {
      const persisted = window.localStorage.getItem('cameraFacingMode');
      return persisted === 'user' || persisted === 'environment' ? persisted : 'user';
    } catch {
      return 'user';
    }
  });
  const isMirroredPreview = facingMode === 'user';
  const [cameraSwitchFeedback, setCameraSwitchFeedback] = useState('');
  const cameraSupported = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  useEffect(() => {
    (window as any).__facingMode = facingMode;
    (window as any).__mirrorOverlay = isMirroredPreview;
  }, [facingMode, isMirroredPreview]);

  const {
    start,
    stop,
    status,
    error,
    lastGesture,
    lastConfidence,
  } = useGestureDetector(videoRef, overlayRef);
  const { profileId, preferredGestureLabel, recordGesture } = useAppState();
  const { notice: modelNotice } = useMlpModelInjection(profileId);
  const hasAttemptedAutoStart = useRef(false);

  // Auto-start camera when component mounts and camera is supported
  useEffect(() => {
    if (cameraSupported && status === 'idle' && !hasAttemptedAutoStart.current) {
      start().then((success) => {
        if (success) {
          hasAttemptedAutoStart.current = true;
        }
      });
    }
  }, [cameraSupported, status, start]);

  useEffect(() => {
    if (lastGesture) {
      recordGesture(lastGesture);
    }
  }, [lastGesture, recordGesture]);

  const normalizedGesture = lastGesture?.trim() ?? '';
  const gestureKey = normalizedGesture ? normalizedGesture.toLowerCase() : '';
  const gestureMeaning = gestureKey ? gestureMeaningService.getMeaning(gestureKey) : undefined;
  const gestureLabel = gestureKey
    ? gestureMeaning?.label ?? toTitleCase(normalizedGesture)
    : null;
  const gestureSpeech = gestureKey
    ? gestureMeaning?.audioText ?? gestureMeaning?.label ?? gestureLabel ?? normalizedGesture
    : '';

  const handleStart = async () => {
    await start();
  };

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
      setCameraSwitchFeedback('Kamera wird gewechselt…');
      
      // Stop the current camera first
      await stop();
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Start with new facing mode
      const started = await start();
      if (started) {
        setCameraSwitchFeedback(
          newFacingMode === 'user' 
            ? 'Frontkamera aktiviert' 
            : 'Rückkamera aktiviert'
        );
        // Clear feedback after 3 seconds
        setTimeout(() => setCameraSwitchFeedback(''), 3000);
      } else {
        setCameraSwitchFeedback('Kamera konnte nicht gewechselt werden. Bitte versuche es erneut.');
        // Revert facing mode if switch failed
        try {
          window.localStorage.setItem('cameraFacingMode', facingMode);
        } catch {
          // localStorage might be disabled
        }
        (window as any).__facingMode = facingMode;
        setFacingMode(facingMode);
      }
    }
  }, [facingMode, start, stop, status]);

  const handleConfirm = useCallback(async () => {
    if (!gestureSpeech) return;
    await audioService.speak(gestureSpeech);
  }, [gestureSpeech]);

  const handleLearn = useCallback(() => {
    navigate('/lernen');
  }, [navigate]);

  const needsCameraStart = status === 'idle' || status === 'stopped' || status === 'error';

  return (
    <section className="gesture-screen">
      <div className="video-wrapper gesture-fullscreen">
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
          aria-hidden={!showOverlay}
        />
        <div className="video-veil" aria-hidden="true" />

        <div className="gesture-screen__hud">
          <div className="gesture-screen__status">
            <div className="gesture-screen__status-pill" data-state={status}>
              <span className="gesture-screen__status-dot" />
              <span>{formatStatusLabel(status)}</span>
            </div>
            {modelNotice && <span className="gesture-screen__pill">{modelNotice}</span>}
          </div>
          <div className="gesture-screen__status-meta">
            <p>
              Profil <strong>{profileId || '…'}</strong> · Standardgeste <strong>{preferredGestureLabel}</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="gesture-screen__controls">
        <div className="gesture-screen__banner">
          {gestureLabel ? (
            <div className="gesture-screen__result">
              <span className="gesture-screen__result-label">{gestureLabel}</span>
              {lastConfidence != null && (
                <span className="gesture-screen__result-confidence">
                  {Math.round(lastConfidence * 100)}% Sicherheit
                </span>
              )}
            </div>
          ) : (
            <span className="gesture-screen__placeholder">Zeige eine Geste in die Kamera…</span>
          )}
        </div>

        {needsCameraStart && (
          <button
            className="gesture-screen__start"
            onClick={handleStart}
            disabled={!cameraSupported}
          >
            Kamera starten
          </button>
        )}

        <div className="gesture-screen__actions">
          <button
            className="gesture-screen__action gesture-screen__action--confirm"
            onClick={handleConfirm}
            disabled={!gestureLabel}
          >
            Stimmt
          </button>
          <button
            className="gesture-screen__action gesture-screen__action--learn"
            onClick={handleLearn}
          >
            Lernen
          </button>
        </div>

        <div className="gesture-screen__meta">
          <div className="gesture-screen__meta-actions">
            <button
              className="ghost-inline"
              onClick={handleSwitchCamera}
              disabled={!cameraSupported}
              title={facingMode === 'user' ? 'Zur Rückkamera wechseln' : 'Zur Frontkamera wechseln'}
            >
              {facingMode === 'user' ? '🔄 Rückkamera' : '🔄 Frontkamera'}
            </button>
            <label className="toggle ghost-inline">
              <input
                id="overlay-toggle"
                type="checkbox"
                checked={showOverlay}
                onChange={(event) => setShowOverlay(event.target.checked)}
              />
              <span>Overlay</span>
            </label>
          </div>

          {cameraSwitchFeedback && (
            <div className="gesture-screen__meta-note">{cameraSwitchFeedback}</div>
          )}
          {!cameraSupported && (
            <div className="gesture-screen__meta-warning">
              Kamera nicht verfügbar. Bitte erlaube den Kamerazugriff oder nutze ein Gerät mit Webcam.
            </div>
          )}
          {error && <div className="gesture-screen__meta-error">{error}</div>}
        </div>
      </div>
    </section>
  );
}
