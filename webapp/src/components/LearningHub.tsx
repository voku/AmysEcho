import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSymbolStore } from '../context/SymbolStore';

interface GestureItem {
  id: string;
  label: string;
  emoji: string;
  description: string;
  imageUrl?: string | null;
}

const BASELINE_GESTURES: GestureItem[] = [
  { id: 'alle', label: 'Alle', emoji: '👐', description: 'Zeigt mit beiden Händen' },
  { id: 'blau', label: 'Blau', emoji: '🔵', description: 'Farbe Blau zeigen' },
  { id: 'essen', label: 'Essen', emoji: '🍽️', description: 'Hand zum Mund führen' },
  { id: 'fertig', label: 'Fertig', emoji: '✅', description: 'Abschließende Geste' },
  { id: 'gelb', label: 'Gelb', emoji: '🟡', description: 'Farbe Gelb zeigen' },
  { id: 'gruen', label: 'Grün', emoji: '🟢', description: 'Farbe Grün zeigen' },
  { id: 'nochmal', label: 'Nochmal', emoji: '🔄', description: 'Wiederholung zeigen' },
  { id: 'rot', label: 'Rot', emoji: '🔴', description: 'Farbe Rot zeigen' },
  { id: 'satt', label: 'Satt', emoji: '😊', description: 'Zeigt Sättigung' },
  { id: 'schwester', label: 'Schwester', emoji: '👧', description: 'Schwester zeigen' },
  { id: 'spielen', label: 'Spielen', emoji: '🎮', description: 'Spielerische Bewegung' },
  { id: 'trinken', label: 'Trinken', emoji: '🥤', description: 'Trinkbewegung' },
];

/**
 * LearningHub component - mirrors LernenScreen from the Expo app.
 * Shows available gestures and allows users to start training for each.
 */
export function LearningHub() {
  const { symbols, refresh, syncError, loading } = useSymbolStore();
  const gestures = useMemo(() => {
    if (symbols.length > 0) {
      return symbols.map((symbol) => ({
        id: symbol.id,
        label: symbol.name,
        emoji: symbol.imageUrl ? '🖼️' : '🧩',
        description: symbol.category,
        imageUrl: symbol.imageUrl,
      }));
    }
    return BASELINE_GESTURES;
  }, [symbols]);
  const navigate = useNavigate();

  const handleTrainGesture = (gestureId: string, label: string) => {
    navigate(`/training?symbolId=${encodeURIComponent(gestureId)}&gesture=${encodeURIComponent(label)}`);
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Lernen</p>
          <h2>Gesten trainieren</h2>
          <p className="muted">
            Wähle eine Geste aus, um Trainingsbeispiele aufzunehmen. 
            Je mehr Beispiele, desto besser die Erkennung.
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="learning-stats">
        <div className="stat-item">
          <span className="stat-number">{gestures.length}</span>
          <span className="stat-label">Verfügbare Gesten</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">~5</span>
          <span className="stat-label">Beispiele empfohlen</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">~1 Min</span>
          <span className="stat-label">Pro Geste</span>
        </div>
      </div>

      <div className="action-row mb-sm">
        <button className="secondary-button" onClick={refresh} disabled={loading}>
          Jetzt synchronisieren
        </button>
        {loading && <span className="muted small">Aktualisiere…</span>}
      </div>
      {syncError && <div className="notice warning">Symbole konnten nicht geladen werden: {syncError}</div>}

      {/* Gesture list */}
      <div className="gesture-learning-list">
        {gestures.map((gesture) => (
          <div key={gesture.id} className="gesture-learning-card">
            <div className="gesture-info">
              {gesture.imageUrl ? (
                <img src={gesture.imageUrl} alt={gesture.label} className="gesture-image-large" />
              ) : (
                <span className="gesture-emoji-large">{gesture.emoji}</span>
              )}
              <div className="gesture-details">
                <h3>{gesture.label}</h3>
                <p className="muted small">{gesture.description || 'Benutzerdefinierte Kategorie'}</p>
                <p className="muted small">Empfohlen: 5 Beispiele · ca. 1 Minute</p>
              </div>
            </div>
            <button
              className="train-button"
              onClick={() => handleTrainGesture(gesture.id, gesture.label)}
            >
              Trainieren
            </button>
          </div>
        ))}
      </div>

      {/* Add custom gesture */}
      <div className="custom-gesture-section">
        <h3>➕ Eigene Geste hinzufügen</h3>
        <p className="muted">
          Du kannst auch eigene Gesten erstellen und trainieren.
        </p>
        <Link to="/training" className="add-gesture-button">
          Neue Geste erstellen
        </Link>
      </div>

      {/* Tips */}
      <div className="learning-tips">
        <h3>💡 Tipps für effektives Training</h3>
        <ul>
          <li>Nimm Beispiele aus verschiedenen Winkeln auf</li>
          <li>Variiere die Geschwindigkeit leicht</li>
          <li>Trainiere bei unterschiedlichen Lichtverhältnissen</li>
          <li>Lade regelmäßig neue Beispiele hoch</li>
        </ul>
      </div>
    </section>
  );
}
