# Training Metrics Dashboard

## Übersicht

Dieses Dokument beschreibt die Metriken und Latenzbudgets für den gesamten Training-Zyklus von Amy's Echo, von der Aufnahme bis zum Modell-Download. Ziel ist es, alle Phasen innerhalb der kinderfreundlichen Budgets zu halten.

## Latenzbudgets

### Amy First: Kinderfreundliche Performance-Anforderungen

| Phase | Ziellatenz | Maximale Latenz | Priorität |
|-------|-----------|-----------------|-----------|
| Frame-Capture | < 16ms | 33ms | Kritisch |
| Landmark-Extraktion | < 30ms | 50ms | Kritisch |
| Live-Inferenz | < 50ms | 100ms | Kritisch |
| Bundle-Erstellung | < 500ms | 2s | Hoch |
| Bundle-Upload | < 5s | 30s | Mittel |
| Model-Training | < 60s | 300s | Niedrig |
| Model-Download | < 3s | 10s | Hoch |

### End-to-End Zyklus

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Capture   │ -> │    Upload    │ -> │   Training   │ -> │   Download   │
│  (< 500ms)  │    │   (< 5s)     │    │   (< 60s)    │    │   (< 3s)     │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                    │
                                                                    v
                                                           ┌──────────────┐
                                                           │ Model aktiv  │
                                                           │  (< 50ms)    │
                                                           └──────────────┘
```

## Verfügbare Metriken

### Client-seitige Metriken (webapp)

Die folgenden Metriken werden bereits vom `performanceMonitor` und `TelemetryRecorder` erfasst:

#### 1. Frame-Verarbeitung
- `averageProcessingTime`: Durchschnittliche Verarbeitungszeit pro Frame
- `medianProcessingTime`: Median der Verarbeitungszeiten
- `p95ProcessingTime`: 95. Perzentil der Verarbeitungszeiten
- `maxProcessingTime`: Maximale Verarbeitungszeit
- `camera_start_requested_at`: Zeitstempel, wenn der Kamera-Start angefordert wurde
- `camera_stream_ready_at`: Zeitstempel, wenn der Kamera-Stream bereit ist
- `detector_first_frame_at`: Zeitstempel des ersten verwerteten Detektor-Frames
- `startup_latency_ms`: Abgeleitete Startlatenz (`detector_first_frame_at - camera_start_requested_at`)

#### 2. Genauigkeit
- `overallAccuracy`: Gesamtgenauigkeit der Gebärdenerkennung
- `gestureAccuracy`: Genauigkeit pro Gebärde (Map)
- `falsePositiveRate`: Rate der Falsch-Positiven
- `falseNegativeRate`: Rate der Falsch-Negativen

#### 3. Systemzustand
- `frameRate`: Aktuelle Bildrate (fps)
- `memoryUsage`: Speicherverbrauch (MB)
- `errorRate`: Fehlerrate
- `uptime`: Laufzeit seit Start (Sekunden)

### Server-seitige Metriken

#### 1. Bundle-Ingestion
- Anzahl empfangener Bundles
- Anzahl abgelehnter Bundles (nach Grund)
- Durchschnittliche Bundle-Größe
- Modality-Coverage pro Bundle

#### 2. Training
- Training-Dauer
- Sample-Anzahl
- Epochs bis Konvergenz
- Validierungs-Genauigkeit

## Integration mit bestehendem Telemetrie-System

### Event-Typen für Metriken

```typescript
// Beispiel-Events für den TelemetryRecorder
telemetry.add('capture_complete', {
  latencyMs: 450,
  source: 'training_recorder',
  details: { framesCount: 90, label: 'rot' }
});

telemetry.add('upload_complete', {
  latencyMs: 3200,
  source: 'training_uploader',
  details: { bundleId: 'abc123', status: 'success' }
});

telemetry.add('model_loaded', {
  latencyMs: 1800,
  source: 'model_client',
  details: { version: '2026-02-03', source: 'profile' }
});

