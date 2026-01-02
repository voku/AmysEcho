# Audio Capture für multimodale Gestenerkennung

**Status:** Implementiert (Client- und Server-Seite)

## Übersicht

Das Audio-Capture-System ermöglicht es Amy, während der Gebärdensprache Wörter zu sagen (z.B. "Iila" für Lila), um eine umfassendere multimodale Erkennung zu ermöglichen. Das System erfasst Audio-Aufnahmen parallel zu Video- und Landmark-Daten während des Trainingsprozesses.

## Amy First Prinzipien

- ✅ **Zero interruption** - Audio-Aufnahme läuft parallel, ohne die Gestenerkennung zu unterbrechen
- ✅ **Zero failure** - Fehler beim Audio-Aufnehmen blockieren nicht die Video-/Landmark-Aufnahme
- ✅ **Zero delay** - Audio-Aufnahme startet sofort ohne spürbaren Overhead
- ✅ **Zero compromise** - Audio ist optional; das System funktioniert auch ohne Mikrofon

## Architektur

### Client-Seite (`webapp/`)

#### AudioCaptureService (`webapp/src/services/audioCaptureService.ts`)
Zentrale Komponente für Audio-Aufnahme mit Web Audio API.

**Features:**
- MediaRecorder-basierte Audio-Aufnahme
- Konfigurierbare Audio-Constraints (Echo-Cancellation, Noise Suppression, etc.)
- Unterstützung mehrerer Audio-Formate (WebM Opus, OGG, MP4, WAV)
- Automatische Ressourcenverwaltung (Stream-Cleanup)
- Fehlerbehandlung ohne Blockierung der Anwendung

**Verwendung:**
```typescript
import { AudioCaptureService } from './services/audioCaptureService';

const audioService = new AudioCaptureService({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 1, // Mono für Sprache ausreichend
});

await audioService.startRecording();
// ... Aufnahme läuft ...
const result = await audioService.stopRecording();

if (result.audioFile) {
  console.log('Audio erfasst:', result.audioFile.name);
  console.log('Größe:', result.audioSizeBytes, 'bytes');
  console.log('Dauer:', result.audioDurationMs, 'ms');
}
```

#### Integration in useTrainingRecorder

Der `useTrainingRecorder` Hook wurde erweitert, um Audio parallel zu Video aufzunehmen:

```typescript
const {
  recordedData: {
    clipFile,      // Video-Datei
    audioFile,     // Audio-Datei (NEU)
    frames,        // Landmark-Daten
    stillImage,    // Standbild
  }
} = useTrainingRecorder(videoRef);
```

**Erweitertes RecordedData Interface:**
- `audioFile: File | null` - Aufgenommene Audio-Datei
- `audioSizeBytes: number` - Größe der Audio-Datei
- `audioDurationMs: number` - Dauer der Audio-Aufnahme
- `audioError: string | null` - Fehler bei der Audio-Aufnahme

### Server-Seite (`server/`)

#### Bundle-Format

Training-Bundles enthalten jetzt optional eine Audio-Datei:

```
training-bundle.zip
├── metadata.json       (enthält audioFilename, audio recording metadata)
├── landmarks.json
├── clip.webm          (Video)
├── still.jpg          (Standbild)
└── audio.webm         (NEU: Audio-Aufnahme)
```

#### Metadata Schema

`metadata.json` wurde erweitert:

```json
{
  "label": "Lila",
  "profileId": "uuid-...",
  "clipFilename": "clip.webm",
  "stillFilename": "still.jpg",
  "audioFilename": "audio.webm",
  "recording": {
    "clipDurationMs": 3000,
    "clipBytes": 125000,
    "audioDurationMs": 3000,
    "audioBytes": 45000,
    "audioMimeType": "audio/webm;codecs=opus"
  }
}
```

#### Server-seitige Verarbeitung

