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

## Nutzung

- Die Startseite **Gestenerkennung** rendert `useGestureDetector`, ruft den bekannten `GestureRecognitionOrchestrator` auf und protokolliert alle `postMessage`-Events der kopierten WebView-Logik.
- Ein Browser-Bridge (`window.ReactNativeWebView`) leitet alle Nachrichten als `CustomEvent` (`webapp:webview-message`) weiter; die UI zeigt letzte Gesten und Bridge-Payloads an.
- Das Overlay kann ein- oder ausgeblendet werden; Statuschips zeigen „bereit“, „laufend“ oder Fehler an.
- Die Seite **Grenzen & Alternativen** listet deaktivierte native Features und Web-Ersatzwege.
- Die Seite **Training / Upload** baut ein ZIP-Paket wie die App (`metadata.json`, `landmarks.json`, optional Clip/Standbild) und lädt es direkt gegen `VITE_API_URL/api/v1/dgs/sample-bundles` hoch.

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
