import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTrainingUploader, type UploadState } from '../hooks/useTrainingUploader';
import { frameHasAnyLandmarks } from '../training/handUtils';
import type {
  TrainingFrame,
  TrainingBundlePayload,
  TrainingJobInfo,
  UploadTrainingBundleResponse,
} from '../training/types';
import { TrainingRecorder } from './TrainingRecorder';
import { useAppState } from '../hooks/useAppState';
import { useApiConfig } from '../hooks/useApiConfig';
import { TrainingQueueList } from './TrainingQueueList';
import { useMlpModelInjection } from '../hooks/useMlpModelInjection';

type LandmarkTuple = [number, number] | [number, number, number];

type TrainingUploaderHandle = ReturnType<typeof useTrainingUploader>;

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
  suggestedLabel?: string;
  uploader: TrainingUploaderHandle;
}

function TrainingStatusBlock({
  uploader,
  message,
  onSyncQueued,
  actionSlot,
  onSyncBundle,
  onRemoveBundle,
}: {
  uploader: TrainingUploaderHandle;
  message?: string;
  onSyncQueued: () => Promise<void>;
  actionSlot?: ReactNode;
  onSyncBundle?: (key: string) => Promise<void>;
  onRemoveBundle?: (key: string) => Promise<void>;
}) {
  const { error, syncError, trainingJobError, queuedCount, syncing, lastQueuedKey, lastResult, trainingJob } = uploader;
  const activeTrainingJob = trainingJob ?? lastResult?.trainingJob ?? null;

  return (
    <div className="panel">
      <p className="eyebrow">Status & Hinweise</p>
      {message && <div className="notice info">{message}</div>}
      {error && <div className="notice error">{error}</div>}
      {syncError && <div className="notice warning">Letzte Synchronisation: {syncError}</div>}
      {trainingJobError && <div className="notice warning">Trainingsjob: {trainingJobError}</div>}
      {activeTrainingJob && (
        <div className="notice info">
          <p className="eyebrow">Trainingsjob</p>
          <p className="muted small">
            Job-ID {activeTrainingJob.jobId} · Status: {activeTrainingJob.status}
            {activeTrainingJob.pollUrl ? ` · Polling: ${activeTrainingJob.pollUrl}` : ''}
          </p>
        </div>
      )}
      <div className="notice muted notice-flex">
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
          className="ghost push-end"
          onClick={onSyncQueued}
          disabled={queuedCount === 0 || syncing}
        >
          {syncing ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
        </button>
      </div>
      <ul className="muted small bullets">
        <li>Offline? Bundles werden automatisch gespeichert und später hochgeladen.</li>
        <li>Die ZIP-Struktur entspricht dem App-Bundle ({'metadata.json'}, {'landmarks.json'}, optional Dateien).</li>
        <li>API-Endpunkt wird über <code>VITE_API_URL</code> konfiguriert.</li>
      </ul>
      <div className="mt-sm">
        <p className="eyebrow">Zwischengespeicherte Bundles</p>
        <TrainingQueueList
          bundles={uploader.queuedBundles}
          onSyncBundle={onSyncBundle}
          onRemoveBundle={onRemoveBundle}
          syncing={syncing}
        />
      </div>
      {actionSlot}
    </div>
  );
}

function TrainingResultCard({ result, trainingJob }: { result: UploadTrainingBundleResponse; trainingJob: TrainingJobInfo | null }) {
  if (!result) return null;
  const activeTrainingJob = trainingJob ?? result.trainingJob ?? null;

  return (
    <div className="result-card">
      <div>
        <p className="eyebrow">Server-Antwort</p>
        <p className="value">Bundle-ID: {result.id}</p>
        <p className="muted">Status: {result.status}</p>
      </div>
      {activeTrainingJob && (
        <div>
          <p className="eyebrow">Trainingsjob</p>
          <p className="value">Job-ID: {activeTrainingJob.jobId}</p>
          <p className="muted">
            {activeTrainingJob.status}
            {activeTrainingJob.pollUrl ? ` · ${activeTrainingJob.pollUrl}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

export function TrainingUpload({
  profileId,
  setProfileId,
  label,
  setLabel,
  suggestedLabel,
  uploader,
}: TrainingUploadProps) {
  const [capturedAt, setCapturedAt] = useState(() => new Date().toISOString());
  const [frames, setFrames] = useState<TrainingFrame[]>([]);
  const [framesFileName, setFramesFileName] = useState<string>('');
  const [clipFile, setClipFile] = useState<File | null>(null);
  const [stillFile, setStillFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>('');
  const { upload, state, lastResult, syncQueued, trainingJob } = uploader;

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

  const handleSyncBundle = useCallback(
    async (key: string) => {
      setMessage('Bundle wird hochgeladen…');
      const synced = await uploader.syncBundle(key);
      setMessage(synced ? 'Bundle synchronisiert.' : 'Bundle konnte nicht synchronisiert werden.');
    },
    [uploader],
  );

  const handleRemoveBundle = useCallback(
    async (key: string) => {
      await uploader.removeBundle(key);
      setMessage('Bundle wurde gelöscht.');
    },
    [uploader],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (frames.length === 0) {
        setMessage('Bitte lade zuerst Landmark-Daten hoch.');
        return;
      }
      setMessage('Paket wird erstellt und hochgeladen…');
      try {
        const result = await upload({
          profileId,
          label,
          frames,
          capturedAt,
          source: 'web://mediapipe',
          clipFile,
          stillFile,
        });
        if (result) {
          setMessage('Upload abgeschlossen. Vielen Dank für die neuen Trainingsdaten!');
        } else {
          setMessage('Bundle gespeichert und wartet auf Synchronisation.');
        }
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
          {suggestedLabel && suggestedLabel !== label && (
            <button
              type="button"
              className="ghost mt-sm"
              onClick={() => setLabel(suggestedLabel)}
            >
              Letzte erkannte Geste übernehmen ({suggestedLabel})
            </button>
          )}
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
            <p className="eyebrow mt-md">
              Standbild (optional)
            </p>
            <div className="file-input">
              <input type="file" accept="image/*" onChange={(event) => setStillFile(event.target.files?.[0] ?? null)} />
              <p className="muted small">{stillFile?.name || 'Kein Standbild ausgewählt'}</p>
            </div>
          </div>

          <TrainingStatusBlock
            uploader={uploader}
            message={message}
            onSyncQueued={handleSyncQueued}
            actionSlot={
              <button className="primary" type="submit" disabled={frames.length === 0 || state === 'uploading'}>
                Trainingspaket hochladen
              </button>
            }
            onSyncBundle={handleSyncBundle}
            onRemoveBundle={handleRemoveBundle}
          />
        </div>
      </form>

      {lastResult && <TrainingResultCard result={lastResult} trainingJob={trainingJob} />}
    </section>
  );
}

// Wrapper component with mode switching
export function TrainingUploadWithRecording() {
  const [mode, setMode] = useState<'record' | 'upload'>('record');
  const { apiBaseUrl, apiToken, uploadEndpoint } = useApiConfig();
  const uploadState = useTrainingUploader({
    defaultOptions: { endpoint: uploadEndpoint, token: apiToken, apiBase: apiBaseUrl },
  });
  const { upload, lastResult, state, trainingJob } = uploadState;
  const { setPreferredGestureLabel, preferredGestureLabel, setProfileId, profileId, lastRecognizedGesture, recentGestures } =
    useAppState();
  const modelInjection = useMlpModelInjection(profileId);
  const lastJobStatusRef = useRef<string | null>(null);
  const [label, setLabel] = useState(preferredGestureLabel);
  const [message, setMessage] = useState<string>('');
  const metadataReady = profileId.trim().length > 0 && label.trim().length > 0;
  const metadataError = metadataReady
    ? ''
    : 'Bitte trage Profil-ID und Gestenlabel ein, bevor du eine Aufnahme startest oder hochlädst.';

  useEffect(() => {
    setLabel(preferredGestureLabel);
  }, [preferredGestureLabel]);

  useEffect(() => {
    if (metadataReady && message === metadataError) {
      setMessage('');
    }
  }, [metadataError, metadataReady, message]);

  useEffect(() => {
    const status = uploadState.trainingJob?.status ?? uploadState.lastResult?.trainingJob?.status ?? null;
    if (!status || status === lastJobStatusRef.current) {
      return;
    }
    lastJobStatusRef.current = status;
    if (status === 'completed') {
      setMessage((prev) =>
        prev && !prev.includes('Modell')
          ? `${prev} Neues Modell wird geladen…`
          : 'Trainingsjob abgeschlossen. Neues Modell wird geladen…',
      );
      modelInjection.refreshModel().catch((error) => {
        console.warn('Modell konnte nach Training nicht geladen werden', error);
      });
    }
  }, [modelInjection, setMessage, uploadState.lastResult, uploadState.trainingJob]);

  const handleLabelUpdate = useCallback(
    (value: string) => {
      setLabel(value);
      setPreferredGestureLabel(value);
    },
    [setPreferredGestureLabel],
  );

  const suggestedLabel = lastRecognizedGesture ?? recentGestures[0] ?? '';
  const handleRecordingComplete = useCallback(
    async (payload: TrainingBundlePayload) => {
      if (!metadataReady) {
        setMessage(metadataError);
        return;
      }
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
    [metadataError, metadataReady, upload],
  );

  const handleSyncQueued = useCallback(async () => {
    setMessage('Warteschlange wird synchronisiert…');
    try {
      const uploaded = await uploadState.syncQueued();
      setMessage(
        uploaded > 0
          ? `Synchronisierung abgeschlossen (${uploaded} Paket(e) übertragen).`
          : 'Keine Pakete in der Warteschlange gefunden.',
      );
    } catch (syncErr) {
      const reason = syncErr instanceof Error ? syncErr.message : String(syncErr);
      setMessage(`Synchronisierung fehlgeschlagen: ${reason}`);
    }
  }, [uploadState]);

  const handleSyncBundle = useCallback(
    async (key: string) => {
      setMessage('Bundle wird hochgeladen…');
      const synced = await uploadState.syncBundle(key);
      setMessage(synced ? 'Bundle synchronisiert.' : 'Bundle konnte nicht synchronisiert werden.');
    },
    [uploadState],
  );

  const handleRemoveBundle = useCallback(
    async (key: string) => {
      await uploadState.removeBundle(key);
      setMessage('Bundle wurde gelöscht.');
    },
    [uploadState],
  );

  return (
    <>
      <div className="mode-switcher mb-md">
        <button className={mode === 'record' ? 'active' : ''} onClick={() => setMode('record')}>
          Geste aufnehmen
        </button>
        <button className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>
          Datei hochladen
        </button>
      </div>

      {modelInjection.notice && <div className="notice info mb-md">{modelInjection.notice}</div>}

      {suggestedLabel && (
        <div className="notice info mb-md">
          Letzte erkannte Geste: <strong>{suggestedLabel}</strong>.{' '}
          <button type="button" className="ghost" onClick={() => handleLabelUpdate(suggestedLabel)}>
            Als Standardlabel übernehmen
          </button>
        </div>
      )}

      {mode === 'record' && (
        <>
          <TrainingRecorder profileId={profileId} label={label} onRecordingComplete={handleRecordingComplete} />

          <div className="card mt-md">
            <div className="form-group">
              <label htmlFor="record-profile">Profil-ID</label>
              <input id="record-profile" value={profileId} onChange={(event) => setProfileId(event.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="record-label">Gestenlabel</label>
              <input id="record-label" value={label} onChange={(event) => handleLabelUpdate(event.target.value)} />
              {suggestedLabel && suggestedLabel !== label && (
                <button
                  type="button"
                  className="ghost mt-xs"
                  onClick={() => handleLabelUpdate(suggestedLabel)}
                >
                  Letzte erkannte Geste verwenden ({suggestedLabel})
                </button>
              )}
            </div>
            {!metadataReady && <div className="notice error mt-sm">{metadataError}</div>}
          </div>
        </>
      )}

      {mode === 'upload' && (
        <TrainingUpload
          profileId={profileId}
          setProfileId={setProfileId}
          label={label}
          setLabel={handleLabelUpdate}
          suggestedLabel={suggestedLabel}
          uploader={uploadState}
        />
      )}

      {mode === 'record' && (
        <div className="card mt-md">
          <div className="card-header mb-sm">
            <div>
              <p className="eyebrow">Status</p>
              <p className="muted small">{state === 'uploading' ? 'Upload läuft…' : 'Bereit'}</p>
            </div>
            <div className="status-chip" data-state={state === 'error' ? 'error' : state === 'uploading' ? 'running' : 'idle'}>
              {state === 'error' ? 'Fehler' : state === 'uploading' ? 'Lädt…' : 'Bereit'}
            </div>
          </div>
          <TrainingStatusBlock
            uploader={uploadState}
            message={message}
            onSyncQueued={handleSyncQueued}
            onSyncBundle={handleSyncBundle}
            onRemoveBundle={handleRemoveBundle}
          />
        </div>
      )}

      {lastResult && mode === 'record' && (
        <div className="mt-md">
          <TrainingResultCard result={lastResult} trainingJob={trainingJob} />
        </div>
      )}
    </>
  );
}