**Bundle-Ingestion (`server/src/routes/trainingBundleRoute.ts`):**
- Erkennt Audio-Dateien anhand von Dateiendungen: `.webm`, `.opus`, `.ogg`, `.mp3`, `.m4a`, `.wav`, `.aac`
- Speichert Audio-Datei-Referenzen im Training-Manifest
- Fügt Audio-Metadaten zur Bundle-Dokumentation hinzu

**Training-Manifest:**
```json
{
  "entries": [
    {
      "id": "bundle-id",
      "storage": {
        "clip": "clip.webm",
        "still": "still.jpg",
        "audio": "audio.webm"
      },
      "metadata": {
        "audioFilename": "audio.webm"
      }
    }
  ]
}
```

## Audio-Formate

### Priorisierung
1. **WebM mit Opus** (Bevorzugt) - Beste Kompression für Sprache
2. **WebM** (Fallback)
3. **OGG mit Opus**
4. **MP4 / M4A**
5. **WAV** (Unkomprimiert, große Dateien)

### Empfohlene Einstellungen
- **Sample Rate:** 48 kHz (Standard für moderne Browser)
- **Kanäle:** 1 (Mono für Sprache)
- **Codec:** Opus (optimiert für Sprache)
- **Echo Cancellation:** Aktiviert
- **Noise Suppression:** Aktiviert
- **Auto Gain Control:** Aktiviert

## Berechtigungen

Das System benötigt **Mikrofon-Berechtigung** für Audio-Aufnahme:

```javascript
navigator.mediaDevices.getUserMedia({ audio: true })
```

**Fehlerbehandlung:**
- `NotAllowedError`: Benutzer hat Berechtigung verweigert
- `NotFoundError`: Kein Mikrofon gefunden
- `NotReadableError`: Mikrofon wird von anderer Anwendung verwendet

Das System funktioniert weiterhin ohne Audio-Berechtigung - nur Video und Landmarks werden dann erfasst.

## Tests

**Unit Tests (`webapp/src/services/audioCaptureService.test.ts`):**
- 16 Tests decken alle Funktionalitäten ab
- Mocked MediaRecorder und getUserMedia
- Testet Lebenszyklus, Fehlerbehandlung, Ressourcen-Cleanup
- Validiert Amy First Prinzipien

**Test-Ausführung:**
```bash
npm test --prefix webapp -- audioCaptureService.test.ts
```

## Zukünftige Erweiterungen

1. **Audio-Preprocessing:**
   - Format-Normalisierung (alles zu Opus konvertieren)
   - Audio-Segmentierung (Stille entfernen)
   - Lautstärke-Normalisierung

2. **Multimodales Training:**
   - Python-Trainer erweitern für Audio-Verarbeitung
   - Audio-Features extrahieren (MFCC, Spektrogramme)
   - Multimodales MLP-Modell (Audio + Landmarks)

3. **Integration Tests:**
   - End-to-End Test für Audio+Video+Landmarks
   - Validierung der Bundle-Erstellung mit Audio
   - Server-seitige Audio-Ingestion testen

## Troubleshooting

### Audio wird nicht aufgenommen
- **Prüfen:** Mikrofon-Berechtigung erteilt?
- **Prüfen:** Mikrofon in anderen Apps funktioniert?
- **Prüfen:** Browser unterstützt MediaRecorder?
- **Log:** Fehler in `audioError` Feld überprüfen

### Audio-Qualität schlecht
- **Lösung:** Sample Rate auf 48000 erhöhen
- **Lösung:** Noise Suppression aktivieren
- **Lösung:** Externes Mikrofon verwenden

### Audio-Datei zu groß
- **Empfehlung:** WebM mit Opus verwenden (beste Kompression)
- **Vermeiden:** WAV-Format (unkomprimiert)
- **Überwachen:** `audioBytes` in Bundle-Metadaten

### Browser-Kompatibilität
- **Chrome/Edge:** Vollständige Unterstützung
- **Firefox:** Vollständige Unterstützung
- **Safari:** Eingeschränkte MIME-Type-Unterstützung
- **Fallback:** System wählt automatisch besten verfügbaren Codec

## Referenzen

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [MediaStream API](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream)
- [Opus Codec](https://opus-codec.org/)
