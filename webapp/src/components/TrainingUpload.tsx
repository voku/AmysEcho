import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  isAuthFailureReason,
  useTrainingUploader,
  type SyncQueuedResult,
} from '../hooks/useTrainingUploader';
import { hasAutomaticUploadAttemptsRemaining } from '../training/trainingQueue';
import type {
  DatasetReadinessSummary,
  TrainingBundlePayload,
  TrainingJobInfo,
  TrainingQualityLogEntry,
  UploadTrainingBundleResponse,
} from '../training/types';
import { TrainingRecorder } from './TrainingRecorder';
import { useAppState } from '../hooks/useAppState';
import { useApiConfig } from '../hooks/useApiConfig';
import { resolveApiUrl } from '../utils/resolveApiUrl';
import { HttpError } from '../utils/http';
import { fetchDatasetReadiness, fetchTrainingQualityLog } from '../training/trainingBundle';
import { TrainingQueueList } from './TrainingQueueList';
import { useMlpModelInjection } from '../hooks/useMlpModelInjection';
import { useMetacomBundle } from '../hooks/useMetacomBundle';
import { useSymbolStore, type SymbolDefinition } from '../context/SymbolStore';
import { SymbolButton } from './SymbolButton';
import { syncAllProfilesToServer } from '../services/profileRegistry';
import { dedupeSymbolsByName, normalizeSymbolName } from '../utils/symbolDedup';
import { normalizeGestureLabel } from '../utils/stringUtils';
import { formatContractReason, type MlpModelMeta } from '../gesture/modelClient';

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

const formatSyncQueuedMessage = ({ uploaded, remaining, blockedAuth, blockedRetryLimit }: SyncQueuedResult): string => {
  const blocked = blockedAuth + blockedRetryLimit;
  const syncSummary = `Synchronisierung abgeschlossen (${uploaded} Paket(e) übertragen, ${remaining} verbleibend).`;
  if (uploaded > 0 && remaining > 0) {
    if (blockedAuth > 0 && blockedRetryLimit > 0) {
      return `${syncSummary} ${blockedAuth} Paket(e) benötigen eine neue Anmeldung, ${blockedRetryLimit} Paket(e) pausieren nach mehreren Fehlversuchen.`;
    }
    if (blockedAuth > 0) {
      return `${syncSummary} ${blockedAuth} Paket(e) benötigen eine neue Anmeldung.`;
    }
    if (blockedRetryLimit > 0) {
      return `${syncSummary} ${blockedRetryLimit} Paket(e) pausieren nach mehreren Fehlversuchen.`;
    }
    return `${syncSummary} Bitte prüfe die Verbindung oder versuche es später erneut.`;
  }
  if (uploaded > 0) {
    return `Synchronisierung abgeschlossen (${uploaded} Paket(e) übertragen).`;
  }
  if (remaining > 0) {
    if (blocked > 0 && blocked === remaining) {
      if (blockedAuth > 0 && blockedRetryLimit > 0) {
        return `${blockedAuth} Paket(e) sind durch eine abgelaufene Sitzung blockiert, ${blockedRetryLimit} Paket(e) pausieren nach mehreren Fehlversuchen.`;
      }
      if (blockedAuth > 0) {
        return `${blockedAuth} Paket(e) sind durch eine abgelaufene Sitzung blockiert. Bitte melde dich erneut an.`;
      }
      return `${blockedRetryLimit} Paket(e) pausieren nach mehreren Fehlversuchen. Bitte prüfe die Verbindung und starte sie bei Bedarf manuell erneut.`;
    }
    if (blockedAuth > 0 && blockedRetryLimit > 0) {
      return `${remaining} Paket(e) verbleiben, davon ${blockedAuth} mit abgelaufener Sitzung und ${blockedRetryLimit} nach mehreren Fehlversuchen pausiert.`;
    }
    if (blockedAuth > 0) {
      return `${remaining} Paket(e) verbleiben, davon ${blockedAuth} mit abgelaufener Sitzung. Bitte melde dich erneut an.`;
    }
    if (blockedRetryLimit > 0) {
      return `${remaining} Paket(e) verbleiben, davon ${blockedRetryLimit} nach mehreren Fehlversuchen pausiert. Bitte prüfe die Verbindung und starte sie bei Bedarf manuell erneut.`;
    }
    return `${remaining} Paket(e) warten noch auf Upload. Bitte prüfe die Verbindung oder versuche es später erneut.`;
  }
  return 'Keine Pakete in der Warteschlange gefunden.';
};

