# Webapp – Gesten-Bundle im Browser

Diese `webapp/`-App spiegelt das WebView-Bundle aus der Expo-Anwendung. Sie bietet eine kleine Shell in React/Vite, um den Gesten-Detector im Browser zu starten, Meldungen zu inspizieren und Browser-spezifische Grenzen transparent zu machen.

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

Die App bringt einen Konfigurations-Block mit, in dem Basis-URL und optionales Bearer-Token festgelegt werden. Standard ist `VITE_API_URL`; ohne Wert fallen Builds und Tests automatisch auf `http://localhost:5000` zurück. Produktions-Builds ohne Override greifen stattdessen auf den Ursprung der laufenden Seite zurück, solange es sich nicht um eine Dev-URL (z. B. `localhost:5173`) oder einen ungültigen `file:`/`null`-Origin handelt. Für das GitHub-Pages-Deployment wird `VITE_API_URL` beim Build gesetzt, sodass die Live-Seite niemals gegen `localhost` funkt — danke für das Hosting, Lars Moelleken!

```bash
VITE_API_URL=https://dein-server.example.com
```

Im UI kannst du den Wert jederzeit überschreiben; Upload- und Polling-Endpunkte werden automatisch aktualisiert.
Wenn du versehentlich eine URL mit angehängtem `/api` oder `/api/v1` eingibst, normalisiert die Webapp den Wert automatisch auf die Server-Basisdomain, damit Uploads nicht auf einen doppelten API-Pfad laufen.

## Nutzung

- Die Startseite **Gestenerkennung** rendert `useGestureDetector`, ruft den bekannten `GestureRecognitionOrchestrator` auf und protokolliert alle `postMessage`-Events der kopierten WebView-Logik. Landmarks werden wie in der Expo-App stabilisiert, Handedness-Fallbacks ergänzt und können als JSON heruntergeladen werden.
- Ein Browser-Bridge (`window.ReactNativeWebView`) leitet alle Nachrichten als `CustomEvent` (`webapp:webview-message`) weiter; die UI zeigt letzte Gesten und Bridge-Payloads an.
- Das Overlay kann ein- oder ausgeblendet werden; Statuschips zeigen „bereit“, „laufend“ oder Fehler an.
- Ein globaler Profil- und Label-Schalter synchronisiert Gestenerkennung und Training. Erkannte Gesten werden als Vorschlag gespeichert und können direkt als neues Trainingslabel übernommen werden.
- Die Seite **Grenzen & Alternativen** listet deaktivierte native Features und Web-Ersatzwege.
- Die Seite **Einstellungen** enthält einen klaren **Abmelden**-Button, der die Sitzungstoken entfernt und den Login wieder erzwingt, ohne lokale Trainingsdaten löschen zu müssen.
- Die Seite **Training / Upload** bietet zwei Modi:
  - **Geste aufnehmen**: Nimmt Gesten mit der Kamera in Echtzeit auf. Die Handbewegungen werden automatisch erkannt und als Frames mit Landmarks erfasst. Nach der Aufnahme wird ein Trainingspaket (`metadata.json`, `landmarks.json`, Standbild) erstellt und direkt hochgeladen.
  - **Datei hochladen**: Lädt ein vorbereitetes ZIP-Paket wie die App (`metadata.json`, `landmarks.json`, optional Clip/Standbild) hoch - ideal für Test-Bundles oder QA im Browser.

  Beide Modi laden gegen `VITE_API_URL/api/v1/dgs/sample-bundles` hoch.
  Das Upload-Timeout passt sich dabei automatisch an die ZIP-Größe an (statt eines starren Limits), damit größere Video-/Audio-Bundles bei langsamer Verbindung nicht unnötig früh abgebrochen werden.
  Die Weboberfläche zeigt außerdem alle zwischengespeicherten Bundles an (inkl. Status, Versuche und Größe). Du kannst jedes Paket sofort erneut hochladen oder löschen, falls es veraltet ist.

## Kopierter Gesten-Code

- Der gesamte Ordner `src/gesture/` stammt aus `app/webview/` der Expo-App inkl. `installMlp`. Relative Pfade wurden auf den Browser-Build angepasst.
- RN-spezifische APIs (`ReactNativeWebView.postMessage`) werden per Bridge auf Browser-Events gemappt; Haptik nutzt optional `navigator.vibrate`.

## Unterschiede zur Expo-App

- **SecureStore**: im Web deaktiviert; es werden keine sensiblen Daten persistiert.
- **Haptics**: optionales Vibrationsfeedback, falls vom Gerät unterstützt.
- **Kamera**: nur nach Browser-Freigabe nutzbar; ohne Permission laufen die Pipelines im Leerlauf.
- **Medien/Downloads**: Clip-Exporte erfolgen lediglich als Browser-Downloads, keine nativen Mediatheken.
- **Offline/Native APIs**: keine Integration von SecureStore, Haptics-Modulen oder Kamerahardware-spezifischen Optimierungen.
- **Training**: Offline-Queueing erfolgt im Browser über IndexedDB. Bundles behalten Profil, Label, Landmarken, Standbild und
  optionalen Clip und können einzeln neu angestoßen werden.


### Screenshot-Workflow (QA)

Für UI-Checks und Screenshots musst du nicht am Login hängen bleiben:

1. Öffne die Startseite der Webapp.
2. Klicke **„Ohne Anmeldung fortfahren (Demo)”**.
3. Klicke auf der Startansicht auf **„Lernen entdecken”**, um direkt auf eine inhaltlich relevante Oberfläche zu kommen.
4. Navigiere danach zur gewünschten Ansicht (z. B. **Training / Upload**) und erstelle dort den Screenshot.

So landen Screenshots in Reviews auf der relevanten Fachansicht statt auf dem Login-Screen.

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
- **Queue-Transparenz**: Zeigt alle gespeicherten Bundles mit Profil, Label, Status und Größe an. Einzelpakete können erneut synchronisiert oder entfernt werden.
- **Automatisches Modell-Refresh**: Sobald der Trainingsjob abgeschlossen ist, lädt die Webapp das passende MLP-Modell erneut und informiert dich im UI.

Diese Features ermöglichen es Amy, direkt im Browser neue Gesten zu trainieren ohne die native App zu benötigen.