telemetry.add('startup_latency_ms', {
  latencyMs: 320,
  source: 'training_recorder',
  details: {
    startupAttempt: 3,
    cameraStartRequestedAt: 1760000000000,
    cameraStreamReadyAt: 1760000000180,
    detectorFirstFrameAt: 1760000000320
  }
});
```

### Startup-Milestone-Semantik (seit März 2026)

- Pro Startversuch werden die vier Startup-Events genau einmal emittiert.
- `startupAttempt` erhöht sich bei jedem neuen Startversuch und erlaubt die Korrelation im Telemetrie-Dump.
- In der Trainingsaufnahme (`TrainingRecorder`) werden diese Events mit `source: training_recorder` markiert.

### Adaptive Kamera-Constraint-Policy (seit März 2026)

- Jede neue Kamera-Session startet mit dem Idealprofil `1280x720 @ 30fps`.
- Wenn die Erkennungsverarbeitung über ein nachhaltiges Fenster hinweg zu langsam ist (Ø > 45ms), wird schrittweise reduziert:
  1. `960x540 @ 24fps`
  2. `640x480 @ 20fps`
  3. `426x240 @ 15fps`
- Wenn die Erkennung danach über ein nachhaltiges Fenster stabil schnell bleibt (Ø ≤ 28ms), wird die Qualität wieder schrittweise hochgefahren.
- `facingMode` bleibt beim Downgrade erhalten (Front-/Rückkamera wird nicht ungefragt gewechselt).
- Bei jedem erfolgreichen Downgrade wird `camera_constraints_adapted` in die Telemetrie geschrieben, inklusive Tier und Profil.
- Bei erfolgreicher Erholung wird zusätzlich `camera_constraints_recovered` emittiert.

### Performance-Berichte abrufen

```typescript
import { performanceMonitor } from '../services/performanceMonitor';

// Vollständigen Bericht abrufen
const report = performanceMonitor.getPerformanceReport();

// Prüfen ob Performance akzeptabel ist
if (!report.isAcceptable) {
  console.warn('Performance-Probleme:', report.alerts);
}
```

## Visualisierung (geplant)

### Dashboard-Komponenten (zukünftig)

1. **Latenz-Trend-Chart**: Zeigt Verarbeitungszeiten über Zeit
2. **Genauigkeits-Heatmap**: Zeigt Genauigkeit pro Gebärde
3. **Systemzustand-Indikatoren**: FPS, Speicher, Fehlerrate
4. **Training-Zyklus-Timeline**: Visualisiert den gesamten Zyklus

### Metriken-Export

Die gesammelten Telemetrie-Daten können über `telemetry.dump()` exportiert werden:

```typescript
const events = await telemetry.dump();
// events enthält alle gesammelten Metriken seit letztem Dump
```

## Wöchentlicher Dashboard-Prozess (manuell)

Bis ein automatisiertes Dashboard implementiert ist, sollte wöchentlich Folgendes geprüft werden:

### Checkliste

- [ ] Telemetrie-Events exportieren
- [ ] Durchschnittliche Latenzen pro Phase berechnen
- [ ] Vergleich mit Budgets durchführen
- [ ] Ausreißer identifizieren
- [ ] Trends über mehrere Wochen analysieren

### Beispiel-Analyse-Script

```bash
# Telemetrie-Daten aus localStorage extrahieren (Browser-Konsole)
JSON.stringify(JSON.parse(localStorage.getItem('telemetryEvents') || '[]'), null, 2)
```

## Alarme und Benachrichtigungen

### Kritische Schwellenwerte

| Metrik | Warnung | Kritisch |
|--------|---------|----------|
| Frame Processing | > 50ms | > 100ms |
| Frame Rate | < 20 fps | < 15 fps |
| Accuracy | < 80% | < 70% |
| Error Rate | > 10% | > 20% |

### Automatische Warnungen

Der `performanceMonitor` gibt automatisch Warnungen in der Konsole aus:

```typescript
// Diese Warnungen werden automatisch ausgegeben:
// - "Langsame Gebärdenverarbeitung: Xms für [Gebärde]"
// - "Niedrige Frame-Rate: X fps"
```

## Nächste Schritte

1. **Phase 1**: Bestehende Metriken konsolidieren
2. **Phase 2**: Automatischen Export implementieren
3. **Phase 3**: Web-Dashboard erstellen
4. **Phase 4**: Alerting-System hinzufügen

---

**Amy First**: Alle Performance-Metriken dienen dem Ziel, Amys Kommunikation nahtlos und frustrationsfrei zu gestalten. Latenz ist der Feind der Kommunikation – jede Millisekunde zählt.
