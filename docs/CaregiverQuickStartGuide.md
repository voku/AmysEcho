# Caregiver Quick Start Guide

This guide helps caregivers get Amy's Echo running and begin supporting a child's communication in minutes.

## 0. Verify Your Setup (Optional but Recommended)

Before installing, you can verify that your system is ready:

```bash
./scripts/verify-gesture-system.sh
```

This checks dependencies and runs all tests to ensure everything works. Skip this if you want to jump straight to installation.

## 1. Install the App
1. Install dependencies:
   ```bash
   npm install
   npm install --prefix app
   npm install --prefix server
   ```
2. Start the backend server so uploads and training are available:
   ```bash
   npm run build --prefix server
   npm start --prefix server
   ```
3. Start the app:
   ```bash
   npm run android --prefix app   # or `npm run ios --prefix app`
   ```

## 2. First Launch
1. On the device, open **Amy's Echo**.
2. Grant camera and microphone permissions when prompted.
3. Folge dem vierstufigen Onboarding:
   1. **Name festlegen** – gib den Namen ein, den Amy’s Echo sprechen soll.
   2. **Zugänglichkeit wählen** – entscheide dich für große Schrift und/oder hohen Kontrast.
   3. **Freigaben bestätigen** – bestimme, ob anonymisierte Daten zur Verbesserung beitragen dürfen.
   4. **Vokabular wählen** – starte mit dem Wortfeld, das dein Kind sofort benötigt.
   Amy’s Echo erklärt jeden Schritt beruhigend mit Emojis, damit du weißt, wie die App dein Kind unterstützt.

## 3. Communicating
1. Point the camera at the child's hands.
2. The app speaks and shows a symbol when it recognizes a gesture.
3. Tippe auf **Hilfe**, wenn eine Geste falsch erkannt wurde – so speicherst du eine Korrektur für zukünftiges Lernen.

## 4. Teaching New Gestures
1. Open the **Admin Panel** and choose **Training**.
2. Record the child performing the new sign several times.
3. Upload the samples to the server. A personalized model is trained and downloaded automatically.

## 5. Refreshing the Model
1. After recording new samples, open the **Training** tab and upload them.
2. The app shows when the server has queued or completed the training job.
3. Once the model download finishes, Amy immediately benefits from the updated gestures.

## 6. Anmeldung und Tokens
1. Melde dich im Web- oder Mobil-Client über den Login-Screen mit deinem Nutzerkonto an.
2. Die App speichert das erhaltene Zugangstoken automatisch und nutzt es für Serveranfragen.

## 7. Need Help?
If you run into problems during setup or usage, consult the [Troubleshooting Guide](Troubleshooting.md) for common fixes.

---
With these steps, caregivers can immediately begin using Amy's Echo to translate gestures into speech and track learning progress.
