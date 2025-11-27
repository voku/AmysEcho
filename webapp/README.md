# Webapp – Gesten-Bundle im Browser

Diese `webapp/`-App spiegelt das WebView-Bundle aus der Expo-Anwendung. Sie bietet eine kleine Shell in React/Vite, um den Gesten-Detector im Browser zu starten, Meldungen zu inspizieren und Browser-spezifische Grenzen transparent zu machen. Die Oberfläche nutzt dieselbe Farbpalette und Card-Optik wie die Expo-App, damit Pflegekräfte in beiden Umgebungen ein vertrautes Erscheinungsbild vorfinden.

## Setup & Scripts

```bash
npm install
npm run dev       # Entwicklungsserver unter http://localhost:5173
npm run build     # Produktions-Build
npm run type-check
npm run lint
npm run test      # Vitest + jsdom
```

### API-Konfiguration

Die App bringt einen Konfigurations-Block mit, in dem Basis-URL und optionales Bearer-Token festgelegt werden. Standard ist `VITE_API_URL` (Fallback `http://localhost:3000`).

```bash
VITE_API_URL=https://dein-server.example.com
```

Im UI kannst du den Wert jederzeit überschreiben; Upload- und Polling-Endpunkte werden automatisch aktualisiert.

## Nutzung

- Die Startseite **Gestenerkennung** rendert `useGestureDetector`, ruft den bekannten `GestureRecognitionOrchestrator` auf und protokolliert alle `postMessage`-Events der kopierten WebView-Logik.
- Ein Browser-Bridge (`window.ReactNativeWebView`) leitet alle Nachrichten als `CustomEvent` (`webapp:webview-message`) weiter; die UI zeigt letzte Gesten und Bridge-Payloads an.
- Das Overlay kann ein- oder ausgeblendet werden; Statuschips zeigen „bereit“, „laufend“ oder Fehler an.
- Ein globaler Profil- und Label-Schalter synchronisiert Gestenerkennung und Training. Erkannte Gesten werden als Vorschlag gespeichert und können direkt als neues Trainingslabel übernommen werden.
- Die Seite **Grenzen & Alternativen** listet deaktivierte native Features und Web-Ersatzwege.
- Die Seite **Training / Upload** bietet zwei Modi:
  - **Geste aufnehmen**: Nimmt Gesten mit der Kamera in Echtzeit auf. Die Handbewegungen werden automatisch erkannt und als Frames mit Landmarks erfasst. Nach der Aufnahme wird ein Trainingspaket (`metadata.json`, `landmarks.json`, Standbild) erstellt und direkt hochgeladen.
  - **Datei hochladen**: Lädt ein vorbereitetes ZIP-Paket wie die App (`metadata.json`, `landmarks.json`, optional Clip/Standbild) hoch - ideal für Test-Bundles oder QA im Browser.
  
  Beide Modi laden direkt gegen `VITE_API_URL/api/v1/dgs/sample-bundles` hoch.

## Kopierter Gesten-Code

- Der gesamte Ordner `src/gesture/` stammt aus `app/webview/` der Expo-App inkl. `installMlp`. Relative Pfade wurden auf den Browser-Build angepasst.
- RN-spezifische APIs (`ReactNativeWebView.postMessage`) werden per Bridge auf Browser-Events gemappt; Haptik nutzt optional `navigator.vibrate`.

## Unterschiede zur Expo-App

- **SecureStore**: im Web deaktiviert; es werden keine sensiblen Daten persistiert.
- **Haptics**: optionales Vibrationsfeedback, falls vom Gerät unterstützt.
- **Kamera**: nur nach Browser-Freigabe nutzbar; ohne Permission laufen die Pipelines im Leerlauf.
- **Medien/Downloads**: Clip-Exporte erfolgen lediglich als Browser-Downloads, keine nativen Mediatheken.
- **Offline/Native APIs**: keine Integration von SecureStore, Haptics-Modulen oder Kamerahardware-spezifischen Optimierungen.
- **Training**: kein Offline-Queueing wie in der Expo-App; der Browser lädt unmittelbar gegen den konfigurierten API-Endpunkt.

## Tests

Vitest-Tests prüfen den Gesten-Hook (Start/Stop sowie Event-Handling). Jsdom stellt dabei die DOM-Oberfläche und das WebView-Bridge-Event bereit.

### Manifest-Erwartungen für Bundles

- Uploads gegen `/api/v1/dgs/sample-bundles` erzeugen Einträge im Trainings-Manifest. Jeder Eintrag enthält mindestens `profileId`, `label`, `capturedAt`, `source` sowie die erwarteten Dateien `metadata.json`, `landmarks.json` und optional `clip.mp4`/`still.jpg`.
- Die Landmark-Datei speichert pro Frame 42 Koordinaten (linke Hand zuerst, danach rechte), inklusive `handedness`-Hinweis.
- Der Integrationstest `src/training/trainingBundle.integration.test.ts` baut ein realistisches ZIP aus Fixture-Frames, lädt es via `uploadTrainingBundle` hoch und prüft, dass das Stub-API die Manifest-Metadaten und Landmarken korrekt registriert.

## Neue Features

### Training-Recorder

Die Webapp unterstützt jetzt die Aufnahme von Gesten in Echtzeit ähnlich wie die mobile App:

- **Live-Kameraaufnahme**: Nutzt die Browser-Kamera um Handbewegungen aufzuzeichnen
- **Automatische Landmark-Erkennung**: MediaPipe erfasst Handlandmarks während der Aufnahme
- **Stillbild-Erfassung**: Nimmt automatisch ein Standbild der letzten erkannten Geste auf
- **Direkter Upload**: Erstellt ZIP-Paket und lädt es unmittelbar nach der Aufnahme hoch
- **Zwei Modi**: Wähle zwischen Live-Aufnahme oder Datei-Upload für maximale Flexibilität
- **Job-Status**: Erkennt Server-Antworten mit `trainingJob` und pollt den Status automatisch; Fehler werden im UI angezeigt.

Diese Features ermöglichen es Amy, direkt im Browser neue Gesten zu trainieren ohne die native App zu benötigen.
