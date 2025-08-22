# Schnellstartleitfaden für Betreuungspersonen

Diese Anleitung hilft Betreuungspersonen, Amy's Echo in wenigen Minuten zum Laufen zu bringen und ein Kind bei der Kommunikation zu unterstützen.

## 1. App installieren
1. Abhängigkeiten installieren:
   ```bash
   npm install
   npm install --prefix app
   npm install --prefix server
   ```
2. Backend bauen und die Gestenerkennungsdatei herunterladen, die vom Server bereitgestellt wird:
   ```bash
   npm run build --prefix server
   (Keine Aktion nötig – MediaPipe-Assets werden über CDN geladen)
   ```
3. Backend-Server starten:
   ```bash
   API_TOKEN=<geheim> npm start --prefix server
   ```
4. App starten:
   ```bash
   npm run android --prefix app   # oder `npm run ios --prefix app`
   ```

## 2. Erster Start
1. Öffne **Amy's Echo** auf dem Gerät.
2. Erteile Kamera- und Mikrofonberechtigungen, wenn du dazu aufgefordert wirst.
3. Folge den Onboarding-Schritten, um zu lernen, wie das Gestensystem funktioniert.

## 3. Kommunikation
1. Richte die Kamera auf die Hände des Kindes.
2. Die App spricht und zeigt ein Symbol an, wenn sie eine Geste erkennt.
3. Tippe auf **Help Me**, wenn die Geste falsch verstanden wurde – so wird eine Korrektur für zukünftiges Lernen gespeichert.

## 4. Neue Gesten beibringen
1. Öffne das **Admin Panel** und wähle **Training**.
2. Nimm das Kind mehrmals bei der neuen Geste auf.
3. Lade die Beispiele auf den Server hoch. Ein personalisiertes Modell wird trainiert und automatisch heruntergeladen.

## 5. Fortschritt überwachen
1. Tippe auf der Erkennungsscreen auf **Analytics**.
2. Das Dashboard zeigt die jüngste Erfolgsrate und den Verbesserungstrend.
3. Nutze diese Daten, um zu entscheiden, wann geübt oder neue Gesten hinzugefügt werden sollen.

## 6. Zugriffstoken aktualisieren
1. Gib im **Admin Panel** den OpenAI API-Schlüssel und den Backend-Token ein, falls erforderlich.
2. Tippe bei jedem Feld auf **Save**. Tokens werden sicher auf dem Gerät gespeichert.

## 7. Hilfe nötig?
Wenn Probleme während der Einrichtung oder Nutzung auftreten, sieh in den [Troubleshooting Guide](../Troubleshooting.md) für häufige Lösungen.

---
Mit diesen Schritten können Betreuungspersonen sofort damit beginnen, Amy's Gesten in Sprache zu übersetzen und den Lernfortschritt zu verfolgen.
