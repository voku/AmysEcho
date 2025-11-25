import { FormEvent, useCallback, useMemo, useState } from 'react';
import { useTrainingUploader, type UploadState } from '../hooks/useTrainingUploader';
import { frameHasAnyLandmarks } from '../training/handUtils';
import type { TrainingFrame, TrainingBundlePayload } from '../training/types';
import { TrainingRecorder } from './TrainingRecorder';

type LandmarkTuple = [number, number] | [number, number, number];

function isFrameLike(value: unknown): value is { landmarks: unknown; handedness?: unknown } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Object.prototype.hasOwnProperty.call(value, 'landmarks'),
  );
}

function toLandmarkTuple(candidate: unknown): LandmarkTuple | null {
  if (!Array.isArray(candidate)) return null;
  const coords = candidate
    .map((value) => (typeof value === 'number' ? value : Number(value)))
    .filter((value) => Number.isFinite(value));

  if (coords.length === 2 || coords.length === 3) {
    return coords as LandmarkTuple;
  }

  return null;
}

function normalizeLandmarks(raw: unknown): LandmarkTuple[][] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((hand) => {
      if (!Array.isArray(hand)) return [] as LandmarkTuple[];
      const validPoints: LandmarkTuple[] = [];
      hand.forEach((point) => {
        const coords = toLandmarkTuple(point);
        if (coords) {
          validPoints.push(coords);
        }
      });
      return validPoints;
    })
    .filter((hand) => hand.length > 0);
}

function parseFrames(raw: unknown): TrainingFrame[] {
  const frames = Array.isArray((raw as { frames?: unknown })?.frames)
    ? ((raw as { frames: unknown[] }).frames ?? [])
    : Array.isArray(raw)
    ? (raw as unknown[])
    : [];

  const collected: TrainingFrame[] = [];
  frames.forEach((entry) => {
    if (isFrameLike(entry)) {
      const landmarks = normalizeLandmarks(entry.landmarks);
      if (landmarks.length === 0) return;
      const handedness = Array.isArray(entry.handedness)
        ? entry.handedness.filter((h) => typeof h === 'string')
        : [];
      collected.push({ landmarks, handedness });
      return;
    }
    if (Array.isArray(entry)) {
      const landmarks = normalizeLandmarks(entry);
      if (landmarks.length > 0) {
        collected.push({ landmarks });
      }
    }
  });

  return collected.filter((frame) => frameHasAnyLandmarks(frame.landmarks));
}

export interface TrainingUploadProps {
  profileId: string;
  setProfileId: (id: string) => void;
  label: string;
  setLabel: (label: string) => void;
}

