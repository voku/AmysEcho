import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTrainingUploader } from '../hooks/useTrainingUploader';
import type {
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

type TrainingUploaderHandle = ReturnType<typeof useTrainingUploader>;

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
      {trainingJobError && (
        <div className="notice warning">
          Trainingsstatus konnte nicht geladen werden. Bitte versuche es später erneut.
        </div>
      )}
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
          {(() => {
            const started = formatDateTime(activeTrainingJob.startedAt);
            const ended = formatDateTime(activeTrainingJob.endedAt);
            if (!started && !ended) return null;
            const parts = [];
            if (started) parts.push(`Gestartet: ${started}`);
            if (ended) parts.push(`Beendet: ${ended}`);
            return <p className="muted small">{parts.join(' · ')}</p>;
          })()}
          {activeTrainingJob.error && activeTrainingJob.status === 'failed' && (
            <p className="muted small">Fehler beim Training. Bitte prüfe die Logs oder versuche es erneut.</p>
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
  const {
    setPreferredGestureLabel,
    preferredGestureLabel,
    setProfileId,
    profileId,
  } = useAppState();
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
    const timer = window.setTimeout(() => setModelNotice(null), 3000);
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
  const headlineSubtext = 'Nimm die Gebärde kurz auf und gib ihr einen Namen.';

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

      <TrainingRecorder
        profileId={profileId}
        label={preferredGestureLabel}
        onRecordingComplete={handleRecordingComplete}
      />

      <div className="card mt-md">
        <div className="form-group">
          <label htmlFor="record-profile">Profil-ID</label>
          <input id="record-profile" value={profileId} onChange={(event) => setProfileId(event.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="record-label">Gebärden-Name</label>
          <input id="record-label" value={preferredGestureLabel} onChange={(event) => handleLabelUpdate(event.target.value)} />
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
