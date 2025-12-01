import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSymbolStore, type SymbolDefinition } from '../context/SymbolStore';

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
  const { symbols, refresh, syncError, loading, saveSymbol } = useSymbolStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [savingSymbol, setSavingSymbol] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    category: '',
    imageUrl: '',
    imageDataUrl: '',
  });
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

  const handleOpenModal = () => {
    setFormData({ id: '', name: '', category: 'custom', imageUrl: '', imageDataUrl: '' });
    setImagePreview(null);
    setModalOpen(true);
  };

  const handleEditSymbol = (symbol: SymbolDefinition) => {
    setFormData({
      id: symbol.id,
      name: symbol.name,
      category: symbol.category,
      imageUrl: symbol.imageUrl ?? '',
      imageDataUrl: '',
    });
    setImagePreview(symbol.imageUrl ?? null);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSavingSymbol(false);
  };

  const handleImageFile = (file: File | null) => {
    if (!file) {
      setFormData((prev) => ({ ...prev, imageDataUrl: '', imageUrl: prev.imageUrl }));
      setImagePreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setFormData((prev) => ({ ...prev, imageDataUrl: result, imageUrl: '' }));
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSymbol = async () => {
    if (!formData.name.trim()) {
      return;
    }
    setSavingSymbol(true);
    const id = formData.id.trim() || `symbol_${Date.now()}`;
    await saveSymbol({
      id,
      name: formData.name.trim(),
      category: formData.category.trim() || 'custom',
      imageUrl: formData.imageDataUrl ? undefined : formData.imageUrl || null,
      imageDataUrl: formData.imageDataUrl || undefined,
    });
    setSavingSymbol(false);
    setModalOpen(false);
  };

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
      {!syncError && symbols.length === 0 && (
        <div className="notice info">
          Wir laden die Symbolsammlung vom Server. Du kannst trotzdem schon eigene Gesten hinzufügen und sofort trainieren.
        </div>
      )}

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
            <div className="gesture-actions">
              <button
                className="train-button"
                onClick={() => handleTrainGesture(gesture.id, gesture.label)}
              >
                Trainieren
              </button>
              {symbols.length > 0 && (
                <button className="secondary-button" onClick={() => handleEditSymbol({
                  id: gesture.id,
                  name: gesture.label,
                  category: gesture.description,
                  imageUrl: gesture.imageUrl,
                })}>
                  Anpassen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add custom gesture */}
      <div className="custom-gesture-section">
        <h3>➕ Eigene Geste hinzufügen</h3>
        <p className="muted">
          Du kannst auch eigene Gesten erstellen und trainieren. Bild, ID und Kategorie werden direkt mit dem Server synchronisiert.
        </p>
        <div className="action-row">
          <button className="primary-button" onClick={handleOpenModal}>
            Neues Symbol speichern
          </button>
          <Link to="/training" className="add-gesture-button">
            Sofort Training starten
          </Link>
        </div>
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

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Symbol für das Lernen speichern</h3>
            <p className="muted">Sobald du speicherst, steht das Symbol auf der Lern- und Trainingsseite bereit.</p>

            <div className="form-group">
              <label>Symbol-ID</label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                placeholder="z. B. trinken-wasser"
              />
              <p className="muted small">Wird auch für die Server-Synchronisierung genutzt.</p>
            </div>

            <div className="form-group">
              <label>Bezeichnung</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Titel für das Symbol"
              />
            </div>

            <div className="form-group">
              <label>Kategorie</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="z. B. custom, basic, emotion"
              />
            </div>

            <div className="form-group">
              <label>Bild-URL</label>
              <input
                type="url"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value, imageDataUrl: '' })}
                placeholder="https://.../symbol.png"
              />
              <p className="muted small">Alternativ unten ein Bild hochladen.</p>
            </div>

            <div className="form-group">
              <label>Bild hochladen</label>
              <input type="file" accept="image/*" onChange={(e) => handleImageFile(e.target.files?.[0] ?? null)} />
              <p className="muted small">Datei wird als Data-URL gespeichert und mit dem Server synchronisiert.</p>
            </div>

            {imagePreview && (
              <div className="preview-row">
                <p className="muted small">Vorschau</p>
                <img src={imagePreview} alt={formData.name || 'Symbol'} className="symbol-thumb" />
              </div>
            )}

            <div className="modal-actions">
              <button className="primary-button" onClick={handleSaveSymbol} disabled={savingSymbol || !formData.name.trim()}>
                {savingSymbol ? 'Speichert…' : 'Speichern'}
              </button>
              <button className="secondary-button" onClick={handleCloseModal}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