export function TrainingUpload({ profileId, setProfileId, label, setLabel }: TrainingUploadProps) {
  const [capturedAt, setCapturedAt] = useState(() => new Date().toISOString());
  const [frames, setFrames] = useState<TrainingFrame[]>([]);
  const [framesFileName, setFramesFileName] = useState<string>('');
  const [clipFile, setClipFile] = useState<File | null>(null);
  const [stillFile, setStillFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>('');
  const { upload, state, lastResult, error, queuedCount, syncQueued, syncing, syncError, lastQueuedKey } =
    useTrainingUploader();

  const statusText: Record<UploadState, string> = {
    idle: 'Bereit',
    preparing: 'Paket wird erstellt…',
    uploading: 'Upload läuft…',
    success: 'Upload erfolgreich',
    queued: 'Warteschlange aktiv',
    error: 'Fehler beim Upload',
  };

  const statusAppearance: Record<UploadState, 'idle' | 'running' | 'success' | 'error'> = {
    idle: 'idle',
    preparing: 'running',
    uploading: 'running',
    success: 'success',
    queued: 'running',
    error: 'error',
  };

  const frameSummary = useMemo(() => {
    if (frames.length === 0) return 'Keine verwertbaren Frames geladen.';
    return `${frames.length} Frames mit Landmarken geladen`;
  }, [frames]);

  const handleFramesFile = useCallback(async (file: File | null) => {
    setMessage('');
    if (!file) {
      setFrames([]);
      setFramesFileName('');
      return;
    }
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      setMessage('JSON konnte nicht gelesen werden.');
      setFrames([]);
      setFramesFileName(file.name);
      return;
    }
    const nextFrames = parseFrames(parsed);
    setFrames(nextFrames);
    setFramesFileName(file.name);
    setMessage('');
  }, []);

  const handleSyncQueued = useCallback(async () => {
    setMessage('Warteschlange wird synchronisiert…');
    try {
      const uploaded = await syncQueued();
      setMessage(
        uploaded > 0
          ? `Synchronisierung abgeschlossen (${uploaded} Paket(e) übertragen).`
          : 'Keine Pakete in der Warteschlange gefunden.',
      );
    } catch (syncErr) {
      const reason = syncErr instanceof Error ? syncErr.message : String(syncErr);
      setMessage(`Synchronisierung fehlgeschlagen: ${reason}`);
    }
  }, [syncQueued]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (frames.length === 0) {
        setMessage('Bitte lade zuerst Landmark-Daten hoch.');
        return;
      }
      setMessage('Paket wird erstellt und hochgeladen…');
      try {
        await upload({
          profileId,
          label,
          frames,
          capturedAt,
          source: 'web://mediapipe',
          clipFile,
          stillFile,
        });
        setMessage('Upload abgeschlossen. Vielen Dank für die neuen Trainingsdaten!');
      } catch (uploadError) {
        const reason = uploadError instanceof Error ? uploadError.message : String(uploadError);
        setMessage(`Upload fehlgeschlagen: ${reason}`);
      }
    },
    [capturedAt, clipFile, frames, label, profileId, stillFile, upload],
  );

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Training</p>
          <h2>Gestenpaket hochladen</h2>
          <p className="muted">
            Lädt ein ZIP-Paket nach dem App-Vorbild hoch ({'metadata.json'}, {'landmarks.json'}, optional Video/Standbild).
            Ideal für Test-Bundles oder QA im Browser.
          </p>
        </div>
        <div className="status-chip" data-state={statusAppearance[state]}>
          {statusText[state]}
        </div>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="profile">Profil-ID</label>
          <input
            id="profile"
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            required
          />
          <p className="muted small">Verknüpft das Bundle mit einem Profil (z. B. aus dem Server-Dataset).</p>
        </div>
        <div className="form-group">
          <label htmlFor="label">Gestenlabel</label>
          <input id="label" value={label} onChange={(event) => setLabel(event.target.value)} required />
          <p className="muted small">Muss einem bekannten Gestenbegriff entsprechen (z. B. „HILFE“).</p>
        </div>
        <div className="form-group">
          <label htmlFor="captured">Aufnahmedatum</label>
          <input id="captured" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} />
          <p className="muted small">ISO-8601, wird sonst automatisch gesetzt.</p>
        </div>

        <div className="training-grid">
          <div className="panel">
            <p className="eyebrow">Landmarks</p>
            <p className="muted">
              Erwartet ein JSON mit Array an Frames oder ein Objekt mit <code>{'{ frames: [] }'}</code>.
            </p>
            <div className="file-input">
              <input
                type="file"
                accept="application/json"
                onChange={(event) => handleFramesFile(event.target.files?.[0] ?? null)}
              />
              <p className="muted small">{framesFileName || 'Noch keine Datei gewählt'}</p>
            </div>
            <p className="value">{frameSummary}</p>
          </div>

          <div className="panel">
            <p className="eyebrow">Video (optional)</p>
            <div className="file-input">
              <input type="file" accept="video/*" onChange={(event) => setClipFile(event.target.files?.[0] ?? null)} />
              <p className="muted small">{clipFile?.name || 'Kein Clip ausgewählt'}</p>
            </div>
            <p className="eyebrow" style={{ marginTop: '1rem' }}>
              Standbild (optional)
            </p>
            <div className="file-input">
              <input type="file" accept="image/*" onChange={(event) => setStillFile(event.target.files?.[0] ?? null)} />
              <p className="muted small">{stillFile?.name || 'Kein Standbild ausgewählt'}</p>
            </div>
          </div>

          <div className="panel">
            <p className="eyebrow">Status & Hinweise</p>
            {message && <div className="notice info">{message}</div>}
            {error && <div className="notice error">{error}</div>}
            {syncError && <div className="notice warning">Letzte Synchronisation: {syncError}</div>}
            <div className="notice muted" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div>
                <p className="eyebrow">Warteschlange</p>
                <p className="muted small">
                  {queuedCount === 0
                    ? 'Keine offenen Pakete.'
                    : `${queuedCount} Paket(e) warten auf Upload${lastQueuedKey ? ` · ${lastQueuedKey}` : ''}`}
                </p>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={handleSyncQueued}
                disabled={queuedCount === 0 || syncing}
                style={{ marginLeft: 'auto' }}
              >
                {syncing ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
              </button>
            </div>
            <ul className="muted small bullets">
              <li>Offline? Bundles werden automatisch gespeichert und später hochgeladen.</li>
              <li>Die ZIP-Struktur entspricht dem App-Bundle ({'metadata.json'}, {'landmarks.json'}, optional Dateien).</li>
              <li>API-Endpunkt wird über <code>VITE_API_URL</code> konfiguriert.</li>
            </ul>
            <button className="primary" type="submit" disabled={frames.length === 0 || state === 'uploading'}>
              Trainingspaket hochladen
            </button>
          </div>
        </div>
      </form>

      {lastResult && (
        <div className="result-card">
          <div>
            <p className="eyebrow">Server-Antwort</p>
            <p className="value">Bundle-ID: {lastResult.id}</p>
            <p className="muted">Status: {lastResult.status}</p>
          </div>
          {lastResult.trainingJob && (
            <div>
              <p className="eyebrow">Trainingsjob</p>
              <p className="value">Job-ID: {lastResult.trainingJob.jobId}</p>
              <p className="muted">
                {lastResult.trainingJob.status}
                {lastResult.trainingJob.pollUrl ? ` · ${lastResult.trainingJob.pollUrl}` : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Wrapper component with mode switching
export function TrainingUploadWithRecording() {
  const [mode, setMode] = useState<'record' | 'upload'>('record');
  const [profileId, setProfileId] = useState('web-demo');
  const [label, setLabel] = useState('HILFE');
  const { upload, lastResult, error, queuedCount, syncQueued, syncing, syncError, state, lastQueuedKey } =
    useTrainingUploader();
  const [message, setMessage] = useState<string>('');

  const handleRecordingComplete = useCallback(
    async (payload: TrainingBundlePayload) => {
      setMessage('Aufnahme wird hochgeladen…');
      try {
        const result = await upload(payload);
        setMessage(
          result
            ? 'Upload abgeschlossen. Vielen Dank für die neue Geste!'
            : 'Bundle gespeichert, wird bei Verbindung synchronisiert.',
        );
      } catch (uploadError) {
        const reason = uploadError instanceof Error ? uploadError.message : String(uploadError);
        setMessage(`Upload fehlgeschlagen: ${reason}`);
      }
    },
    [upload],
  );

  return (
    <>
      <div className="mode-switcher" style={{ marginBottom: '1rem' }}>
        <button className={mode === 'record' ? 'active' : ''} onClick={() => setMode('record')}>
          Geste aufnehmen
        </button>
        <button className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>
          Datei hochladen
        </button>
      </div>

      {mode === 'record' && (
        <>
          <TrainingRecorder profileId={profileId} label={label} onRecordingComplete={handleRecordingComplete} />

          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label htmlFor="record-profile">Profil-ID</label>
              <input id="record-profile" value={profileId} onChange={(event) => setProfileId(event.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="record-label">Gestenlabel</label>
              <input id="record-label" value={label} onChange={(event) => setLabel(event.target.value)} />
            </div>
          </div>
        </>
      )}

      {mode === 'upload' && (
        <TrainingUpload 
          profileId={profileId} 
          setProfileId={setProfileId} 
          label={label} 
          setLabel={setLabel} 
        />
      )}

      {message && mode === 'record' && (
        <div className="notice info" style={{ marginTop: '1rem' }}>
          {message}
        </div>
      )}

      {error && mode === 'record' && (
        <div className="notice error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}

      {mode === 'record' && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-header" style={{ marginBottom: '0.5rem' }}>
            <div>
              <p className="eyebrow">Warteschlange</p>
              <p className="muted small">
                {queuedCount === 0
                  ? 'Keine offenen Pakete.'
                  : `${queuedCount} Paket(e) warten · ${lastQueuedKey ?? 'kein Key'}`}
              </p>
            </div>
            <div className="status-chip" data-state={state === 'queued' ? 'running' : 'idle'}>
              {syncing ? 'Synchronisiere…' : state === 'queued' ? 'Wartet' : 'Bereit'}
            </div>
          </div>
          {syncError && <div className="notice warning">{syncError}</div>}
          <button
            className="ghost"
            onClick={() => syncQueued()}
            disabled={queuedCount === 0 || syncing}
            style={{ width: '100%' }}
          >
            {syncing ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
          </button>
        </div>
      )}

      {lastResult && mode === 'record' && (
        <div className="result-card" style={{ marginTop: '1rem' }}>
          <div>
            <p className="eyebrow">Server-Antwort</p>
            <p className="value">Bundle-ID: {lastResult.id}</p>
            <p className="muted">Status: {lastResult.status}</p>
          </div>
          {lastResult.trainingJob && (
            <div>
              <p className="eyebrow">Trainingsjob</p>
              <p className="value">Job-ID: {lastResult.trainingJob.jobId}</p>
              <p className="muted">
                {lastResult.trainingJob.status}
                {lastResult.trainingJob.pollUrl ? ` · ${lastResult.trainingJob.pollUrl}` : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
