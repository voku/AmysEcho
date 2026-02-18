import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  isAuthFailureReason,
  useTrainingUploader,
  type SyncQueuedResult,
} from '../hooks/useTrainingUploader';
import type {
  TrainingBundlePayload,
  TrainingJobInfo,
  TrainingQualityLogEntry,
  UploadTrainingBundleResponse,
} from '../training/types';
import { TrainingRecorder } from './TrainingRecorder';
import { useAppState } from '../hooks/useAppState';
import { useApiConfig } from '../hooks/useApiConfig';
import { resolveApiUrl } from '../utils/resolveApiUrl';
import { fetchTrainingQualityLog } from '../training/trainingBundle';
import { TrainingQueueList } from './TrainingQueueList';
import { useMlpModelInjection } from '../hooks/useMlpModelInjection';
import { useMetacomBundle } from '../hooks/useMetacomBundle';
import { useSymbolStore, type SymbolDefinition } from '../context/SymbolStore';
import { SymbolButton } from './SymbolButton';

type TrainingUploaderHandle = ReturnType<typeof useTrainingUploader>;

const trainingJobLabel: Record<TrainingJobInfo['status'], string> = {
  queued: 'Wartet auf Start',
  running: 'Training läuft',
  completed: 'Abgeschlossen',
  failed: 'Fehlgeschlagen',
};

const qualityGateReasonLabels: Record<string, string> = {
  too_few_frames: 'Zu wenige verwertbare Frames erkannt',
  quality_score_below_threshold: 'Qualitätswert liegt unter dem Grenzwert',
  insufficient_motion: 'Zu wenig Bewegung in der Aufnahme',
  landmarks_missing: 'Landmarks fehlen teilweise',
  hand_coverage_low: 'Hände waren nicht durchgängig sichtbar',
};

const formatQualityGateReason = (reason: string): string => qualityGateReasonLabels[reason] ?? reason;

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

const formatSyncQueuedMessage = (uploaded: number, remaining: number, blocked: number): string => {
  if (uploaded > 0 && remaining > 0) {
    if (blocked > 0) {
      return `Synchronisierung abgeschlossen (${uploaded} Paket(e) übertragen, ${remaining} verbleibend). ${blocked} Paket(e) benötigen eine neue Anmeldung.`;
    }
    return `Synchronisierung abgeschlossen (${uploaded} Paket(e) übertragen, ${remaining} verbleibend). Bitte prüfe die Verbindung oder versuche es später erneut.`;
  }
  if (uploaded > 0) {
    return `Synchronisierung abgeschlossen (${uploaded} Paket(e) übertragen).`;
  }
  if (remaining > 0) {
    if (blocked > 0 && blocked === remaining) {
      return `${blocked} Paket(e) sind durch eine abgelaufene Sitzung blockiert. Bitte melde dich erneut an.`;
    }
    if (blocked > 0) {
      return `${remaining} Paket(e) verbleiben, davon ${blocked} mit abgelaufener Sitzung. Bitte melde dich erneut an.`;
    }
    return `${remaining} Paket(e) warten noch auf Upload. Bitte prüfe die Verbindung oder versuche es später erneut.`;
  }
  return 'Keine Pakete in der Warteschlange gefunden.';
};




const formatQualityLogDate = (raw: string): string => {
  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    return raw;
  }
  return new Date(timestamp).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getQualityAreaName = (part: string): string => {
  if (part === 'hand') return 'Hände';
  if (part === 'pose') return 'Pose';
  if (part === 'face') return 'Gesicht';
  return 'Bereich';
};

const normalizeSymbolName = (name: string): string => name.trim().toLocaleLowerCase('de-DE');

