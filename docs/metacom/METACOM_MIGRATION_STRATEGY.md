# Metacom Board Migration Strategy

## Übersicht

Dieses Dokument beschreibt die Migrationsstrategie für Metacom-Boards in Amy's Echo. Die Strategie gewährleistet, dass bestehende Boards bei Updates erhalten bleiben und bei Problemen sicher auf Fallback-Verhalten zurückgegriffen werden kann.

## Aktuelle Implementierung

### Speicherort

Metacom-Bundles werden in `localStorage` unter dem Schlüssel `amysecho_metacom_bundle` gespeichert.

### Fallback-Verhalten

Die Implementierung in `metacomBundleService.ts` bietet bereits robustes Fallback-Verhalten:

```typescript
export function loadMetacomBoards(): Record<string, MetacomBoardDefinition> {
  // 1. Prüfen ob window verfügbar ist
  if (typeof window === 'undefined') {
    return METACOM_BOARDS; // Standard-Boards
  }
  
  // 2. Versuche gespeichertes Bundle zu laden
  const raw = window.localStorage.getItem(METACOM_BUNDLE_STORAGE_KEY);
  if (!raw) return METACOM_BOARDS; // Fallback zu Standard
  
  try {
    // 3. Bundle parsen und validieren
    const bundle = parseMetacomBundle(raw);
    return buildBoardRecord(bundle.boards);
  } catch (error) {
    // 4. Bei Fehler: Fallback zu Standard-Boards
    console.warn('Failed to load Metacom bundle', error);
    return METACOM_BOARDS;
  }
}
```

## Migrationsszenarien

### Szenario 1: App-Update mit Schema-Änderung

**Problem**: Die Struktur von `MetacomCell` oder `MetacomBoardDefinition` ändert sich.

**Lösung**: Versionierte Migration

```typescript
// Beispiel-Migration für zukünftige Schema-Änderungen
interface MetacomBundle {
  version: string;
  schemaVersion?: number;  // Hinzufügen für zukünftige Migrationen
  boards: MetacomBoardDefinition[];
}

function migrateBundle(bundle: MetacomBundle): MetacomBundle {
  const currentSchemaVersion = 2;
  const bundleVersion = bundle.schemaVersion ?? 1;
  
  if (bundleVersion === currentSchemaVersion) {
    return bundle;
  }
  
  // Migration von v1 zu v2
  if (bundleVersion === 1) {
    return {
      ...bundle,
      schemaVersion: 2,
      boards: bundle.boards.map(migrateBoard_v1_to_v2)
    };
  }
  
  return bundle;
}
```

### Szenario 2: Korrupte Daten

**Problem**: localStorage enthält ungültige oder korrupte Daten.

**Aktuelle Lösung**: Fallback zu `METACOM_BOARDS` mit Konsolen-Warnung.

**Erweiterung**: Optionale Benachrichtigung an Nutzer

```typescript
// In loadMetacomBoards():
} catch (error) {
  console.warn('Failed to load Metacom bundle', error);
  // Optional: Nutzer informieren
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('amysecho:metacom-migration-fallback', {
      detail: { reason: 'parse_error', error: String(error) }
    }));
  }
  return METACOM_BOARDS;
}
```

### Szenario 3: Fehlende Start-Tafel

**Problem**: Importiertes Bundle hat keine `start`-Tafel.

**Aktuelle Lösung**: Konsolen-Warnung, Fallback zur ersten Tafel.

```typescript
// In validateBundle():
if (!boardIds.has('start')) {
  console.warn('Metacom bundle has no start board; falling back to the first board.');
}
```

### Szenario 4: Fehlende Ziel-Boards

**Problem**: Eine Zelle verweist auf ein nicht existierendes Board.

**Aktuelle Lösung**: Validierung verhindert Import.

```typescript
// In validateBundle():
if (cell.type === 'board' && !boardIds.has(cell.targetBoardId)) {
  throw new Error(`Metacom-Board "${board.id}" verweist auf ein unbekanntes Ziel-Board.`);
}
```

## Migrations-Workflow

### Bei App-Start

```
┌─────────────────────┐
│   App startet       │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ loadMetacomBoards() │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐     ┌─────────────────────┐
│ localStorage lesen  │ --> │ Keine Daten?        │ --> METACOM_BOARDS
└──────────┬──────────┘     └─────────────────────┘
           │
           v
┌─────────────────────┐     ┌─────────────────────┐
│ Bundle parsen       │ --> │ Parse-Fehler?       │ --> METACOM_BOARDS + Warnung
└──────────┬──────────┘     └─────────────────────┘
           │
           v
┌─────────────────────┐     ┌─────────────────────┐
│ Bundle validieren   │ --> │ Validierung fehlg.? │ --> METACOM_BOARDS + Warnung
└──────────┬──────────┘     └─────────────────────┘
           │
           v
┌─────────────────────┐
│ Benutzerdefinierte  │
│ Boards verwenden    │
└─────────────────────┘
```

### Bei Bundle-Import

```
┌─────────────────────┐
│ Nutzer importiert   │
│ neues Bundle        │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ parseMetacomBundle()│
│ - Format erkennen   │
│ - Validieren        │
└──────────┬──────────┘
           │
   ┌───────┴───────┐
   │               │
   v               v
┌──────┐      ┌──────────────────┐
│ OK   │      │ Fehler           │
└──┬───┘      └────────┬─────────┘
   │                   │
   v                   v
┌──────────────────┐  ┌──────────────────┐
│ localStorage     │  │ Fehlermeldung    │
│ aktualisieren    │  │ an Nutzer        │
└──────────────────┘  └──────────────────┘
```

## Backup-Strategie

### Automatisches Backup vor Import

```typescript
export function storeMetacomBundleWithBackup(raw: string): Record<string, MetacomBoardDefinition> {
  // 1. Aktuelles Bundle sichern
  const existing = window.localStorage.getItem(METACOM_BUNDLE_STORAGE_KEY);
  if (existing) {
    const backupKey = `${METACOM_BUNDLE_STORAGE_KEY}_backup_${Date.now()}`;
    window.localStorage.setItem(backupKey, existing);
    
    // Alte Backups bereinigen (max. 3 behalten)
    cleanupOldBackups();
  }
  
  // 2. Neues Bundle speichern
  return storeMetacomBundle(raw);
}
```

### Backup wiederherstellen

```typescript
export function restoreMetacomBackup(backupKey: string): boolean {
  const backup = window.localStorage.getItem(backupKey);
  if (!backup) return false;
  
  try {
    storeMetacomBundle(backup);
    return true;
  } catch {
    return false;
  }
}
```

## Kompatibilitätsmatrix

| Quellformat | Zielformat | Status |
|-------------|------------|--------|
| Open-Board-Format v1 | Metacom-Bundle | ✅ Unterstützt |
| Open-Board-Bundle | Metacom-Bundle | ✅ Unterstützt |
| Natives Metacom-Bundle | Metacom-Bundle | ✅ Unterstützt |
| Einzelnes Open-Board | Metacom-Bundle | ✅ Unterstützt |

## Empfehlungen für zukünftige Entwicklung

1. **Schema-Versionierung**: `schemaVersion` zum Bundle-Format hinzufügen
2. **Migrations-Registry**: Zentrale Stelle für Migrations-Funktionen
3. **Backup-UI**: Nutzer können Backups manuell verwalten
4. **Export-Funktion**: Aktuelle Boards als Datei exportieren

---

**Amy First**: Die Migrationsstrategie stellt sicher, dass Amys Kommunikationsboards niemals verloren gehen. Ein sanfter Fallback ist besser als ein leerer Bildschirm.
