import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSignLanguageDetector } from '../hooks/useSignLanguageDetector';
import { useAppState } from '../hooks/useAppState';
import { useApiConfig } from '../hooks/useApiConfig';
import { useMlpModelInjection } from '../hooks/useMlpModelInjection';
import { audioService } from '../services/audioService';
import { gestureMeaningService } from '../services/gestureMeaningService';
import { apiRetryManager } from '../services/apiRetryManager';

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

export function SignLanguageRecorder() {
  const navigate = useNavigate();
  const { apiBaseUrl } = useApiConfig();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showRawVideo, setShowRawVideo] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [hasTrainedSigns, setHasTrainedSigns] = useState<boolean | null>(() => {
    try {
      const cached = window.localStorage.getItem('webapp:has-trained-signs');
      return cached ? cached === 'true' : null;
    } catch {
      return null;
    }
  });
  const [trainedSignLabels, setTrainedSignLabels] = useState<string[]>(() => {
    try {
      const cached = window.localStorage.getItem('webapp:trained-sign-labels');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
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
    lastSign,
    lastConfidence,
  } = useSignLanguageDetector(videoRef, overlayRef);
  const { profileId, recordSign } = useAppState();
  const { notice: modelNotice } = useMlpModelInjection(profileId);
  const hasAttemptedAutoStart = useRef(false);

  // Check if profile has trained signs
  useEffect(() => {
    async function checkSigns() {
      if (!profileId) {
        setIsLoadingProfile(false);
        return;
      }
      
      try {
        // We use the new trained-labels endpoint to get specific allowed labels
        const response = await apiRetryManager.fetch(`${apiBaseUrl}/api/v1/dgs/trained-labels?profileId=${profileId}`);
        if (response.ok) {
          const data = await response.json();
          const labels = data.trainedLabels || [];
          setTrainedSignLabels(labels);
          const hasAny = labels.length > 0;
          setHasTrainedSigns(hasAny);
          
          // Cache results
          try {
            window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(labels));
            window.localStorage.setItem('webapp:has-trained-signs', String(hasAny));
          } catch {
            // ignore quota errors
          }
        } else {
          // Endpoint failed; keep cached values to maintain consistent state
          console.warn('trained-labels endpoint returned non-ok status; using cached data');
        }
      } catch (err) {
        console.warn('Failed to check profile signs:', err);
        // On network error, prefer the cached value if it exists
        const cached = window.localStorage.getItem('webapp:has-trained-signs');
        if (cached !== null) {
          setHasTrainedSigns(cached === 'true');
        } else {
          // If no cache, default to false to be safe but allow Demo mode
          setHasTrainedSigns(false);
        }
      } finally {
        setIsLoadingProfile(false);
      }
    }

    checkSigns();
  }, [profileId, apiBaseUrl]);

  // Auto-start camera when component mounts and camera is supported AND we have trained signs
  useEffect(() => {
    if (cameraSupported && status === 'idle' && !hasAttemptedAutoStart.current && hasTrainedSigns === true) {
      start().then((success) => {
        if (success) {
          hasAttemptedAutoStart.current = true;
        }
      });
    }
  }, [cameraSupported, status, start, hasTrainedSigns]);

  const normalizedTrainedSignLabels = useMemo(
    () => new Set(trainedSignLabels.map(label => label.toLowerCase())),
    [trainedSignLabels]
  );

  useEffect(() => {
    if (lastSign) {
      // Only record if it's a trained label (case-insensitive)
      if (normalizedTrainedSignLabels.has(lastSign.toLowerCase())) {
        recordSign(lastSign);
      }
    }
  }, [lastSign, recordSign, normalizedTrainedSignLabels]);

  const normalizedGesture = lastSign?.trim() ?? '';
  const gestureKey = normalizedGesture ? normalizedGesture.toLowerCase() : '';
  
  // Filter prediction: only show if it's in the trained labels list
  const isTrained = useMemo(() => {
    if (!gestureKey) return false;
    return normalizedTrainedSignLabels.has(gestureKey);
  }, [gestureKey, normalizedTrainedSignLabels]);

  const gestureMeaning = (gestureKey && isTrained) ? gestureMeaningService.getMeaning(gestureKey) : undefined;
  const gestureLabel = (gestureKey && isTrained)
    ? gestureMeaning?.label ?? toTitleCase(normalizedGesture)
    : null;
  const gestureSpeech = gestureKey
    ? gestureMeaning?.audioText ?? gestureLabel ?? normalizedGesture
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

  // Loading state
  if (isLoadingProfile) {
    return (
      <section className="gesture-screen gesture-screen--loading">
        <div className="gesture-screen__placeholder">Profil wird geladen…</div>
      </section>
    );
  }

  // Prompt to train if no signs found
  if (hasTrainedSigns === false) {
    return (
      <section className="gesture-screen gesture-screen--empty">
        <div className="gesture-screen__empty-card">
          <span className="gesture-screen__empty-icon">🖐️</span>
          <h2>Bringe mir deine Gebärden bei</h2>
          <p className="gesture-screen__empty-body">
            Um die Gebärdenkamera zu nutzen, musst du mir zuerst mindestens eine Gebärde beibringen.
            So kann ich deine Bewegungen zuverlässig verstehen.
          </p>
          <p className="gesture-screen__empty-body">
            Du kannst direkt starten oder im Demo-Modus weitergehen.
          </p>
          <div className="gesture-screen__empty-actions">
            <Link to="/beibringen" className="primary-button">
              Jetzt Gebärde beibringen
            </Link>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setHasTrainedSigns(true);
                setDemoMode(true);
              }}
            >
              Trotzdem fortfahren (Demo)
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="gesture-screen">
      <div className="video-wrapper gesture-fullscreen">
        <video
          ref={videoRef}
          className={['video', isMirroredPreview && 'mirrored', !showRawVideo && 'video-hidden']
            .filter(Boolean)
            .join(' ')}
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={overlayRef}
          className={`overlay${showOverlay ? '' : ' overlay-hidden'}`}
          aria-hidden={!showOverlay}
        />
        <div className={['video-veil', !showRawVideo && 'video-veil-hidden'].filter(Boolean).join(' ')} aria-hidden="true" />

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
              Profil <strong>{profileId || '…'}</strong>
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
            <span className="gesture-screen__placeholder">
              {demoMode ? 'Demo-Modus: Gestenerkennung deaktiviert' : 'Zeige eine Gebärde in die Kamera…'}
            </span>
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
            Aussprechen
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
            <label className="toggle ghost-inline" htmlFor="raw-video-toggle">
              <input
                id="raw-video-toggle"
                type="checkbox"
                checked={showRawVideo}
                onChange={(event) => setShowRawVideo(event.target.checked)}
              />
              <span>Rohvideo</span>
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