// Server sendet die technischen Gründe aktuell als Strings wie
// "handCoverage 0.40 < 0.50" bzw. "handJitter 0.123 > 0.100".
// Diese Regexe müssen bei Änderungen in evaluateBundleQuality synchron gehalten werden.
const formatQualityLogReason = (reason: string): string => {
  const translated = formatQualityGateReason(reason);
  if (translated !== reason) {
    return translated;
  }

  const frameMatch = reason.match(/^frameCount\s+(\d+)\s+<\s+(\d+)/i);
  if (frameMatch) {
    return `Zu wenige Frames (${frameMatch[1]} < ${frameMatch[2]}).`;
  }

  const coverageMatch = reason.match(/^(hand|pose|face)Coverage\s+([0-9.]+)\s+<\s+([0-9.]+)/i);
  if (coverageMatch) {
    const part = (coverageMatch[1] ?? '').toLowerCase();
    const measured = coverageMatch[2] ?? '0';
    const threshold = coverageMatch[3] ?? '0';
    const area = getQualityAreaName(part);
    return `${area} zu selten erkannt (${Math.round(Number(measured) * 100)}% < ${Math.round(
      Number(threshold) * 100,
    )}%).`;
  }

  const jitterMatch = reason.match(/^(hand|pose|face)Jitter\s+([0-9.]+)\s+>\s+([0-9.]+)/i);
  if (jitterMatch) {
    const part = (jitterMatch[1] ?? '').toLowerCase();
    const measured = jitterMatch[2] ?? '0';
    const threshold = jitterMatch[3] ?? '0';
    const area = getQualityAreaName(part);
    return `${area}-Jitter zu hoch (${measured} > ${threshold}).`;
  }

  return 'Unbekannter Ablehnungsgrund.';
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
  const { error, syncError, trainingJobError, queuedCount, syncing, lastQueuedKey, lastResult, trainingJob, queuedBundles } = uploader;
  const activeTrainingJob = trainingJob ?? lastResult?.trainingJob ?? null;

  const blockedAuthCount = queuedBundles.filter((bundle) =>
    bundle.status === 'failed' && isAuthFailureReason(bundle.lastError),
  ).length;
  const queueWaitingCount = Math.max(0, queuedBundles.length - blockedAuthCount);

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
            {(() => {
              if (activeTrainingJob.message) return activeTrainingJob.message;
              if (activeTrainingJob.status === 'failed' && activeTrainingJob.error) return activeTrainingJob.error;
              
              switch (activeTrainingJob.status) {
                case 'queued': return 'Dein Paket wartet auf den nächsten freien Trainingsplatz.';
                case 'running': return 'Das Modell wird gerade mit deinen Beispielen aktualisiert.';
                case 'completed': return 'Training abgeschlossen. Das neue Modell wird bereitgestellt.';
                case 'failed': return 'Training fehlgeschlagen. Bitte prüfe die Logs oder versuche es erneut.';
                default: return '';
              }
            })()}
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
          <p className="muted small">Wir holen den Status automatisch vom Server. Job-ID: {activeTrainingJob.jobId}</p>
        </div>
      )}
      <div className="notice muted notice-flex">
        <div>
          <p className="eyebrow">Warteschlange</p>
          <p className="muted small">
            {queuedCount === 0
              ? 'Keine offenen Pakete.'
              : queueWaitingCount === 0
                ? `${blockedAuthCount} Paket(e) warten auf neue Anmeldung${lastQueuedKey ? ` · ${lastQueuedKey}` : ''}`
                : blockedAuthCount > 0
                  ? `${queueWaitingCount} Paket(e) warten auf Upload, ${blockedAuthCount} Paket(e) auf neue Anmeldung${lastQueuedKey ? ` · ${lastQueuedKey}` : ''}`
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
      {(result.validationSummary || result.qualityGate) && (
        <div>
          <p className="eyebrow">Qualitätsprüfung (Server)</p>
          {result.validationSummary && (
            <p className="muted small">
              Frames: {result.validationSummary.frameCount}
              {typeof result.validationSummary.qualityScore === 'number'
                ? ` · Score: ${result.validationSummary.qualityScore}/100`
                : ''}
            </p>
          )}
          {result.qualityGate && (
            <p className="muted small">
              Ergebnis: {result.qualityGate.outcome === 'pass'
                ? 'Bestanden'
                : result.qualityGate.outcome === 'review'
                ? 'Bitte prüfen'
                : 'Unbekannt'}
            </p>
          )}
          {result.qualityGate?.reasons?.length ? (
            <ul className="muted small bullets">
              {result.qualityGate.reasons.map((reason, index) => (
                <li key={`${reason}-${index}`}>{formatQualityGateReason(reason)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SymbolSelector({
  symbols,
  selectedId,
  onSelect,
}: {
  symbols: SymbolDefinition[];
  selectedId: string;
  onSelect: (id: string, name: string) => void;
}) {
  const [search, setSearch] = useState('');
  
  const filteredSymbols = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return symbols;
    return symbols.filter(s => 
      s.name.toLowerCase().includes(term) || 
      s.id.toLowerCase().includes(term)
    );
  }, [symbols, search]);

  const selectedSymbol = symbols.find(s => s.id === selectedId);

  return (
    <div className="symbol-selector mt-md">
      <div className="form-group">
        <label htmlFor="symbol-search">Gebärde suchen oder neu anlegen</label>
        <div className="search-input-wrapper">
          <input
            id="symbol-search"
            type="text"
            placeholder="z.B. Essen, Trinken..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          {search && (
            <button 
              className="clear-button" 
              onClick={() => setSearch('')}
              title="Suche löschen"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="symbol-grid-scrollable">
        {filteredSymbols.length > 0 ? (
          <div className="symbol-grid">
            {filteredSymbols.map((symbol) => (
              <SymbolButton
                key={symbol.id}
                symbol={{
                  id: symbol.id,
                  name: symbol.name,
                  emoji: symbol.emoji || '🧩',
                  category: symbol.category,
                  ...(symbol.color && { color: symbol.color })
                }}
                onPress={() => onSelect(symbol.id, symbol.name)}
                highContrast={selectedId === symbol.id}
              />
            ))}
          </div>
        ) : (
          <div className="notice info">
            <p>Keine passende Gebärde gefunden.</p>
            <button 
              className="primary mt-sm"
              onClick={() => onSelect(search.toLowerCase(), search)}
            >
              "{search}" als neue Gebärde verwenden
            </button>
          </div>
        )}
      </div>
      
      {selectedSymbol && (
        <div className="selected-indicator mt-sm">
          Ausgewählt: <strong>{selectedSymbol.name}</strong>
        </div>
      )}
    </div>
  );
}



interface TrainingQualityLogCardProps {
  entries: TrainingQualityLogEntry[];
  loading: boolean;
  error: string | null;
}

function TrainingQualityLogCard({ entries, loading, error }: TrainingQualityLogCardProps) {
  return (
    <div className="card mt-md">
      <p className="eyebrow">Abgelehnte Aufnahmen</p>
      <p className="muted small">Wir zeigen dir, warum Aufnahmen nicht ins Training übernommen wurden.</p>
      {loading ? <p className="muted small">Qualitätsprotokoll wird geladen…</p> : null}
      {error ? <div className="notice warning">{error}</div> : null}
      {!loading && !error && entries.length === 0 ? (
        <div className="notice info">Noch keine abgelehnten Aufnahmen. Nimm gern ein neues Beispiel auf.</div>
      ) : null}
      {entries.length > 0 ? (
        <ul className="muted small bullets">
          {entries.map((entry) => (
            <li key={entry.bundleId}>
              <strong>{entry.label}</strong> ({formatQualityLogDate(entry.recordedAt)}):{' '}
              {entry.reasons.length > 0
                ? entry.reasons.map((reason) => formatQualityLogReason(reason)).join(', ')
                : 'Ohne Grundangabe'}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="muted small">Tipp: Nimm die Gebärde erneut mit ruhiger Kamera und gut sichtbaren Händen auf.</p>
    </div>
  );
}

// Wrapper component with recording-first experience
export function TrainingUploadWithRecording() {
  const { apiBaseUrl, apiToken, refreshToken, uploadEndpoint, refreshAccessToken } = useApiConfig();
  const hasAnyAuthToken =
    (typeof apiToken === 'string' && apiToken.trim().length > 0) ||
    (typeof refreshToken === 'string' && refreshToken.trim().length > 0);
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
    setPreferredSign,
    preferredSignId,
    profileId,
    profileMetadata,
  } = useAppState();
  const modelInjection = useMlpModelInjection(profileId);
  const { symbols, syncError: symbolSyncError, refresh: refreshSymbols, loading: symbolsLoading } = useSymbolStore();
  const vocabularySet = profileMetadata?.vocabularySet ?? 'basis';
  const { symbols: metacomSymbols } = useMetacomBundle({ vocabularySet });
  const { combinedSymbols, symbolById, symbolByName } = useMemo(() => {
    const merged = new Map<string, SymbolDefinition>();
    const seenNames = new Set<string>();

    for (const symbol of symbols) {
      merged.set(symbol.id, symbol);
      const normalizedName = normalizeSymbolName(symbol.name);
      if (normalizedName) {
        seenNames.add(normalizedName);
      }
    }

    for (const symbol of metacomSymbols) {
      const nextSymbol = {
        id: symbol.id,
        name: symbol.label,
        category: symbol.category ?? 'metacom',
        emoji: symbol.emoji,
        color: symbol.color,
      };
      const normalizedName = normalizeSymbolName(nextSymbol.name);
      if (normalizedName) {
        if (seenNames.has(normalizedName)) {
          continue;
        }
      }
      if (!merged.has(nextSymbol.id)) {
        merged.set(nextSymbol.id, nextSymbol);
        if (normalizedName) {
          seenNames.add(normalizedName);
        }
      }
    }

    const combinedSymbolsList = Array.from(merged.values());
    const byId = new Map<string, SymbolDefinition>();
    const byName = new Map<string, SymbolDefinition>();

    for (const symbol of combinedSymbolsList) {
      byId.set(symbol.id, symbol);
      const normalizedName = normalizeSymbolName(symbol.name);
      if (normalizedName && !byName.has(normalizedName)) {
        byName.set(normalizedName, symbol);
      }
    }

    return {
      combinedSymbols: combinedSymbolsList,
      symbolById: byId,
      symbolByName: byName,
    };
  }, [metacomSymbols, symbols]);
  const lastJobStatusRef = useRef<string | null>(null);
  // Removed local label state - using preferredGestureLabel directly from app state to prevent circular dependencies
  const [message, setMessage] = useState<string>('');
  const [lastQueueSyncResult, setLastQueueSyncResult] = useState<SyncQueuedResult | null>(null);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [qualityEntries, setQualityEntries] = useState<TrainingQualityLogEntry[]>([]);
  const [qualityLoading, setQualityLoading] = useState<boolean>(false);
  const [qualityError, setQualityError] = useState<string | null>(null);
  const metadataReady = !!profileId && profileId.trim().length > 0 && preferredSignId.trim().length > 0;
  const metadataError = metadataReady
    ? ''
    : 'Bitte wähle eine Gebärde aus, bevor du eine Aufnahme startest.';
  const [searchParams] = useSearchParams();
  const gestureParam = searchParams.get('gesture');
  const symbolIdParam = searchParams.get('symbolId');
  const prevMetadataReadyRef = useRef(metadataReady);
  const authRetryFiredRef = useRef(false);
  const authTokenKey = `${apiToken ?? ''}::${refreshToken ?? ''}`;
  const hasAuthBlockedBundles = uploadState.queuedBundles.some(
    (bundle) => bundle.status === 'failed' && isAuthFailureReason(bundle.lastError),
  );

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
    if (!apiBaseUrl || !profileId) {
      setQualityEntries([]);
      setQualityError(null);
      setQualityLoading(false);
      return;
    }

    const endpoint = resolveApiUrl('/api/v1/dgs/training-quality', apiBaseUrl);
    let cancelled = false;
    setQualityLoading(true);
    fetchTrainingQualityLog({
      endpoint,
      token: apiToken,
      ...(profileId ? { profileId } : {}),
      limit: 10,
    })
      .then((items) => {
        if (cancelled) return;
        setQualityEntries(items);
        setQualityError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setQualityError(`Qualitätsprotokoll konnte nicht geladen werden: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (!cancelled) {
          setQualityLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, apiToken, profileId, lastResult?.id]);

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
    (id: string, name: string) => {
      setPreferredSign(id, name);
    },
    [setPreferredSign],
  );

  useEffect(() => {
    if (!preferredSignId) {
      return;
    }
    if (symbolById.has(preferredSignId)) {
      return;
    }
    const selectedMetacom = metacomSymbols.find((symbol) => symbol.id === preferredSignId);
    if (!selectedMetacom) {
      return;
    }
    const normalizedName = normalizeSymbolName(selectedMetacom.label);
    if (!normalizedName) {
      return;
    }
    const replacement = symbolByName.get(normalizedName);
    if (!replacement || replacement.id === preferredSignId) {
      return;
    }
    setPreferredSign(replacement.id, replacement.name);
  }, [metacomSymbols, preferredSignId, setPreferredSign, symbolById, symbolByName]);

  useEffect(() => {
    // Sync URL params/symbols to label - only on mount or when URL/symbols change
    // We include symbols to handle the case where symbols load after mount
    const normalizedName = gestureParam?.trim() ?? '';
    const symbol = combinedSymbols.find((s) => s.id === symbolIdParam) ?? null;
    if (symbol) {
      if (preferredSignId !== symbol.id) {
        setPreferredSign(symbol.id, symbol.name);
      }
    } else if (normalizedName) {
      const normalizedId = normalizedName.toLowerCase();
      if (preferredSignId !== normalizedId) {
        setPreferredSign(normalizedId, normalizedName);
      }
    }
    // preferredSignId and setPreferredSign excluded to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedSymbols, gestureParam, symbolIdParam]);

  const handleRecordingComplete = useCallback(
    async (payload: TrainingBundlePayload) => {
      if (!metadataReady) {
        setMessage(metadataError);
        return;
      }
      // Clear previous validation error if any
      setLastQueueSyncResult(null);
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
    setLastQueueSyncResult(null);
    setMessage('Warteschlange wird synchronisiert…');
    try {
      const result = await uploadState.syncQueued();
      setLastQueueSyncResult(result);
      setMessage(formatSyncQueuedMessage(result.uploaded, result.remaining, result.blocked));
    } catch (syncErr) {
      const reason = syncErr instanceof Error ? syncErr.message : String(syncErr);
      setMessage(`Synchronisierung fehlgeschlagen: ${reason}`);
    }
  }, [uploadState]);

  useEffect(() => {
    authRetryFiredRef.current = false;
  }, [authTokenKey]);

  useEffect(() => {
    // Guard + cleanup contract for this closure:
    // - If lastQueueSyncResult is falsy we return immediately to avoid re-entry loops.
    // - If hasAnyAuthToken is available and hasAuthBlockedBundles is false, we treat this
    //   as externally resolved auth blocking and clear stale result/message state.
    // - setLastQueueSyncResult(null) intentionally drops outdated sync snapshots so later
    //   runs don't re-emit stale UI from formatSyncQueuedMessage via setMessage.
    if (!hasAnyAuthToken || hasAuthBlockedBundles || !lastQueueSyncResult) {
      return;
    }
    if (lastQueueSyncResult.blocked <= 0) {
      setLastQueueSyncResult(null);
      return;
    }

    const staleMessage = formatSyncQueuedMessage(
      lastQueueSyncResult.uploaded,
      lastQueueSyncResult.remaining,
      lastQueueSyncResult.blocked,
    );
    setMessage((prev) =>
      prev === staleMessage
        ? ''
        : prev,
    );
    setLastQueueSyncResult(null);
  }, [hasAnyAuthToken, hasAuthBlockedBundles, lastQueueSyncResult]);

  useEffect(() => {
    let cancelled = false;
    if (!hasAnyAuthToken) {
      authRetryFiredRef.current = false;
      return;
    }
    if (!hasAuthBlockedBundles) {
      authRetryFiredRef.current = false;
      return;
    }
    if (authRetryFiredRef.current) {
      return;
    }

    authRetryFiredRef.current = true;
    uploadState.syncQueued().then(({ uploaded, remaining, blocked }) => {
      if (cancelled) return;
      setLastQueueSyncResult({ uploaded, remaining, blocked });
      setMessage(formatSyncQueuedMessage(uploaded, remaining, blocked));
      if (blocked === 0) {
        authRetryFiredRef.current = false;
      }
    }).catch((syncErr) => {
      if (cancelled) return;
      const reason = syncErr instanceof Error ? syncErr.message : String(syncErr);
      setMessage(`Synchronisierung fehlgeschlagen: ${reason}`);
    });

    return () => {
      cancelled = true;
    };
  }, [hasAnyAuthToken, hasAuthBlockedBundles, authTokenKey, uploadState]);

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

      {modelNotice && <div className="notice success compact mb-md">{modelNotice}</div>}

      <TrainingRecorder
        profileId={profileId || 'default'}
        label={preferredSignId}
        onRecordingComplete={handleRecordingComplete}
      />

      <div className="card mt-md">
        <div className="form-group">
          <label htmlFor="record-profile">Profil-ID</label>
          <input id="record-profile" value={profileId || ''} readOnly />
        </div>
        <SymbolSelector 
          symbols={combinedSymbols} 
          selectedId={preferredSignId}
          onSelect={handleLabelUpdate}
        />
        {!metadataReady && <div className="notice error mt-sm">{metadataError}</div>}
      </div>

      <div className="card mt-md">
        <div className="card-header mb-sm">
          <div>
            <p className="eyebrow">Status</p>
            <p className="muted small">
              {state === 'error' ? 'Fehler bei der letzten Aktion' : state === 'uploading' ? 'Upload läuft…' : 'Bereit'}
            </p>
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



      <TrainingQualityLogCard entries={qualityEntries} loading={qualityLoading} error={qualityError} />

      {lastResult && (
        <div className="mt-md">
          <TrainingResultCard result={lastResult} trainingJob={trainingJob} />
        </div>
      )}
    </>
  );
}
