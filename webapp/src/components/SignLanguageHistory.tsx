import { useAppState } from '../hooks/useAppState';
import { resolveGestureSymbol } from '../services/metacomMappingService';

/**
 * Displays a list of recently recognized gestures.
 * Uses the Metacom mapping layer to show symbol emoji/color/category and
 * falls back to the gestureMeaningService for gestures not on any board.
 */
export function SignLanguageHistory() {
  const { recentSigns, lastRecognizedSign } = useAppState();

  const formatGestureLabel = (label: string): string => {
    const resolution = resolveGestureSymbol(label);
    if (resolution) {
      return `${resolution.emoji} ${resolution.label}`;
    }

    // Fallback: format the raw label nicely
    return label
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (match) => match.toUpperCase());
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Verlauf</p>
          <h2>Erkannte Gebärden</h2>
          <p className="muted">
            Die letzten erkannten Gebärden werden hier angezeigt. Diese Übersicht hilft beim Nachverfolgen
            der Kommunikation.
          </p>
        </div>
      </div>

      {lastRecognizedSign && (
        <div className="notice info">
          <strong>Letzte Gebärde:</strong> {formatGestureLabel(lastRecognizedSign)}
        </div>
      )}

      {recentSigns.length === 0 ? (
        <div className="notice warning">
          <p>Noch keine Gebärden erkannt. Starte die Gebärdenerkennung, um den Verlauf zu füllen.</p>
        </div>
      ) : (
        <div className="history-list">
          <ul className="gesture-history">
            {recentSigns.map((sign, index) => (
              <li key={`${sign}-${index}`} className="history-item">
                <span className="badge">{formatGestureLabel(sign)}</span>
                {index === 0 && <span className="timestamp">Zuletzt</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="controls">
        <p className="muted small">
          Der Verlauf speichert die letzten 5 erkannten Gebärden. Die Daten werden lokal im Browser gespeichert.
        </p>
      </div>
    </section>
  );
}
