import type { PersistedTrainingBundle } from '../training/trainingQueue';

interface TrainingQueueListProps {
  bundles: PersistedTrainingBundle[];
  onSyncBundle?: (key: string) => Promise<void>;
  onRemoveBundle?: (key: string) => Promise<void>;
  syncing?: boolean;
}

function formatBytes(bytes?: number) {
  if (!bytes) return '0 Bytes';
  const units = ['Bytes', 'KB', 'MB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function TrainingQueueList({ bundles = [], onSyncBundle, onRemoveBundle, syncing }: TrainingQueueListProps) {
  if (bundles.length === 0) {
    return <p className="muted small">Keine gespeicherten Bundles vorhanden.</p>;
  }

  return (
    <ul className="muted small queue-list">
      {bundles.map((bundle) => (
        <li key={bundle.key} className="queue-item">
          <div>
            <p className="eyebrow">
              {bundle.label} · {bundle.profileId}
            </p>
            <p className="muted small">
              Aufgenommen: {new Date(bundle.capturedAt).toLocaleString()} · Frames: {bundle.framesCount} · Status:{' '}
              {bundle.status}
              {bundle.lastError ? ` · Fehler: ${bundle.lastError}` : ''}
            </p>
            <p className="muted small">
              Größe: {formatBytes(bundle.zipBytes)}{' '}
              {bundle.clipBytes ? ` · Clip: ${formatBytes(bundle.clipBytes)}` : ''}
              {bundle.stillBytes ? ` · Standbild: ${formatBytes(bundle.stillBytes)}` : ''}
              {bundle.attempts > 0 ? ` · Versuche: ${bundle.attempts}` : ''}
            </p>
          </div>
          <div className="queue-actions">
            {onSyncBundle && (
              <button
                type="button"
                className="ghost"
                onClick={() => onSyncBundle(bundle.key)}
                disabled={syncing || bundle.status === 'uploading'}
              >
                Jetzt hochladen
              </button>
            )}
            {onRemoveBundle && (
              <button type="button" className="ghost" onClick={() => onRemoveBundle(bundle.key)} disabled={syncing}>
                Löschen
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

