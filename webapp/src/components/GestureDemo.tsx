import { useEffect, useMemo, useRef, useState } from 'react';
import { useGestureDetector } from '../hooks/useGestureDetector';
import { useAppState } from '../hooks/useAppState';

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
  const cameraSupported = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  const { start, stop, cleanup, status, error, lastGesture, messageLog } = useGestureDetector(
    videoRef,
    overlayRef,
  );
  const { profileId, preferredGestureLabel, recordGesture } = useAppState();

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

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Gestenlabor</p>
          <h2>Browser-Gestenrekorder</h2>
          <p className="muted">
            Diese Ansicht nutzt das WebView-Bundle und spiegelt die Orchestrierung der Expo-App wider. Alle Meldungen werden im
            Browser protokolliert.
          </p>
        </div>
        <div className="status-chip" data-state={status}>
          {formatStatus(status)}
        </div>
      </div>

      <div className="controls">
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

      <div className="notice spaced">
        <p className="muted" style={{ margin: 0 }}>
          Aktives Profil: <strong>{profileId || '…'}</strong> · Standardlabel: <strong>{preferredGestureLabel}</strong>. Das
          Training übernimmt diese Werte automatisch.
        </p>
      </div>

      {!cameraSupported && (
        <div className="notice warning">
          <strong>Kamera nicht verfügbar.</strong> Bitte erlaube den Kamerazugriff oder nutze ein Gerät mit Webcam. Die Gestenlogik
          bleibt aktiv, sendet aber keine Frames.
        </div>
      )}

      {error && <div className="notice error">{error}</div>}

      <div className="detector-shell">
        <div className="video-wrapper">
          <video ref={videoRef} className="video" playsInline muted autoPlay />
          {showOverlay && <canvas ref={overlayRef} className="overlay" />}
        </div>
        <div className="panel">
          <div className="panel-row">
            <div>
              <p className="eyebrow">Letzte Geste</p>
              <p className="value">{lastGesture ?? 'noch keine erkannt'}</p>
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
                  <p>{item.summary}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