function formatQueueStatusMessage({
  queuedCount,
  queueWaitingCount,
  blockedAuthCount,
  blockedRetryLimitCount,
  lastQueuedKey,
}: {
  queuedCount: number;
  queueWaitingCount: number;
  blockedAuthCount: number;
  blockedRetryLimitCount: number;
  lastQueuedKey: string | null;
}): string {
  const keySuffix = lastQueuedKey ? ` · ${lastQueuedKey}` : '';
  if (queuedCount === 0) {
    return 'Keine offenen Pakete.';
  }
  if (queueWaitingCount === 0) {
    if (blockedAuthCount > 0 && blockedRetryLimitCount > 0) {
      return `${blockedAuthCount} Paket(e) warten auf neue Anmeldung, ${blockedRetryLimitCount} Paket(e) pausieren nach mehreren Fehlversuchen${keySuffix}`;
    }
    if (blockedAuthCount > 0) {
      return `${blockedAuthCount} Paket(e) warten auf neue Anmeldung${keySuffix}`;
    }
    return `${blockedRetryLimitCount} Paket(e) pausieren nach mehreren Fehlversuchen${keySuffix}`;
  }
  if (blockedAuthCount > 0 && blockedRetryLimitCount > 0) {
    return `${queueWaitingCount} Paket(e) warten auf Upload, ${blockedAuthCount} Paket(e) auf neue Anmeldung, ${blockedRetryLimitCount} Paket(e) pausieren${keySuffix}`;
  }
  if (blockedAuthCount > 0) {
    return `${queueWaitingCount} Paket(e) warten auf Upload, ${blockedAuthCount} Paket(e) auf neue Anmeldung${keySuffix}`;
  }
  if (blockedRetryLimitCount > 0) {
    return `${queueWaitingCount} Paket(e) warten auf Upload, ${blockedRetryLimitCount} Paket(e) pausieren${keySuffix}`;
  }
  return `${queuedCount} Paket(e) warten auf Upload${keySuffix}`;
}




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

type ReportConfusion = {
  label: string;
  count: number;
};

type ReportLabelDiagnostic = {
  label: string;
  bundleCount: number;
  rejectedBundleCount: number;
  windowCount: number;
  prototypeCount: number;
  trainGroupCount: number;
  validationGroupCount: number;
  confusionScope: string;
  topConfusions: ReportConfusion[];
};

type ReportDatasetHealth = {
  labelCount: number;
  minClassCount: number;
  maxClassCount: number;
  medianClassCount: number;
  imbalanceRatio: number | null;
  lowSupportLabelCount: number;
  lowSupportLabels: Array<{ label: string; count: number }>;
  labelsWithoutValidation: string[];
  rejectedBundleLabels: Array<{ label: string; rejectedBundleCount: number }>;
  confusionHotspots: Array<{ label: string; confusedWith: string; count: number }>;
};

function parseReportConfusions(raw: unknown): ReportConfusion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => ({
      label: typeof entry['label'] === 'string' ? entry['label'] : '',
      count: typeof entry['count'] === 'number' && Number.isFinite(entry['count']) ? entry['count'] : 0,
    }))
    .filter((entry) => entry.label.length > 0 && entry.count > 0);
}

function parseLabelDiagnostics(raw: unknown): ReportLabelDiagnostic[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => ({
      label: typeof entry['label'] === 'string' ? entry['label'] : '',
      bundleCount:
        typeof entry['bundle_count'] === 'number' && Number.isFinite(entry['bundle_count']) ? entry['bundle_count'] : 0,
      rejectedBundleCount:
        typeof entry['rejected_bundle_count'] === 'number' && Number.isFinite(entry['rejected_bundle_count'])
          ? entry['rejected_bundle_count']
          : 0,
      windowCount:
        typeof entry['window_count'] === 'number' && Number.isFinite(entry['window_count']) ? entry['window_count'] : 0,
      prototypeCount:
        typeof entry['prototype_count'] === 'number' && Number.isFinite(entry['prototype_count'])
          ? entry['prototype_count']
          : 0,
      trainGroupCount:
        typeof entry['train_group_count'] === 'number' && Number.isFinite(entry['train_group_count'])
          ? entry['train_group_count']
          : 0,
      validationGroupCount:
        typeof entry['validation_group_count'] === 'number' && Number.isFinite(entry['validation_group_count'])
          ? entry['validation_group_count']
          : 0,
      confusionScope: typeof entry['confusion_scope'] === 'string' ? entry['confusion_scope'] : 'none',
      topConfusions: parseReportConfusions(entry['top_confusions']),
    }))
    .filter((entry) => entry.label.length > 0);
}

