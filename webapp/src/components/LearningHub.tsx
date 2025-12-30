import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSymbolStore, type SymbolDefinition } from '../context/SymbolStore';
import { useMessage } from '../context/MessageContext';

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
  { id: 'fertig', label: 'Fertig', emoji: '✅', description: 'Abschließende Gebärde' },
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
  const { showToast } = useMessage();
  const [modalOpen, setModalOpen] = useState(false);
  const [savingSymbol, setSavingSymbol] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    category: '',
    imageUrl: '',
    imageDataUrl: '',
  });

  const navigate = useNavigate();

  const filteredSymbols = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return symbols;
    return symbols.filter(s => 
      s.name.toLowerCase().includes(term) || 
      s.category.toLowerCase().includes(term)
    );
  }, [symbols, searchTerm]);

  const stats = useMemo(() => {
    const readyCount = symbols.filter(s => s.isReady).length;
    const trainingCount = symbols.filter(s => s.status === 'training').length;
    return {
      total: symbols.length,
      ready: readyCount,
      training: trainingCount,
      progress: symbols.length > 0 ? Math.round((readyCount / symbols.length) * 100) : 0
    };
  }, [symbols]);

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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (modalOpen && e.key === 'Escape') {
      handleCloseModal();
    }
  }, [modalOpen]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const handleImageFile = (file: File | null) => {
    if (!file) {
      setFormData((prev) => ({ ...prev, imageDataUrl: '', imageUrl: prev.imageUrl }));
      setImagePreview(null);
      return;
    }
    let errorMessage = '';
    if (file.size > 8 * 1024 * 1024) {
      errorMessage = 'Bild ist zu groß (maximal 8 MB). Bitte wähle eine kleinere Datei.';
    } else if (!file.type.startsWith('image/')) {
      errorMessage = 'Ungültiger Dateityp. Bitte lade eine Bilddatei hoch.';
    }
    if (errorMessage) {
      showToast({ message: errorMessage, tone: 'error' });
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
    reader.onerror = () => {
      setFormData((prev) => ({ ...prev, imageDataUrl: '', imageUrl: prev.imageUrl }));
      setImagePreview(null);
      showToast({ message: 'Fehler beim Lesen der Bilddatei. Bitte versuche es mit einer anderen Datei.', tone: 'error' });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSymbol = async () => {
    if (!formData.name.trim()) {
      return;
    }
    setSavingSymbol(true);
    const id =
      formData.id.trim() ||
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `symbol_${crypto.randomUUID()}`
        : `symbol_${Date.now()}`);
    try {
      await saveSymbol({
        id,
        name: formData.name.trim(),
        category: formData.category.trim() || 'custom',
        imageUrl: formData.imageDataUrl ? null : formData.imageUrl || null,
        imageDataUrl: formData.imageDataUrl || null,
      });
      setModalOpen(false);
    } catch (error) {
      console.error('Failed to save symbol:', error);
      showToast({ message: 'Gebärde konnte nicht gespeichert werden. Bitte versuche es erneut.', tone: 'error' });
    } finally {
      setSavingSymbol(false);
    }
  };

  const handleTrainGesture = (gestureId: string, label: string) => {
    navigate(`/training?symbolId=${encodeURIComponent(gestureId)}&gesture=${encodeURIComponent(label)}`);
  };

  return (
    <section className="card learning-hub">
      <div className="card-header">
        <div>
          <p className="eyebrow">Lern-Zentrum</p>
          <h2>Deine Gebärden</h2>
          <p className="muted">
            Hier siehst du alle Gebärden, die Amy lernen kann. 
            Nimm Beispiele auf, um die Erkennung für jedes Wort zu verbessern.
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="learning-summary mt-md mb-lg">
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value">{stats.ready} / {stats.total}</span>
            <span className="summary-label">Bereite Gebärden</span>
          </div>
          <div className="summary-progress-bar">
            <div className="progress-fill" style={{ width: `${stats.progress}%` }}></div>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value">{stats.training}</span>
            <span className="summary-label">In Training</span>
          </div>
        </div>
      </div>

      <div className="learning-controls mb-md">
        <div className="search-box">
          <input
            type="text"
            placeholder="Gebärden filtern..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && <button className="clear-search" onClick={() => setSearchTerm('')}>✕</button>}
        </div>
        <div className="action-buttons">
          <button className="secondary-button" onClick={refresh} disabled={loading}>
            {loading ? 'Aktualisiere…' : '🔄 Synchronisieren'}
          </button>
          <button className="primary-button" onClick={handleOpenModal}>
            ➕ Neue Gebärde
          </button>
        </div>
      </div>

      {syncError && <div className="notice warning mb-md">Gebärden konnten nicht geladen werden: {syncError}</div>}

      {/* Gesture grid */}
      <div className="gesture-readiness-grid">
        {filteredSymbols.map((gesture) => (
          <div key={gesture.id} className="readiness-card" data-status={gesture.status}>
            <div className="readiness-card-header">
              <div className="gesture-visual">
                {gesture.imageUrl ? (
                  <img src={gesture.imageUrl} alt={gesture.name} className="gesture-thumb" />
                ) : (
                  <span className="gesture-emoji">{gesture.emoji || '🧩'}</span>
                )}
              </div>
              <div className="status-indicator">
                <span className={`status-dot ${gesture.status}`}></span>
                <span className="status-text">
                  {gesture.status === 'ready' ? 'Bereit' : 
                   gesture.status === 'training' ? 'In Arbeit' : 'Neu'}
                </span>
              </div>
            </div>
            
            <div className="readiness-card-body">
              <h3>{gesture.name}</h3>
              <p className="category-tag">{gesture.category}</p>
              
              <div className="sample-progress mt-sm">
                <div className="sample-count-line">
                  <span>{gesture.sampleCount || 0} Beispiele</span>
                  {gesture.samplesNeeded! > 0 && (
                    <span className="needed">+{gesture.samplesNeeded} nötig</span>
                  )}
                </div>
                <div className="mini-progress-bar">
                  <div 
                    className="mini-progress-fill" 
                    style={{ width: `${Math.min(100, ((gesture.sampleCount || 0) / 5) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="readiness-card-actions">
              <button
                className="train-action-button"
                onClick={() => handleTrainGesture(gesture.id, gesture.name)}
              >
                {gesture.sampleCount! > 0 ? 'Mehr aufnehmen' : 'Starten'}
              </button>
              <button 
                className="edit-icon-button" 
                onClick={() => handleEditSymbol(gesture)}
                title="Bearbeiten"
              >
                ⚙️
              </button>
            </div>
          </div>
        ))}
        {filteredSymbols.length === 0 && !loading && (
          <div className="empty-results notice info">
            <p>Keine Gebärden gefunden, die auf "{searchTerm}" passen.</p>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="learning-tips mt-xl">
        <h3>💡 Tipps für effektives Training</h3>
        <div className="tips-grid">
          <div className="tip-item">
            <strong>Winkel variieren</strong>
            <p>Nimm Beispiele von vorne, leicht seitlich oder von oben auf.</p>
          </div>
          <div className="tip-item">
            <strong>Licht nutzen</strong>
            <p>Gute Beleuchtung verbessert die Erkennung deiner Hände enorm.</p>
          </div>
          <div className="tip-item">
            <strong>Hintergrund</strong>
            <p>Ein ruhiger Hintergrund hilft Amy, sich auf deine Hände zu konzentrieren.</p>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="symbol-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
        >
          <div className="modal-content">
            <h3 id="symbol-modal-title">{formData.id ? 'Gebärde bearbeiten' : 'Neue Gebärde hinzufügen'}</h3>
            <p className="muted">Sobald du speicherst, kannst du sofort mit dem Training beginnen.</p>

            <div className="form-group mt-md">
              <label htmlFor="symbol-name">Bezeichnung</label>
              <input
                id="symbol-name"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="z.B. Apfel, Durst, Mama..."
              />
            </div>

            <div className="form-group">
              <label htmlFor="symbol-category">Kategorie</label>
              <select
                id="symbol-category"
                value={formData.category}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, category: e.target.value }))
                }
              >
                <option value="custom">Benutzerdefiniert</option>
                <option value="basic">Grundlagen</option>
                <option value="food">Essen & Trinken</option>
                <option value="emotion">Gefühle</option>
                <option value="action">Aktionen</option>
                <option value="person">Personen</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="symbol-image-upload">Vorschaubild</label>
              <div className="image-upload-zone">
                <input
                  id="symbol-image-upload"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageFile(e.target.files?.[0] ?? null)}
                  className="hidden-file-input"
                />
                <label htmlFor="symbol-image-upload" className="upload-label">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Vorschau" className="upload-preview" />
                  ) : (
                    <div className="upload-placeholder">
                      <span>📸 Foto auswählen</span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="modal-actions mt-lg">
              <button className="primary-button" onClick={handleSaveSymbol} disabled={savingSymbol || !formData.name.trim()}>
                {savingSymbol ? 'Wird gespeichert…' : 'Speichern'}
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

