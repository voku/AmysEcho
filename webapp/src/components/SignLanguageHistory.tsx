import { useAppState } from '../hooks/useAppState';
import { gestureMeaningService } from '../services/gestureMeaningService';

/**
 * Displays a list of recently recognized gestures.
 * Mirrors the HistoryScreen from the Expo app.
 */
export function SignLanguageHistory() {
  const { recentSigns, lastRecognizedSign } = useAppState();

  const formatGestureLabel = (label: string): string => {
    // Try to get meaning from the service first (user-defined DGS vocabulary)
    const meaning = gestureMeaningService.getMeaning(label.toLowerCase());
    if (meaning) {
      return meaning.label;
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