function parseDatasetHealth(raw: unknown): ReportDatasetHealth | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const parseLabelCounts = (value: unknown) =>
    Array.isArray(value)
      ? value
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => ({
            label: typeof item['label'] === 'string' ? item['label'] : '',
            count: typeof item['count'] === 'number' && Number.isFinite(item['count']) ? item['count'] : 0,
          }))
          .filter((item) => item.label.length > 0 && item.count > 0)
      : [];
  const parseRejectedLabels = (value: unknown) =>
    Array.isArray(value)
      ? value
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => ({
            label: typeof item['label'] === 'string' ? item['label'] : '',
            rejectedBundleCount:
              typeof item['rejected_bundle_count'] === 'number' && Number.isFinite(item['rejected_bundle_count'])
                ? item['rejected_bundle_count']
                : 0,
          }))
          .filter((item) => item.label.length > 0 && item.rejectedBundleCount > 0)
      : [];
  const parseHotspots = (value: unknown) =>
    Array.isArray(value)
      ? value
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => ({
            label: typeof item['label'] === 'string' ? item['label'] : '',
            confusedWith: typeof item['confused_with'] === 'string' ? item['confused_with'] : '',
            count: typeof item['count'] === 'number' && Number.isFinite(item['count']) ? item['count'] : 0,
          }))
          .filter((item) => item.label.length > 0 && item.confusedWith.length > 0 && item.count > 0)
      : [];

  return {
    labelCount: typeof entry['label_count'] === 'number' && Number.isFinite(entry['label_count']) ? entry['label_count'] : 0,
    minClassCount:
      typeof entry['min_class_count'] === 'number' && Number.isFinite(entry['min_class_count']) ? entry['min_class_count'] : 0,
    maxClassCount:
      typeof entry['max_class_count'] === 'number' && Number.isFinite(entry['max_class_count']) ? entry['max_class_count'] : 0,
    medianClassCount:
      typeof entry['median_class_count'] === 'number' && Number.isFinite(entry['median_class_count'])
        ? entry['median_class_count']
        : 0,
    imbalanceRatio:
      typeof entry['imbalance_ratio'] === 'number' && Number.isFinite(entry['imbalance_ratio'])
        ? entry['imbalance_ratio']
        : null,
    lowSupportLabelCount:
      typeof entry['low_support_label_count'] === 'number' && Number.isFinite(entry['low_support_label_count'])
        ? entry['low_support_label_count']
        : 0,
    lowSupportLabels: parseLabelCounts(entry['low_support_labels']),
    labelsWithoutValidation: Array.isArray(entry['labels_without_validation'])
      ? entry['labels_without_validation'].filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [],
    rejectedBundleLabels: parseRejectedLabels(entry['rejected_bundle_labels']),
    confusionHotspots: parseHotspots(entry['confusion_hotspots']),
  };
}

