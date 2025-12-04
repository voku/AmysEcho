import { useEffect, useMemo, useRef, useState } from 'react';
import { useGestureDetector } from '../hooks/useGestureDetector';
import { CorrectionPanel } from './CorrectionPanel';
import { useAppState } from '../hooks/useAppState';
import { useMlpModelInjection } from '../hooks/useMlpModelInjection';

function formatStatus(status: string): string {
  switch (status) {
    case 'initializing':
      return 'Initialisierung läuft…';
    case 'running':
      return 'Erkennung aktiv';
    case 'stopped':
      return 'Angehalten';
    case 'error':
      return 'Fehlerzustand';
    default:
      return 'Bereit';
  }
}

export function GestureDemo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showCorrection, setShowCorrection] = useState(false);
  const cameraSupported = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  const {
    start,
    stop,
    cleanup,
    status,
    error,
    lastGesture,
    lastConfidence,
    messageLog,
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

  const handleStart = async () => {
    await start();
  };

  const handleStop = async () => {
    await stop();
  };

  const handleReset = async () => {
    await cleanup();
  };

  const handleCorrection = (originalGesture: string, correctedGesture: string) => {
    console.log(`Korrektur: ${originalGesture} → ${correctedGesture}`);
    setShowCorrection(false);
  };

  return (
    <section className="card gesture-demo">
      <div className="card-header">
        <div>
          <p className="eyebrow">Gestenlabor</p>
          <h2>Browser-Gestenrekorder</h2>
          <p className="muted">
            Diese Ansicht nutzt das WebView-Bundle und spiegelt die Orchestrierung der Expo-App wider. Alle Meldungen werden im
            Browser protokolliert.
          </p>
        </div>
      </div>

      <div className="detector-shell">
        <div className="video-column">
          <div className="video-wrapper">
            <video ref={videoRef} className="video" playsInline muted autoPlay />
            <canvas
              ref={overlayRef}
              className={`overlay${showOverlay ? '' : ' overlay-hidden'}`}
              aria-hidden={!showOverlay}
            />
            <div className="video-veil" aria-hidden="true" />

            <div className="video-hud">
              <div className="hud-row">
                <div className="status-chip" data-state={status}>
                  Live-Status: {formatStatus(status)}
                </div>
                <div className="hud-actions">
                  <button className="primary" onClick={handleStart} disabled={!cameraSupported || status === 'running'}>
                    Kamera starten
                  </button>
                  <button onClick={handleStop} disabled={status !== 'running'}>
                    Aufnahme pausieren
                  </button>
                  <button className="ghost" onClick={handleReset}>
                    Neu aufsetzen
                  </button>
                </div>
              </div>

              <div className="hud-row meta">
                <div className="hud-meta">
                  <p className="muted no-margin">
                    Aktives Profil: <strong>{profileId || '…'}</strong> · Standardlabel: <strong>{preferredGestureLabel}</strong>.
                  </p>
                  {modelNotice && <span className="pill info">{modelNotice}</span>}
                </div>
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

          <div className="notice-grid" aria-live="polite">
            {!cameraSupported && (
              <div className="notice warning compact">
                <strong>Kamera nicht verfügbar.</strong> Bitte erlaube den Kamerazugriff oder nutze ein Gerät mit Webcam. Die Gestenlogik
                bleibt aktiv, sendet aber keine Frames.
              </div>
            )}

            {error && <div className="notice error compact">{error}</div>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-row">
            <div>
              <p className="eyebrow">Letzte Geste</p>
              <p className="value">{lastGesture ?? 'noch keine erkannt'}</p>
            </div>
          </div>

          {/* Correction Panel */}
          {lastGesture && (
            <div className="correction-section">
              <div className="correction-trigger">
                <p className="muted">
                  Erkannt: <strong>{lastGesture}</strong>
                  {lastConfidence != null && ` (${Math.round(lastConfidence * 100)}%)`}
                </p>
                <button className="ghost small" onClick={() => setShowCorrection(!showCorrection)}>
                  {showCorrection ? 'Korrektur ausblenden' : 'War das falsch? Korrigieren'}
                </button>
              </div>
              {showCorrection && (
                <CorrectionPanel 
                  recognizedGesture={lastGesture} 
                  onCorrection={handleCorrection}
                />
              )}
            </div>
          )}

          <div className="log">
            <p className="eyebrow">Live-Meldungen</p>
            <ul>
              {messageLog.length === 0 && <li className="muted">Noch keine Bridge-Nachrichten.</li>}
              {messageLog.map((item) => (
                <li key={item.receivedAt + item.summary}>
                  <div className="log-header">
                    <span className="badge">{item.type}</span>
                    <span className="timestamp">{new Date(item.receivedAt).toLocaleTimeString()}</span>
                  </div>
                  <p>
                    {item.summary}
                    {item.count > 1 && (
                      <span className="badge stacked" aria-label={`${item.count} ähnliche Meldungen zusammengefasst`}>
                        ×{item.count}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
