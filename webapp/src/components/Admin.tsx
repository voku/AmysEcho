/**
 * Admin - Administrative tools and data management
 * Mirrors app/src/screens/AdminScreen.tsx
 * 
 * For Amy: Technical maintenance to ensure reliable gesture recognition
 */
import React, { useMemo, useState } from 'react';
import { useApiConfig } from '../hooks/useApiConfig';
import { useAppState } from '../hooks/useAppState';
import { buildProfileLocalDataExport, clearProfileScopedLocalData } from '../services/profileLocalData';
import { resolveApiUrl } from '../utils/resolveApiUrl';
import { useMessage } from '../context/MessageContext';
import { useSymbolStore, type SymbolDefinition } from '../context/SymbolStore';
import { backupService } from '../services/backupService';
import { clearMetacomBundle, storeMetacomBundle } from '../services/metacomBundleService';
import { dedupeSymbolsByName } from '../utils/symbolDedup';

const METACOM_TEMPLATE = {
  version: '1.0',
  boards: [
    {
      id: 'start',
      label: 'Starttafel',
      rows: 2,
      columns: 2,
      cells: [
        { id: 'metacom_ja', label: 'Ja', emoji: '👍', position: 0, type: 'symbol' },
        { id: 'metacom_nein', label: 'Nein', emoji: '👎', position: 1, type: 'symbol' },
        {
          id: 'metacom_board_essen',
          label: 'Essen',
          emoji: '🍎',
          position: 2,
          type: 'board',
          targetBoardId: 'essen',
        },
        { id: 'metacom_hilfe', label: 'Hilfe', emoji: '🆘', position: 3, type: 'symbol' },
      ],
    },
    {
      id: 'essen',
      label: 'Essen',
      rows: 1,
      columns: 2,
      cells: [
        { id: 'metacom_apfel', label: 'Apfel', emoji: '🍎', position: 0, type: 'symbol' },
        { id: 'metacom_brot', label: 'Brot', emoji: '🍞', position: 1, type: 'symbol' },
      ],
    },
  ],
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

export const Admin: React.FC = () => {
  const { apiBaseUrl, apiToken } = useApiConfig();
  const { profileId, displayName } = useAppState();
  const { showToast, showConfirmDialog } = useMessage();
  const { symbols, saveSymbol, removeSymbol, refresh, syncError, loading, lastSyncedAt } = useSymbolStore();
  const [backendToken, setBackendToken] = useState(apiToken || '');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSymbol, setEditingSymbol] = useState<SymbolDefinition | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    category: '',
    imageUrl: '',
    imageDataUrl: '',
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const sortedSymbols = useMemo(
    () => dedupeSymbolsByName(symbols).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [symbols],
  );

  const handleSaveToken = () => {
    localStorage.setItem('amysecho_api_token', backendToken);
    showToast({ message: 'Token gespeichert', tone: 'success' });
  };

  const handleOpenAdd = () => {
    setEditingSymbol(null);
    setFormData({ id: '', name: '', category: '', imageUrl: '', imageDataUrl: '' });
    setImagePreview(null);
    setModalVisible(true);
  };

  const handleOpenEdit = (symbol: SymbolDefinition) => {
    setEditingSymbol(symbol);
    setFormData({
      id: symbol.id,
      name: symbol.name,
      category: symbol.category,
      imageUrl: symbol.imageUrl ?? '',
      imageDataUrl: '',
    });
    setImagePreview(symbol.imageUrl ?? null);
    setModalVisible(true);
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
    const id = formData.id || `symbol_${Date.now()}`;
    if (!formData.name.trim()) {
      showToast({ message: 'Bitte gib einen Namen ein.', tone: 'warning' });
      return;
    }

    await saveSymbol({
      id,
      name: formData.name,
      category: formData.category || 'custom',
      imageUrl: formData.imageDataUrl ? null : formData.imageUrl || null,
      imageDataUrl: formData.imageDataUrl || null,
    });
    setModalVisible(false);
  };

  const handleDeleteSymbol = async (symbol: SymbolDefinition) => {
    const confirmed = await showConfirmDialog(`"${symbol.name}" wirklich entfernen?`);
    if (confirmed) {
      await removeSymbol(symbol.id);
      showToast({ message: 'Symbol gelöscht', tone: 'success' });
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
        const importedSymbols = JSON.parse(e.target?.result as string) as SymbolDefinition[];
        importedSymbols.forEach((symbol) => {
          const isDataUrl = symbol.imageUrl?.startsWith('data:') ?? false;
          void saveSymbol({
            ...symbol,
            imageUrl: isDataUrl ? null : symbol.imageUrl ?? null,
            imageDataUrl: isDataUrl ? (symbol.imageUrl ?? null) : null,
          });
        });
        showToast({ message: 'Import abgeschlossen', tone: 'success' });
      } catch {
        showToast({ message: 'Import fehlgeschlagen: Ungültiges JSON', tone: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const handleImportMetacomBundle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') {
          throw new Error('Die Datei konnte nicht als Text gelesen werden.');
        }
        const syncOptions = profileId && apiToken ? { profileId, token: apiToken } : undefined;
        storeMetacomBundle(content, syncOptions);
        showToast({ message: 'Metacom-Bundle importiert und synchronisiert', tone: 'success' });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unbekannter Fehler';
        showToast({ message: `Metacom-Import fehlgeschlagen: ${reason}`, tone: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const handleClearMetacomBundle = async () => {
    const confirmed = await showConfirmDialog('Metacom-Import zurücksetzen?');
    if (!confirmed) return;
    const syncOptions = profileId && apiToken ? { profileId, token: apiToken } : undefined;
    await clearMetacomBundle(syncOptions);
    showToast({ message: 'Metacom-Import zurückgesetzt', tone: 'success' });
  };

  const handleDownloadMetacomTemplate = () => {
    const blob = new Blob([JSON.stringify(METACOM_TEMPLATE, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'metacom-template.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast({ message: 'Metacom-Vorlage heruntergeladen', tone: 'success' });
  };

  const handleExportData = () => {
    void (async () => {
      if (profileId && apiToken) {
        try {
          const response = await fetch(
            resolveApiUrl(`/api/v1/profiles/${encodeURIComponent(profileId)}/backup/export`, apiBaseUrl),
            {
              headers: {
                Authorization: `Bearer ${apiToken}`,
                'X-Profile-Id': profileId,
              },
            },
          );
          if (!response.ok) {
            throw new Error(`status ${response.status}`);
          }

          const blob = new Blob([await response.arrayBuffer()], { type: 'application/zip' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `amysecho-profile-backup-${profileId}-${new Date().toISOString().split('T')[0]}.zip`;
          anchor.click();
          URL.revokeObjectURL(url);
          showToast({ message: 'Profil-Backup heruntergeladen', tone: 'success' });
          return;
        } catch (error) {
          console.warn('Serverseitiger Profil-Backup-Export fehlgeschlagen, nutze lokalen Export', error);
        }
      }

      const data = buildProfileLocalDataExport(profileId, displayName);
      if (!data) {
        showToast({ message: 'Kein aktives Profil für den Export ausgewählt', tone: 'warning' });
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `amysecho-profile-local-${profileId}-${new Date().toISOString().split('T')[0]}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast({ message: 'Lokaler Profil-Export erstellt', tone: 'success' });
    })();
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
        showToast({ message: 'Keine geschützten Gebärden gefunden', tone: 'info' });
        return;
      }
      triggerDownload(artifact, 'Sicherung erstellt');
    } catch (error) {
      showToast({ message: 'Sicherung fehlgeschlagen', tone: 'error' });
      console.warn('Backup der geschützten Gebärden fehlgeschlagen', error);
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
      console.warn('Wiederherstellung der geschützten Gebärden fehlgeschlagen', error);
    }
  };

  const handleImportProtectedGestureBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void (async () => {
      try {
        const ok = await backupService.restoreProtectedGesturesFromFile(file);
        if (ok) {
          showToast({ message: 'Backup-Datei importiert', tone: 'success' });
        } else {
          showToast({ message: 'Backup-Datei konnte nicht wiederhergestellt werden', tone: 'error' });
        }
      } catch (error) {
        showToast({ message: 'Backup-Datei konnte nicht importiert werden', tone: 'error' });
        console.warn('Import der Backup-Datei fehlgeschlagen', error);
      } finally {
        event.target.value = '';
      }
    })();
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
      console.warn('Export der geschützten Gebärden fehlgeschlagen', error);
    }
  };

  const handleImportProfileBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void (async () => {
      if (!profileId || !apiToken) {
        showToast({ message: 'Profil-Backup benötigt ein aktives Profil und ein gültiges Konto-Login', tone: 'warning' });
        event.target.value = '';
        return;
      }

      try {
        const archiveBase64 = arrayBufferToBase64(await file.arrayBuffer());
        const response = await fetch(
          resolveApiUrl(`/api/v1/profiles/${encodeURIComponent(profileId)}/sync`, apiBaseUrl),
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
              'X-Profile-Id': profileId,
            },
            body: JSON.stringify({ archiveBase64 }),
          },
        );
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        await refresh();
        showToast({ message: 'Profil-Backup wiederhergestellt', tone: 'success' });
      } catch (error) {
        showToast({ message: 'Profil-Backup konnte nicht importiert werden', tone: 'error' });
        console.warn('Profil-Backup-Import fehlgeschlagen', error);
      } finally {
        event.target.value = '';
      }
    })();
  };

  const handleClearData = async () => {
    if (!profileId) {
      showToast({ message: 'Kein aktives Profil ausgewählt', tone: 'warning' });
      return;
    }

    const confirmed = await showConfirmDialog('Lokale Daten dieses Profils wirklich löschen? Andere Profile bleiben unverändert.');
    if (confirmed) {
      clearProfileScopedLocalData(profileId);
      showToast({ message: 'Lokale Profildaten gelöscht', tone: 'success' });
    }
  };

  const handleDownloadModel = async () => {
    try {
      const response = await fetch(resolveApiUrl('/api/v1/models/latest', apiBaseUrl), {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
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
        <p className="muted small">
          Zentrale Sammlung für Lernen & Training. Server-Sync bevorzugt, lokale Speicherung als Rückfall.
        </p>
        <div className="action-group">
          <button className="secondary-button" onClick={refresh} disabled={loading}>
            Jetzt synchronisieren
          </button>
          {lastSyncedAt && (
            <p className="muted small">Letzte Aktualisierung: {new Date(lastSyncedAt).toLocaleString()}</p>
          )}
        </div>
        {syncError && <div className="notice warning">Server-Sync fehlgeschlagen: {syncError}</div>}
        <button className="primary-button" onClick={handleOpenAdd}>
          Symbol hinzufügen
        </button>

        {sortedSymbols.length === 0 ? (
          <p className="empty-state">Noch keine Symbole</p>
        ) : (
          <ul className="symbol-list">
            {sortedSymbols.map(symbol => (
              <li key={symbol.id} className="symbol-row">
                <span className="symbol-name">{symbol.name}</span>
                <span className="symbol-category">({symbol.category})</span>
                {symbol.imageUrl && (
                  <img src={symbol.imageUrl} alt={symbol.name} className="symbol-thumb" />
                )}
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
          <label className="file-input-label">
            <span className="secondary-button">Metacom-Boards importieren</span>
            <input type="file" accept=".json,.obf" onChange={handleImportMetacomBundle} hidden />
          </label>
          <p className="muted">
            Lädt Metacom-Bundles oder Open-Board-Format-Dateien und ersetzt die lokale Symboltafel
          </p>
        </div>

        <div className="action-group">
          <button className="secondary-button" onClick={handleDownloadMetacomTemplate}>
            Metacom-Vorlage herunterladen
          </button>
          <p className="muted">Lädt eine einfache JSON-Vorlage zum Ausfüllen herunter</p>
        </div>

        <div className="action-group">
          <button className="secondary-button" onClick={handleClearMetacomBundle}>
            Metacom-Import zurücksetzen
          </button>
          <p className="muted">Stellt die Standard-Starttafel wieder her</p>
        </div>

        <div className="action-group">
          <button className="secondary-button" onClick={handleBackupProtectedGestures}>
            Geschützte Gebärden sichern
          </button>
          <p className="muted">Erstellt eine verschlüsselte Backup-Datei für diesen Browser</p>
        </div>

        <div className="action-group">
          <button className="secondary-button" onClick={handleExportProtectedGestures}>
            Geschützte Gebärden exportieren
          </button>
          <p className="muted">Exportiert anonymisierte Gebärden zur Prüfung oder Migration</p>
        </div>

        <div className="action-group">
          <label className="file-input-label">
            <span className="secondary-button">Backup-Datei importieren</span>
            <input type="file" accept=".dat,.txt" onChange={handleImportProtectedGestureBackup} hidden />
          </label>
          <p className="muted">Importiert eine zuvor heruntergeladene Sicherungsdatei wieder in diesen Browser</p>
        </div>

        <div className="action-group">
          <button className="secondary-button" onClick={handleRestoreProtectedGestures}>
            Letzte Browser-Sicherung wiederherstellen
          </button>
          <p className="muted">Stellt die zuletzt lokal gespeicherte Sicherung ohne Dateiauswahl wieder her</p>
        </div>

        <div className="action-group">
          <label className="file-input-label">
            <span className="secondary-button">Profil-Backup importieren</span>
            <input type="file" accept=".zip" onChange={handleImportProfileBackup} hidden />
          </label>
          <p className="muted">Spielt ein vollständiges Profil-Backup mit Trainingsdaten und Modell wieder ein</p>
        </div>

        <div className="action-group">
          <button className="secondary-button" onClick={handleExportData}>
            Profil-Backup exportieren
          </button>
          <p className="muted">Exportiert das aktive Profil inklusive Trainingsdaten und Modell, wenn der Server erreichbar ist</p>
        </div>

        <div className="action-group danger">
          <button className="danger-button" onClick={handleClearData}>
            Lokale Profildaten löschen
          </button>
          <p className="muted">Entfernt nur die lokalen Browser-Daten des aktiven Profils</p>
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