function resolveLabelReadiness(entry: ReportLabelDiagnostic): { title: string; hint: string } {
  if (entry.windowCount === 0) {
    return {
      title: 'Noch nicht stabil im Modell',
      hint: 'Aus den bisherigen Aufnahmen wurden noch keine verwertbaren Trainingsfenster erzeugt.',
    };
  }
  if (entry.rejectedBundleCount > 0) {
    return {
      title: 'Mehr saubere Aufnahmen empfohlen',
      hint: `${entry.rejectedBundleCount} Aufnahme(n) wurden verworfen. Bitte auf Bildausschnitt, Licht und klare Bewegung achten.`,
    };
  }
  if (entry.bundleCount <= 1) {
    return {
      title: 'Bootstrap gestartet',
      hint: 'Ein guter Clip reicht für den ersten Modellstand. Weitere Uploads verbessern Stabilität, Prototypen und unabhängige Prüfung.',
    };
  }
  if (entry.validationGroupCount <= 0 || entry.confusionScope !== 'validation') {
    return {
      title: 'Noch ohne unabhängige Prüfung',
      hint: 'Für diese Gebärde gibt es noch keine getrennte Prüf-Aufnahme. Eine zweite unabhängige Aufnahme macht die Qualitätsaussage ehrlicher, ohne den ersten Modellstand zu blockieren.',
    };
  }
  if (entry.topConfusions.length > 0) {
    const top = entry.topConfusions[0];
    if (!top) {
      return {
        title: 'Verwechslungsrisiko',
        hint: 'Das Modell trennt ähnliche Gebärden noch nicht stabil genug.',
      };
    }
    return {
      title: 'Verwechslungsrisiko',
      hint: `Das Modell verwechselt diese Gebärde noch am ehesten mit "${top.label}" (${top.count} Treffer im Report).`,
    };
  }
  return {
    title: 'Bereit',
    hint: 'Die Gebärde wurde mit eigenen Fenstern und Prototypen ins Modell übernommen.',
  };
}

function formatModelSourceLabel(
  modelStatus: 'idle' | 'loading' | 'ready' | 'error',
  modelMeta: Pick<MlpModelMeta, 'source' | 'version'> | null,
): string {
  if (modelStatus === 'loading') {
    return 'Modell wird geladen…';
  }
  if (modelStatus === 'ready' && modelMeta?.source === 'profile') {
    return `Persönliches Profilmodell${modelMeta.version ? ` (Version ${modelMeta.version})` : ''}`;
  }
  if (modelStatus === 'ready' && modelMeta?.source === 'global') {
    return `Globales Ersatzmodell${modelMeta.version ? ` (Version ${modelMeta.version})` : ''}`;
  }
  if (modelStatus === 'error') {
    return 'Modell konnte nicht geladen werden';
  }
  return 'Noch kein Modell aktiv';
}

function formatModelContractHint(modelMeta: MlpModelMeta | null): string | null {
  if (!modelMeta || modelMeta.contractStatus === 'valid') {
    return null;
  }
  if (modelMeta.contractStatus === 'missing') {
    return 'Der Modellvertrag fehlt. Das Modell bleibt nutzbar, wird aber als Übergangslösung behandelt.';
  }
  if (modelMeta.contractStatus === 'invalid') {
    return `Der Modellvertrag ist ungültig (${formatContractReason(modelMeta.contractReason)}).`;
  }
  return null;
}

