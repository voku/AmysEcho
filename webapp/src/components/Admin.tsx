/**
 * Admin - Administrative tools and data management
 * Mirrors app/src/screens/AdminScreen.tsx
 * 
 * For Amy: Technical maintenance to ensure reliable gesture recognition
 */
import React, { useState } from 'react';
import { useApiConfig } from '../hooks/useApiConfig';
import { useMessage } from '../context/MessageContext';
import { backupService } from '../services/backupService';

interface Symbol {
  id: string;
  name: string;
  category: string;
  audioUri?: string;
}

export const Admin: React.FC = () => {
  const { apiBaseUrl, apiToken } = useApiConfig();
  const { showToast, showConfirmDialog } = useMessage();
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [backendToken, setBackendToken] = useState(apiToken || '');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSymbol, setEditingSymbol] = useState<Symbol | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    category: ''
  });

  // Load symbols from localStorage
  React.useEffect(() => {
    const savedSymbols = localStorage.getItem('amysecho_symbols');
    if (savedSymbols) {
      try {
        setSymbols(JSON.parse(savedSymbols));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  const handleSaveToken = () => {
    localStorage.setItem('amysecho_api_token', backendToken);
    showToast({ message: 'Token gespeichert', tone: 'success' });
  };

  const handleOpenAdd = () => {
    setEditingSymbol(null);
    setFormData({ id: '', name: '', category: '' });
    setModalVisible(true);
  };

  const handleOpenEdit = (symbol: Symbol) => {
    setEditingSymbol(symbol);
    setFormData({ id: symbol.id, name: symbol.name, category: symbol.category });
    setModalVisible(true);
  };

  const handleSaveSymbol = () => {
    const newSymbol: Symbol = {
      id: formData.id || `symbol_${Date.now()}`,
      name: formData.name,
      category: formData.category || 'custom'
    };

    let updatedSymbols: Symbol[];
    if (editingSymbol) {
      updatedSymbols = symbols.map(s => s.id === editingSymbol.id ? newSymbol : s);
    } else {
      updatedSymbols = [...symbols, newSymbol];
    }
    
    setSymbols(updatedSymbols);
    localStorage.setItem('amysecho_symbols', JSON.stringify(updatedSymbols));
    setModalVisible(false);
  };

  const handleDeleteSymbol = async (symbol: Symbol) => {
    const confirmed = await showConfirmDialog(`"${symbol.name}" wirklich entfernen?`);
    if (confirmed) {
      const updatedSymbols = symbols.filter(s => s.id !== symbol.id);
      setSymbols(updatedSymbols);
      localStorage.setItem('amysecho_symbols', JSON.stringify(updatedSymbols));
    }
  };

  const handleExportSymbols = () => {
    const data = JSON.stringify(symbols, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'symbols-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSymbols = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedSymbols = JSON.parse(e.target?.result as string);
        setSymbols(importedSymbols);
        localStorage.setItem('amysecho_symbols', JSON.stringify(importedSymbols));
        showToast({ message: 'Import abgeschlossen', tone: 'success' });
      } catch {
        showToast({ message: 'Import fehlgeschlagen: Ungültiges JSON', tone: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const handleExportData = () => {
    const data = {
      symbols,
      profiles: JSON.parse(localStorage.getItem('amysecho_profiles') || '[]'),
      history: JSON.parse(localStorage.getItem('amysecho_gesture_history') || '[]'),
      progress: JSON.parse(localStorage.getItem('amysecho_progress') || '{}'),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amysecho-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const triggerDownload = (artifact: { url: string; fileName: string }, message: string) => {
    const anchor = document.createElement('a');
    anchor.href = artifact.url;
    anchor.download = artifact.fileName;
    anchor.click();
    URL.revokeObjectURL(artifact.url);
    showToast({ message, tone: 'success' });
  };

  const handleBackupProtectedGestures = async () => {
    try {
      const artifact = await backupService.backupProtectedGestures();
      if (!artifact) {
        showToast({ message: 'Keine geschützten Gesten gefunden', tone: 'info' });
        return;
      }
      triggerDownload(artifact, 'Sicherung erstellt');
    } catch (error) {
      showToast({ message: 'Sicherung fehlgeschlagen', tone: 'error' });
      console.warn('Backup der geschützten Gesten fehlgeschlagen', error);
    }
  };

  const handleRestoreProtectedGestures = async () => {
    try {
      const ok = await backupService.restoreProtectedGestures();
      if (ok) {
        showToast({ message: 'Sicherung wiederhergestellt', tone: 'success' });
      } else {
        showToast({ message: 'Keine Sicherung gefunden', tone: 'info' });
      }
    } catch (error) {
      showToast({ message: 'Wiederherstellung fehlgeschlagen', tone: 'error' });
      console.warn('Wiederherstellung der geschützten Gesten fehlgeschlagen', error);
    }
  };

  const handleExportProtectedGestures = async () => {
    try {
      const artifact = await backupService.exportProtectedGestures();
      if (!artifact) {
        showToast({ message: 'Keine Daten zum Exportieren', tone: 'info' });
        return;
      }
      triggerDownload(artifact, 'Export erstellt');
    } catch (error) {
      showToast({ message: 'Export fehlgeschlagen', tone: 'error' });
      console.warn('Export der geschützten Gesten fehlgeschlagen', error);
    }
  };

  const handleClearData = async () => {
    const confirmed = await showConfirmDialog('Alle Daten wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.');
    if (confirmed) {
      localStorage.removeItem('amysecho_symbols');
      localStorage.removeItem('amysecho_profiles');
      localStorage.removeItem('amysecho_gesture_history');
      localStorage.removeItem('amysecho_progress');
      setSymbols([]);
      showToast({ message: 'Alle Daten gelöscht', tone: 'success' });
    }
  };

  const handleDownloadModel = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/models/latest`);
      if (response.ok) {
        showToast({ message: 'Modell aktualisiert', tone: 'success' });
      } else {
        showToast({ message: 'Kein neues Modell verfügbar', tone: 'info' });
      }
    } catch {
      showToast({ message: 'Modell-Download fehlgeschlagen', tone: 'error' });
    }
  };

  return (
    <div className="admin">
      <h2>🔧 Adminbereich</h2>
      <p className="muted">
        Koordiniere hier Exporte, Backups und technische Einstellungen für Amy.
        Die Aktionen sind in Abschnitte gegliedert, damit du schneller findest, was du brauchst.
      </p>

      {/* API Section */}
      <section className="admin-section">
        <h3>API-Zugänge</h3>
        <div className="form-group">
          <label>Backend-API-Token</label>
          <input
            type="password"
            value={backendToken}
            onChange={(e) => setBackendToken(e.target.value)}
            placeholder="token-1234"
          />
        </div>
        <button className="primary-button" onClick={handleSaveToken}>
          Backend-Token speichern
        </button>
      </section>

      {/* Symbols Section */}
      <section className="admin-section">
        <h3>Symbolsammlung</h3>
        <button className="primary-button" onClick={handleOpenAdd}>
          Symbol hinzufügen
        </button>
        
        {symbols.length === 0 ? (
          <p className="empty-state">Noch keine Symbole</p>
        ) : (
          <ul className="symbol-list">
            {symbols.map(symbol => (
              <li key={symbol.id} className="symbol-row">
                <span className="symbol-name">{symbol.name}</span>
                <span className="symbol-category">({symbol.category})</span>
                <div className="symbol-actions">
                  <button className="secondary-button small" onClick={() => handleOpenEdit(symbol)}>
                    Bearbeiten
                  </button>
                  <button className="danger-button small" onClick={() => handleDeleteSymbol(symbol)}>
                    Löschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Model Management */}
      <section className="admin-section">
        <h3>Modellverwaltung</h3>
        <button className="primary-button" onClick={handleDownloadModel}>
          Neuestes Modell herunterladen
        </button>
        <p className="muted">Aktualisiert das Erkennungsmodell auf diesem Gerät</p>
      </section>

      {/* Data Management */}
      <section className="admin-section">
        <h3>Datenverwaltung</h3>
        
        <div className="action-group">
          <button className="secondary-button" onClick={handleExportSymbols}>
            Symbole exportieren
          </button>
          <p className="muted">Sichert alle benutzerdefinierten Symbole als JSON</p>
        </div>

        <div className="action-group">
          <label className="file-input-label">
            <span className="secondary-button">Symbole importieren</span>
            <input type="file" accept=".json" onChange={handleImportSymbols} hidden />
          </label>
          <p className="muted">Lädt ein zuvor gespeichertes Symbol-Set wieder ein</p>
        </div>

        <div className="action-group">
          <button className="secondary-button" onClick={handleBackupProtectedGestures}>
            Geschützte Gesten sichern
          </button>
          <p className="muted">Erstellt eine verschlüsselte Sicherung mit Browser-Schlüssel</p>
        </div>

        <div className="action-group">
          <button className="secondary-button" onClick={handleExportProtectedGestures}>
            Geschützte Gesten exportieren
          </button>
          <p className="muted">Exportiert anonymisierte Gesten zur Prüfung oder Migration</p>
        </div>

        <div className="action-group">
          <button className="secondary-button" onClick={handleRestoreProtectedGestures}>
            Sicherung wiederherstellen
          </button>
          <p className="muted">Stellt die letzte Sicherung geschützter Gesten wieder her</p>
        </div>

        <div className="action-group">
          <button className="secondary-button" onClick={handleExportData}>
            Vollständiges Backup exportieren
          </button>
          <p className="muted">Exportiert alle Daten (Symbole, Profile, Verlauf, Fortschritt)</p>
        </div>

        <div className="action-group danger">
          <button className="danger-button" onClick={handleClearData}>
            Alle Daten löschen
          </button>
          <p className="muted">Entfernt alle gespeicherten Daten dauerhaft</p>
        </div>
      </section>

      {/* Symbol Modal */}
      {modalVisible && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>{editingSymbol ? 'Symbol bearbeiten' : 'Neues Symbol'}</h3>
            <p className="muted">
              ID, Bezeichnung und Kategorie helfen Amy, das Symbol richtig zuzuordnen.
            </p>
            
            <div className="form-group">
              <label>Symbol-ID</label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) => setFormData({...formData, id: e.target.value})}
                placeholder="z. B. trinken-wasser"
              />
            </div>

            <div className="form-group">
              <label>Bezeichnung</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Titel für das Symbol"
              />
            </div>

            <div className="form-group">
              <label>Kategorie</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                placeholder="z. B. custom, basic, emotion"
              />
            </div>

            <div className="modal-actions">
              <button className="primary-button" onClick={handleSaveSymbol}>
                Speichern
              </button>
              <button className="secondary-button" onClick={() => setModalVisible(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
