import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { useSymbolStore } from '../context/SymbolStore';

type LandmarkTuple = [number, number] | [number, number, number];

type TrainingUploaderHandle = ReturnType<typeof useTrainingUploader>;

const trainingStatusLabel: Record<UploadState, string> = {
  idle: 'Bereit',
  preparing: 'Paket wird vorbereitet…',
  uploading: 'Upload läuft…',
  success: 'Upload erfolgreich',
  queued: 'Warteschlange aktiv',
  error: 'Fehler beim Upload',
};

const trainingJobLabel: Record<TrainingJobInfo['status'], string> = {
  queued: 'Wartet auf Start',
  running: 'Training läuft',
  completed: 'Abgeschlossen',
  failed: 'Fehlgeschlagen',
};

const formatPercent = (value?: number): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return `${clamped}%`;
};

const formatDateTime = (timestamp?: number): string | null => {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;
  try {
    return new Date(timestamp).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (err) {
    console.warn('Datum konnte nicht formatiert werden', err);
    return null;
  }
};

const formatSyncQueuedMessage = (uploaded: number, remaining: number): string => {
  if (uploaded > 0 && remaining > 0) {
    return `Synchronisierung abgeschlossen (${uploaded} Paket(e) übertragen, ${remaining} verbleibend). Bitte prüfe die Verbindung oder versuche es später erneut.`;
  }
  if (uploaded > 0) {
    return `Synchronisierung abgeschlossen (${uploaded} Paket(e) übertragen).`;
  }
  if (remaining > 0) {
    return `${remaining} Paket(e) warten noch auf Upload. Bitte prüfe die Verbindung oder versuche es später erneut.`;
  }
  return 'Keine Pakete in der Warteschlange gefunden.';
};

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
      {trainingJobError && <div className="notice warning">Trainingsstatus konnte nicht geladen werden: {trainingJobError}</div>}
      {activeTrainingJob && (
        <div className="notice info">
          <p className="eyebrow">Trainingsstatus</p>
          <p className="value">{trainingJobLabel[activeTrainingJob.status]}</p>
          <p className="muted small">
            {activeTrainingJob.message
              ? activeTrainingJob.message
              : activeTrainingJob.status === 'queued'
              ? 'Dein Paket wartet auf den nächsten freien Trainingsplatz.'
              : activeTrainingJob.status === 'running'
              ? 'Das Modell wird gerade mit deinen Beispielen aktualisiert.'
              : activeTrainingJob.status === 'completed'
              ? 'Training abgeschlossen. Das neue Modell wird bereitgestellt.'
              : 'Training fehlgeschlagen. Bitte versuche es erneut.'}
          </p>
          {formatPercent(activeTrainingJob.progress) && (
            <p className="muted small">Fortschritt: {formatPercent(activeTrainingJob.progress)}</p>
          )}
          {typeof activeTrainingJob.metrics?.samples === 'number' && (
            <p className="muted small">Verwendete Beispiele: {activeTrainingJob.metrics.samples}</p>
          )}
          {typeof activeTrainingJob.metrics?.accuracy === 'number' && (
            <p className="muted small">
              Erste Genauigkeits-Schätzung: {Math.round(activeTrainingJob.metrics.accuracy * 100)}%
            </p>
          )}
          {(formatDateTime(activeTrainingJob.startedAt) || formatDateTime(activeTrainingJob.endedAt)) && (
            <p className="muted small">
              {formatDateTime(activeTrainingJob.startedAt)
                ? `Gestartet: ${formatDateTime(activeTrainingJob.startedAt)}`
                : ''}
              {formatDateTime(activeTrainingJob.startedAt) && formatDateTime(activeTrainingJob.endedAt) ? ' · ' : ''}
              {formatDateTime(activeTrainingJob.endedAt) ? `Beendet: ${formatDateTime(activeTrainingJob.endedAt)}` : ''}
            </p>
          )}
          {activeTrainingJob.error && activeTrainingJob.status === 'failed' && (
            <p className="muted small">Fehlerbeschreibung: {activeTrainingJob.error}</p>
          )}
          <p className="muted small">Wir holen den Status automatisch vom Server. Job-ID: {activeTrainingJob.jobId}</p>
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
        <li>Offline? Wir speichern die Aufnahmen und laden sie hoch, sobald eine Verbindung besteht.</li>
        <li>Jedes Paket enthält die wichtigsten Trainingsdaten (Metadaten, Landmarken, optional Video/Bild).</li>
        <li>Du musst nichts einstellen – die Server-Adresse wird automatisch aus den App-Einstellungen übernommen.</li>
      </ul>
      <div className="mt-sm">
        <p className="eyebrow">Zwischengespeicherte Bundles</p>
        <TrainingQueueList
          bundles={uploader.queuedBundles}
          syncing={syncing}
          {...(onSyncBundle !== undefined && { onSyncBundle })}
          {...(onRemoveBundle !== undefined && { onRemoveBundle })}
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
          <p className="value">{trainingJobLabel[activeTrainingJob.status]}</p>
          <p className="muted small">Job-ID: {activeTrainingJob.jobId}</p>
          {activeTrainingJob.message && <p className="muted small">{activeTrainingJob.message}</p>}
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

  const statusText = trainingStatusLabel;

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
      const { uploaded, remaining } = await syncQueued();
      setMessage(formatSyncQueuedMessage(uploaded, remaining));
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
          <h2>Gebärdenpaket hochladen</h2>
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
          <label htmlFor="label">Gebärden-Name</label>
          <input id="label" value={label} onChange={(event) => setLabel(event.target.value)} required />
          {suggestedLabel && suggestedLabel !== label && (
            <button
              type="button"
              className="ghost mt-sm"
              onClick={() => setLabel(suggestedLabel)}
            >
              Letzte erkannte Gebärde übernehmen ({suggestedLabel})
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

// Wrapper component with recording-first experience
export function TrainingUploadWithRecording() {
  const { apiBaseUrl, apiToken, uploadEndpoint, refreshAccessToken } = useApiConfig();
  const uploadState = useTrainingUploader({
    defaultOptions: {
      endpoint: uploadEndpoint,
      token: apiToken,
      apiBase: apiBaseUrl,
      refreshAccessToken,
    },
  });
  const { upload, lastResult, state, trainingJob } = uploadState;
  const { setPreferredGestureLabel, preferredGestureLabel, setProfileId, profileId } = useAppState();
  const modelInjection = useMlpModelInjection(profileId);
  const { symbols, syncError: symbolSyncError, refresh: refreshSymbols, loading: symbolsLoading } = useSymbolStore();
  const lastJobStatusRef = useRef<string | null>(null);
  // Removed local label state - using preferredGestureLabel directly from app state to prevent circular dependencies
  const [message, setMessage] = useState<string>('');
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const metadataReady = profileId.trim().length > 0 && preferredGestureLabel.trim().length > 0;
  const metadataError = metadataReady
    ? ''
    : 'Bitte trage Profil-ID und Gebärden-Name ein, bevor du eine Aufnahme startest.';
  const [searchParams] = useSearchParams();
  const [gestureFromLearning, setGestureFromLearning] = useState<string | null>(null);
  const gestureParam = searchParams.get('gesture');
  const symbolIdParam = searchParams.get('symbolId');
  const selectedSymbol = useMemo(
    () => symbols.find((symbol) => symbol.id === symbolIdParam) ?? null,
    [symbolIdParam, symbols],
  );
  const prevMetadataReadyRef = useRef(metadataReady);

  useEffect(() => {
    // Only clear message when transitioning from not-ready to ready
    if (metadataReady && !prevMetadataReadyRef.current && message === metadataError) {
      setMessage('');
    }
    prevMetadataReadyRef.current = metadataReady;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- message and metadataError excluded to prevent infinite loop
  }, [metadataReady]);

  useEffect(() => {
    if (!modelInjection.notice) return undefined;
    setModelNotice(modelInjection.notice);
    const timer = window.setTimeout(() => setModelNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [modelInjection.notice]);

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
  }, [modelInjection, uploadState.lastResult, uploadState.trainingJob]);

  const handleLabelUpdate = useCallback(
    (value: string) => {
      setPreferredGestureLabel(value);
    },
    [setPreferredGestureLabel],
  );

  useEffect(() => {
    // Sync URL params/symbols to label - only on mount or when URL changes
    const normalized = gestureParam?.trim() ?? '';
    const symbol = symbols.find((s) => s.id === symbolIdParam) ?? null;
    if (symbol && preferredGestureLabel !== symbol.name) {
      setGestureFromLearning(symbol.name);
      setPreferredGestureLabel(symbol.name);
    } else if (!symbol && normalized && preferredGestureLabel !== normalized) {
      setGestureFromLearning(normalized);
      setPreferredGestureLabel(normalized);
    } else if (!symbol && !normalized) {
      setGestureFromLearning((prev) => (prev === null ? prev : null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only run when URL params change, not when preferredGestureLabel or symbols change
  }, [gestureParam, symbolIdParam]);

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
            ? 'Upload abgeschlossen. Vielen Dank für die neue Gebärde!'
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
      const { uploaded, remaining } = await uploadState.syncQueued();
      setMessage(formatSyncQueuedMessage(uploaded, remaining));
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

  const headlineLabel = selectedSymbol?.name ?? gestureFromLearning ?? (preferredGestureLabel || 'Neue Gebärde');
  const headlineSubtext = selectedSymbol
    ? `Aus „Lernen“ übernommen (${selectedSymbol.category})`
    : gestureFromLearning
    ? 'Aus „Lernen“ übernommen'
    : 'Nimm die Gebärde kurz auf und gib ihr einen Namen.';

  return (
    <>
      {symbolSyncError && (
        <div className="notice warning mb-md">
          Gebärdenliste konnte nicht synchronisiert werden: {symbolSyncError}{' '}
          <button className="ghost" onClick={refreshSymbols} disabled={symbolsLoading}>
            Jetzt synchronisieren
          </button>
          <p className="muted small mt-xs">Gebärden-Uploads und Trainings-Sync laufen trotzdem weiter.</p>
        </div>
      )}

      {!symbolSyncError && symbols.length === 0 && (
        <div className="notice info mb-md">
          Gebärden werden vom Server geladen.{' '}
          <button className="ghost" onClick={refreshSymbols} disabled={symbolsLoading}>
            Manuell synchronisieren
          </button>
          <p className="muted small mt-xs">Gebärden-Uploads und Trainings-Sync laufen unabhängig davon weiter.</p>
        </div>
      )}

      <div className="card training-header mb-md">
        <div>
          <p className="eyebrow">Aufnahme</p>
          <h2 className="training-headline">Gebärde aufzeichnen: {headlineLabel}</h2>
          <p className="muted small">{headlineSubtext}</p>
        </div>
        {selectedSymbol?.imageUrl && (
          <img
            src={selectedSymbol.imageUrl}
            alt={selectedSymbol.name}
            className="symbol-thumb headline-symbol-thumb"
          />
        )}
      </div>

      {modelNotice && <div className="notice success compact mb-md">{modelNotice}</div>}

      <TrainingRecorder profileId={profileId} label={preferredGestureLabel} onRecordingComplete={handleRecordingComplete} />

      <div className="card mt-md">
        <div className="form-group">
          <label htmlFor="record-profile">Profil-ID</label>
          <input id="record-profile" value={profileId} onChange={(event) => setProfileId(event.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="record-label">Gebärden-Name</label>
          <input id="record-label" value={preferredGestureLabel} onChange={(event) => handleLabelUpdate(event.target.value)} />
          {gestureFromLearning && (
            <p className="muted small mt-xs">Du kannst den Namen aus „Lernen” übernehmen oder anpassen.</p>
          )}
        </div>
        {!metadataReady && <div className="notice error mt-sm">{metadataError}</div>}
      </div>

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

      {lastResult && (
        <div className="mt-md">
          <TrainingResultCard result={lastResult} trainingJob={trainingJob} />
        </div>
      )}
    </>
  );
}