function TrainingStatusBlock({
  uploader,
  message,
  onSyncQueued,
  actionSlot,
  onSyncBundle,
  onRemoveBundle,
  modelStatus,
  modelMeta,
  profileId,
}: {
  uploader: TrainingUploaderHandle;
  message?: string;
  onSyncQueued: () => Promise<void>;
  actionSlot?: ReactNode;
  onSyncBundle?: (key: string) => Promise<void>;
  onRemoveBundle?: (key: string) => Promise<void>;
  modelStatus: 'idle' | 'loading' | 'ready' | 'error';
  modelMeta: MlpModelMeta | null;
  profileId: string | null;
}) {
  const { error, syncError, trainingJobError, queuedCount, syncing, lastQueuedKey, lastResult, trainingJob, queuedBundles } = uploader;
  const activeTrainingJob = trainingJob ?? lastResult?.trainingJob ?? null;
  const modelContractHint = formatModelContractHint(modelMeta);

  const blockedAuthCount = queuedBundles.filter((bundle) =>
    bundle.status === 'failed' && isAuthFailureReason(bundle.lastError),
  ).length;
  const blockedRetryLimitCount = queuedBundles.filter((bundle) =>
    bundle.status === 'failed'
    && !isAuthFailureReason(bundle.lastError)
    && !hasAutomaticUploadAttemptsRemaining(bundle),
  ).length;
  const queueWaitingCount = Math.max(0, queuedBundles.length - blockedAuthCount - blockedRetryLimitCount);

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
      <div className="notice info">
        Aktive Modellquelle: {formatModelSourceLabel(modelStatus, modelMeta)}
        {profileId && modelMeta?.source === 'global' ? (
          <p className="muted small mt-xs">
            Für dieses Profil läuft die Erkennung derzeit auf dem globalen Ersatzmodell, nicht auf einem persönlichen Profilmodell.
          </p>
        ) : null}
        {typeof modelMeta?.labelCount === 'number' ? (
          <p className="muted small mt-xs">Aktive Modell-Labels: {modelMeta.labelCount}</p>
        ) : null}
        {modelContractHint ? (
          <p className="muted small mt-xs">{modelContractHint}</p>
        ) : null}
      </div>
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
            {formatQueueStatusMessage({
              queuedCount,
              queueWaitingCount,
              blockedAuthCount,
              blockedRetryLimitCount,
              lastQueuedKey,
            })}
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

function TrainingResultCard({
  result,
  trainingJob,
  profileId,
}: {
  result: UploadTrainingBundleResponse;
  trainingJob: TrainingJobInfo | null;
  profileId: string | null;
}) {
  if (!result) return null;
  const activeTrainingJob = trainingJob ?? result.trainingJob ?? null;
  const report = activeTrainingJob?.report;
  const profileReportRaw =
    profileId && report && typeof report === 'object' && report['profiles'] && typeof report['profiles'] === 'object'
      ? (report['profiles'] as Record<string, unknown>)[profileId]
      : null;
  const hasProfileContext = typeof profileId === 'string' && profileId.length > 0;
  const profileLabelDiagnostics = profileReportRaw && typeof profileReportRaw === 'object'
    ? parseLabelDiagnostics((profileReportRaw as Record<string, unknown>)['label_diagnostics'])
    : [];
  const globalLabelDiagnostics = report && typeof report === 'object' && report['global'] && typeof report['global'] === 'object'
    ? parseLabelDiagnostics((report['global'] as Record<string, unknown>)['label_diagnostics'])
    : [];
  const profileDatasetHealth = profileReportRaw && typeof profileReportRaw === 'object'
    ? parseDatasetHealth((profileReportRaw as Record<string, unknown>)['dataset_health'])
    : null;
  const globalDatasetHealth = report && typeof report === 'object' && report['global'] && typeof report['global'] === 'object'
    ? parseDatasetHealth((report['global'] as Record<string, unknown>)['dataset_health'])
    : null;
  const labelDiagnostics = hasProfileContext ? profileLabelDiagnostics : globalLabelDiagnostics;
  const datasetHealth = hasProfileContext ? profileDatasetHealth : globalDatasetHealth;
  const showMissingProfileDiagnosticsNotice = hasProfileContext && labelDiagnostics.length === 0;

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
      {labelDiagnostics.length > 0 && (
        <div>
          <p className="eyebrow">Label-Bereitschaft</p>
          <ul className="muted small bullets">
            {labelDiagnostics.map((entry) => {
              const readiness = resolveLabelReadiness(entry);
              return (
                <li key={entry.label}>
                  <strong>{entry.label}</strong>: {readiness.title}. {readiness.hint}{' '}
                  {`Fenster: ${entry.windowCount}, Bundles: ${entry.bundleCount}, Prototypen: ${entry.prototypeCount}.`}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {datasetHealth && (
        <div>
          <p className="eyebrow">Datensatz-Check</p>
          <p className="muted small">
            Labels: {datasetHealth.labelCount}
            {` · Klassenfenster: ${datasetHealth.minClassCount} bis ${datasetHealth.maxClassCount}`}
            {datasetHealth.imbalanceRatio !== null ? ` · Ungleichgewicht: ${datasetHealth.imbalanceRatio.toFixed(1)}x` : ''}
          </p>
          <ul className="muted small bullets">
            {datasetHealth.lowSupportLabels.length > 0 ? (
              <li>
                Wenig Beispiele: {datasetHealth.lowSupportLabels.map((entry) => `${entry.label} (${entry.count})`).join(', ')}.
              </li>
            ) : null}
            {datasetHealth.labelsWithoutValidation.length > 0 ? (
              <li>
                Ohne unabhängige Prüfung: {datasetHealth.labelsWithoutValidation.join(', ')}.
              </li>
            ) : null}
            {datasetHealth.rejectedBundleLabels.length > 0 ? (
              <li>
                Verworfene Aufnahmen: {datasetHealth.rejectedBundleLabels
                  .map((entry) => `${entry.label} (${entry.rejectedBundleCount})`)
                  .join(', ')}.
              </li>
            ) : null}
            {datasetHealth.confusionHotspots.length > 0 ? (
              <li>
                Häufige Verwechslungen: {datasetHealth.confusionHotspots
                  .map((entry) => `${entry.label} → ${entry.confusedWith} (${entry.count})`)
                  .join(', ')}.
              </li>
            ) : null}
          </ul>
        </div>
      )}
      {showMissingProfileDiagnosticsNotice && (
        <div>
          <p className="muted small">
            Für dieses Profil liegen noch keine profilbezogenen Label-Diagnosen vor. Globale Modellwerte werden hier bewusst nicht als Profilbewertung angezeigt.
          </p>
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

interface DatasetReadinessCardProps {
  summary: DatasetReadinessSummary | null;
  loading: boolean;
  error: string | null;
}

function DatasetReadinessCard({ summary, loading, error }: DatasetReadinessCardProps) {
  const firstUnreadyShot = summary?.shots.find((entry) => !entry.ready);
  return (
    <div className="card mt-md">
      <p className="eyebrow">Few-Shot-Bereitschaft</p>
      <p className="muted small">
        Dieser Check zeigt, ob der aktuelle Trainingsstand für ehrliche 1/3/5/10-Shot-Vergleiche reicht.
      </p>
      {loading ? <p className="muted small">Datensatz-Bereitschaft wird geladen…</p> : null}
      {error ? <div className="notice warning">{error}</div> : null}
      {!loading && !error && !summary ? (
        <div className="notice info">Noch keine Datensatz-Auswertung verfügbar.</div>
      ) : null}
      {summary ? (
        <>
          <p className="value">
            {summary.status === 'ready'
              ? 'Bereit für 1/3/5/10-Shot'
              : summary.status === 'partial'
              ? 'Teilweise bereit'
              : 'Noch nicht bereit'}
          </p>
          <p className="muted small">
            Bundles: {summary.manifest.acceptedBundleCount} nutzbar von {summary.manifest.entryCount}
            {` · Labels: ${summary.manifest.acceptedLabelCount}`}
            {` · Profile: ${summary.manifest.acceptedProfileCount}`}
          </p>
          <ul className="muted small bullets">
            {summary.shots.map((shot) => (
              <li key={shot.shot}>
                <strong>{shot.shot}-Shot</strong>: {shot.ready ? 'bereit' : 'noch nicht bereit'} ({shot.readyLabelCount}/{shot.totalLabelCount} Labels)
              </li>
            ))}
          </ul>
          {summary.blockers.length > 0 ? (
            <div className="notice warning">
              {summary.blockers[0]}
            </div>
          ) : null}
          {firstUnreadyShot && firstUnreadyShot.missingLabels.length > 0 ? (
            <p className="muted small">
              Nächster Engpass: {firstUnreadyShot.missingLabels
                .slice(0, 3)
                .map((entry) => {
                  const parts = [];
                  if (entry.missingAcceptedBundles > 0) {
                    parts.push(`+${entry.missingAcceptedBundles} Bundle(s)`);
                  }
                  if (entry.missingProfiles > 0) {
                    parts.push(`+${entry.missingProfiles} Profil(e)`);
                  }
                  return `${entry.label} (${parts.join(', ')})`;
                })
                .join(', ')}.
            </p>
          ) : null}
        </>
      ) : null}
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
    preferredSignName,
    profileId,
    profileMetadata,
  } = useAppState();
  const preferredSignIdValue = preferredSignId ?? '';
  const preferredSignNameValue = preferredSignName ?? '';

  // Ensure all local profiles are synced to the server before uploading
  const profileSyncedRef = useRef(false);
  useEffect(() => {
    if (apiToken && !profileSyncedRef.current) {
      profileSyncedRef.current = true;
      void syncAllProfilesToServer(apiToken);
    }
  }, [apiToken]);

  const modelInjection = useMlpModelInjection(profileId);
  const { symbols, syncError: symbolSyncError, refresh: refreshSymbols, loading: symbolsLoading } = useSymbolStore();
  const vocabularySet = profileMetadata?.vocabularySet ?? 'basis';
  const { symbols: metacomSymbols } = useMetacomBundle({ vocabularySet });
  const { combinedSymbols, symbolById, symbolByName } = useMemo(() => {
    const merged = new Map<string, SymbolDefinition>();
    const idByName = new Map<string, string>();

    for (const symbol of dedupeSymbolsByName(symbols)) {
      const normalizedName = normalizeSymbolName(symbol.name);
      merged.set(symbol.id, symbol);
      if (normalizedName) {
        idByName.set(normalizedName, symbol.id);
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
        if (idByName.has(normalizedName)) {
          continue;
        }
      }
      if (!merged.has(nextSymbol.id)) {
        merged.set(nextSymbol.id, nextSymbol);
        if (normalizedName) {
          idByName.set(normalizedName, nextSymbol.id);
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
  const [datasetReadiness, setDatasetReadiness] = useState<DatasetReadinessSummary | null>(null);
  const [datasetReadinessLoading, setDatasetReadinessLoading] = useState<boolean>(false);
  const [datasetReadinessError, setDatasetReadinessError] = useState<string | null>(null);
  const hasProfileContext = !!profileId && profileId.trim().length > 0;
  const hasGestureSelection = preferredSignIdValue.trim().length > 0;
  const metadataReady = hasProfileContext && hasGestureSelection;
  const metadataError = metadataReady
    ? ''
    : 'Bitte wähle ein Profil und eine Gebärde aus, bevor du eine Aufnahme startest oder hochlädst.';
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
    const endpoint = resolveApiUrl('/api/v1/dgs/dataset-readiness', apiBaseUrl);
    let cancelled = false;
    setDatasetReadinessLoading(true);
    fetchDatasetReadiness({
      endpoint,
      token: apiToken,
    })
      .then((summary) => {
        if (cancelled) return;
        setDatasetReadiness(summary);
        setDatasetReadinessError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof HttpError) {
          setDatasetReadinessError(error.message);
          return;
        }
        const details = error instanceof Error ? error.message : String(error);
        setDatasetReadinessError(`Datensatz-Bereitschaft konnte nicht geladen werden: ${details}`);
      })
      .finally(() => {
        if (!cancelled) {
          setDatasetReadinessLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, apiToken, lastResult?.id]);

  useEffect(() => {
    if (!profileId) {
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
        if (error instanceof HttpError) {
          setQualityError(error.message);
          return;
        }
        const details = error instanceof Error ? error.message : String(error);
        setQualityError(`Qualitätsprotokoll konnte nicht geladen werden: ${details}`);
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

  const canonicalTrainingLabel = useMemo(() => {
    const base = preferredSignIdValue.trim().length > 0 ? preferredSignIdValue : preferredSignNameValue;
    const normalized = normalizeGestureLabel(base);
    return normalized || base.trim().toLowerCase();
  }, [preferredSignIdValue, preferredSignNameValue]);

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
      const result = await uploadState.syncQueued(undefined, { includeAuthBlocked: true });
      setLastQueueSyncResult(result);
      setMessage(formatSyncQueuedMessage(result));
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
    //   as externally resolved auth blocking and clear stale sync snapshot state only.
    // - setLastQueueSyncResult(null) intentionally drops outdated sync snapshots so later
    //   runs do not re-process auth-blocked queue results.
    if (!hasAnyAuthToken || hasAuthBlockedBundles || !lastQueueSyncResult) {
      return;
    }
    if (lastQueueSyncResult.blocked <= 0) {
      setLastQueueSyncResult(null);
      return;
    }

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
    uploadState.syncQueued(undefined, { includeAuthBlocked: true }).then((result) => {
      if (cancelled) return;
      setLastQueueSyncResult(result);
      setMessage(formatSyncQueuedMessage(result));
      const { blocked } = result;
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
        profileId={metadataReady ? (profileId ?? '') : ''}
        label={canonicalTrainingLabel}
        {...(preferredSignId ? { symbolId: preferredSignId } : {})}
        onRecordingComplete={handleRecordingComplete}
      />

      <div className="card mt-md">
        <div className="form-group">
          <label htmlFor="record-profile">Ausgewähltes Profil</label>
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
          modelStatus={modelInjection.status}
          modelMeta={modelInjection.lastMeta}
          profileId={profileId}
        />
      </div>



      <DatasetReadinessCard
        summary={datasetReadiness}
        loading={datasetReadinessLoading}
        error={datasetReadinessError}
      />
      <TrainingQualityLogCard entries={qualityEntries} loading={qualityLoading} error={qualityError} />

      {lastResult && (
        <div className="mt-md">
          <TrainingResultCard result={lastResult} trainingJob={trainingJob} profileId={profileId} />
        </div>
      )}
    </>
  );
}
