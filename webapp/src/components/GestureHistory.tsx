import { useAppState } from '../hooks/useAppState';
import { gestureMeaningService } from '../services/gestureMeaningService';

/**
 * Displays a list of recently recognized gestures.
 * Mirrors the HistoryScreen from the Expo app.
 */
export function GestureHistory() {
  const { recentGestures, lastRecognizedGesture } = useAppState();

  const formatGestureLabel = (label: string): string => {
    // Try to get meaning from the service first
    const meaning = gestureMeaningService.getMeaning(label.toLowerCase());
    if (meaning) {
      return meaning.label;
    }

    // Legacy fallback mappings for gestures not yet in the service
    const legacyMappings: Record<string, string> = {
      'alle': 'Alle',
      'blau': 'Blau',
      'gruen': 'Grün',
      'gelb': 'Gelb',
      'rot': 'Rot',
      'satt': 'Satt',
      'schwester': 'Schwester',
      'nochmal': 'Nochmal',
      'HILFE': 'Hilfe',
      'peace': 'Peace-Zeichen',
    };
    return legacyMappings[label] || label;
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Verlauf</p>
          <h2>Erkannte Gesten</h2>
          <p className="muted">
            Die letzten erkannten Gesten werden hier angezeigt. Diese Übersicht hilft beim Nachverfolgen
            der Kommunikation.
          </p>
        </div>
      </div>

      {lastRecognizedGesture && (
        <div className="notice info">
          <strong>Letzte Geste:</strong> {formatGestureLabel(lastRecognizedGesture)}
        </div>
      )}

      {recentGestures.length === 0 ? (
        <div className="notice warning">
          <p>Noch keine Gesten erkannt. Starte die Gestenerkennung, um den Verlauf zu füllen.</p>
        </div>
      ) : (
        <div className="history-list">
          <ul className="gesture-history">
            {recentGestures.map((gesture, index) => (
              <li key={`${gesture}-${index}`} className="history-item">
                <span className="badge">{formatGestureLabel(gesture)}</span>
                {index === 0 && <span className="timestamp">Zuletzt</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="controls">
        <p className="muted small">
          Der Verlauf speichert die letzten 5 erkannten Gesten. Die Daten werden lokal im Browser gespeichert.
        </p>
      </div>
    </section>
  );
}
