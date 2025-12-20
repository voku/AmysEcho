import { useAppState } from '../hooks/useAppState';

/**
 * Displays a list of recently recognized gestures.
 * Mirrors the HistoryScreen from the Expo app.
 */
export function GestureHistory() {
  const { recentGestures, lastRecognizedGesture } = useAppState();

  const formatGestureLabel = (label: string): string => {
    const mappings: Record<string, string> = {
      'alle': 'Alle',
      'blau': 'Blau',
      'essen': 'Essen',
      'fertig': 'Fertig',
      'gelb': 'Gelb',
      'gruen': 'Grün',
      'nochmal': 'Nochmal',
      'rot': 'Rot',
      'satt': 'Satt',
      'schwester': 'Schwester',
      'spielen': 'Spielen',
      'trinken': 'Trinken',
      'HILFE': 'Hilfe',
      'open_palm': 'Offene Hand',
      'fist': 'Faust',
      'pointing_up': 'Zeigen (hoch)',
      'thumbs_up': 'Daumen hoch',
      'peace': 'Peace-Zeichen',
    };
    return mappings[label] || label;
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
