# Multimodal Training Guide - Complete Workflow

This guide explains how to train Amy's Echo with multimodal sign language data (hands + pose + face) and how the system automatically distributes personalized models.

## 🎯 Quick Start

### For Caregivers Using the Webapp

1. **Record a Sign**:
   - Open the Training page in Amy's Echo
   - Select a sign to record (e.g., "HALLO", "DANKE")
   - Position Amy so her hands, face, and upper body are visible
   - Optional: Schalte Audio stumm, wenn Umgebungsgeräusche die Erkennung stören
   - Press "Record" button
   - Perform the sign naturally
   - Press "Stop" when done

2. **Automatic Upload & Training**:
   - The webapp creates and queues multimodal training bundles
   - The server ingests bundles, retrains, and publishes models

3. **Automatic Model Download**:
   - The webapp checks for model updates on startup
   - Falls back to the global model if no personalized model exists

## 📊 What Data is Captured

### Multimodal Landmark Data

**Hand Landmarks** (126 features):
- Left hand: 21 landmarks × 3 coordinates (x, y, z) = 63 features
- Right hand: 21 landmarks × 3 coordinates (x, y, z) = 63 features
- Captured for every frame while recording

**Pose Landmarks** (99 features):
- 33 body points (shoulders, elbows, hips, etc.) × 3 coordinates
- Normalized to torso center
- Scaled by shoulder width for consistency
- Enables recognition of body movements and orientation

**Face Landmarks** (33 features):
- 11 key facial points (eyes, nose, lips, eyebrows, mouth corners)
- Critical for Non-Manual Markers (NMMs) in DGS
- Normalized to nose tip, scaled by eye distance
- Captures facial expressions essential for sign language grammar

### Total Feature Vector
- **Hand-only models**: 126 features (backward compatible)
- **Multimodal models**: 258 features (126 hands + 99 pose + 33 face)
- **Audio-augmented models**: Multimodal window features plus fixed-size MFCC audio summary

### Model Metadata (Server → Webapp)
Für die Synchronisierung zwischen Training und Laufzeit enthält jede Modell-Datei Metadaten:
- `input_dim`: Gesamtdimension der Eingabe (Fenster + Audio, falls vorhanden)
- `window_size`: Zeitfenstergröße für die Sequenz
- `feature_size`: Visuelle Features pro Frame (ohne Audio)
- `audio_feature_size`: Audio-Zusatzdimensionen pro Fenster (0, wenn kein Audio)

Die Webapp liest diese Felder beim Laden eines Modells und nutzt sie, um Audio-Features korrekt
anzuhängen, falls das Modell Audio enthält.

## 🔄 Complete Training Workflow

Der vollständige Ablauf (Capture → Bundle → Upload → Training → Distribution) ist in
[`docs/training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md`](../training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md)
zusammengeführt. Dieses Dokument fokussiert auf die multimodalen Datenstrukturen
und ihre Bedeutung für DGS.

## 🐇 Der weiße Faden: Amys Selbstentdeckung durch Multimodalität

Jede Trainingsrunde ist ein Schritt in Amys Selbstentdeckung: Die Webapp lernt nicht nur eine Gebärde,
sondern **wie** Amy sie in ihrer echten Welt zeigt. Hände, Haltung und Gesichtsausdruck ergeben
zusammen einen Kontext, der ihre Absicht klarer macht. Dieses Zusammenspiel ist der „weiße Faden“,
der Amy vom ersten Versuch bis zur sicheren Kommunikation begleitet.

**Was wir heute sicher haben:**
- Multimodale Erfassung (Hände + Pose + Gesicht) fließt in Bundles und Trainingsläufe ein.
- Persönliche Modelle werden automatisch verteilt, ohne Amy zu unterbrechen.
- Fehlende Modalitäten führen zu sanften Fallbacks statt Ausfällen.

**Wohin wir als Nächstes gehen (Zukunftsbild):**
- **Qualitätskriterien** für Trainingsdaten, damit Amys Modelle stabiler und robuster werden.
- **Schnellere Feedback-Schleifen**, die Erfolge sofort sichtbar machen.
- **Bessere Transparenz** für Betreuungspersonen: klare Hinweise, welche Modalität gerade fehlt.

Die konkreten nächsten Schritte und Prioritäten stehen in [`docs/planning/TODO.md`](../planning/TODO.md).

## ⚡ Quick Reference

### Zero Manual Steps Required
- ✅ Upload: Automatic when connectivity is available
- ✅ Training: Triggered automatically by server
- ✅ Download: Happens on webapp startup

### Multimodal Features
- **Hands**: 126 features (2 hands × 21 landmarks × 3 coords)
- **Pose**: 99 features (33 body points × 3 coords)
- **Face**: 33 features (11 key facial points × 3 coords)
- **Total**: 258-dimensional input to the neural network

### Hand-first Training Defaults

Für Amys Echtzeit-Erkennung ist die Modell-Priorität jetzt standardmäßig handgeführt:

- `MLP_HAND_PRIORITY` = `4.0` (Primärsignal)
- `MLP_POSE_PRIORITY` = `0.2` (Hilfskontext)
- `MLP_FACE_PRIORITY` = `0.05` (Hilfskontext)

Pose- und Gesichtslandmarks bleiben erhalten, haben aber bewusst deutlich weniger Einfluss als die Handlandmarks.

### Automatic Fallbacks
1. **No personalized model?** → Uses global model
2. **No pose/face data?** → Uses hand-only features
3. **Offline?** → Queues for later upload
4. **Training fails?** → Keeps existing model

## 🧪 Testing the Workflow

### Manual End-to-End Test

1. **Record Training Sample**:
   ```bash
   # In the webapp:
   - Go to Training page
   - Select sign "TEST"
   - Record with hands, face, and body visible
   - Verify upload completes
   ```

2. **Trigger Training**:
   ```bash
   curl -X POST http://localhost:3001/train-model \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json"
   ```

3. **Check Training Status**:
   ```bash
   curl http://localhost:3001/api/v1/train-status/JOB_ID \
     -H "Authorization: Bearer $TOKEN"
   ```

4. **Download Model**:
   ```bash
   curl "http://localhost:3001/latest-mlp-model?profileId=amy" \
     -H "Authorization: Bearer $TOKEN"
   ```

5. **Test Recognition**:
   - Perform the "TEST" sign in the webapp
   - Verify it's recognized with your personalized model

### Automated Integration Test

Siehe die vorhandenen Integrationstests im `integration/`-Ordner.

## 🎓 Training Best Practices

### For Best Recognition Results

1. **Lighting**: Ensure good, even lighting on face and hands
2. **Background**: Plain background helps landmark detection
3. **Framing**: Keep hands, face, and upper body in frame
4. **Consistency**: Record each sign 3-5 times from similar angles
5. **Variation**: Include slight variations in speed and position
6. **Natural**: Sign naturally as Amy would normally

### Data Quality Indicators

Das System erfasst:
- **Modality coverage**: % of frames with each modality
- **Landmark stability**: Smoothness of landmark tracks
- **Missing data**: Alerts if modalities frequently missing

Check metadata in uploaded bundles:
```json
{
  "modalities": {
    "hands": { "coverage": 1.0 },    // ✅ Perfect
    "pose": { "coverage": 0.95 },    // ✅ Good
    "face": { "coverage": 0.60 }     // ⚠️ Consider re-recording
  }
}
```

## 🔧 Troubleshooting

### Model Not Downloading

**Check:**
- Network connectivity
- API endpoint configuration
- User authentication token
- Server is running

**Debug:**
```javascript
// In browser console:
console.log('API URL:', import.meta.env.VITE_API_URL);
console.log('Token:', localStorage.getItem('authToken'));
```

### Training Fails

**Common causes:**
- Not enough training samples (need at least 2 per sign)
- Corrupted bundle data
- Python dependencies missing (mediapipe, opencv)

**Check logs:**
```bash
# Server logs:
tail -f server/logs/training.log

# Or check training report:
curl http://localhost:3001/api/v1/train-status/JOB_ID
```

### Recognition Not Using Multimodal Data

**Verify:**
1. Model was trained with multimodal data
2. Model input size is 258 (not 126)
3. Webapp is passing pose/face landmarks

**Debug in browser console:**
```javascript
// Check if multimodal data is being captured:
window.__mlpPredict = function(hands, handedness, pose, face) {
  console.log('Pose landmarks:', pose?.length);
  console.log('Face landmarks:', face?.length);
  // ... original function
};
```

## 📈 Monitoring & Metrics

### Training Metrics

After training, check the report:
```json
{
  "accuracy": 0.95,
  "samples": 150,
  "labels": ["HALLO", "DANKE", ...],
  "modalities_used": ["hands", "pose", "face"],
  "feature_size": 258,
  "training_time_ms": 45000
}
```

### Recognition Metrics

Die Webapp erfasst:
- Recognition confidence scores
- Fallback to global model frequency
- Model version in use
- Modality availability per frame

## 🚀 Advanced: Custom Training Parameters

### Environment Variables

```bash
# Server configuration:
export MLP_HIDDEN_SIZE=128      # Neural network size
export MLP_EPOCHS=500           # Training iterations
export MLP_LEARNING_RATE=0.01   # Learning speed
export MLP_DROPOUT_RATE=0.0     # Regularization
```

### Training with Specific Data

```bash
# Train only for specific profile:
python server/src/amyserver_tools/train_mlp.py \
  --profile-id amy \
  --min-samples 3

# Train with specific modalities:
# (Auto-detected from data, no flag needed)
```

## ✅ Success Checklist

- [ ] Can record signs with hands, face, and body visible
- [ ] Bundles upload successfully (check connectivity)
- [ ] Training completes without errors
- [ ] Personalized model downloads to the webapp
- [ ] Signs are recognized with good confidence (>0.7)
- [ ] Multimodal features improve accuracy vs hand-only

## 📚 Related Documentation

- [Video Recording Workflow](../training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md)
- [API Documentation](../integration/API.md)
- [Testing Strategy](../testing/TESTING_STRATEGY.md)
- [Development Workflow](../workflows/DEVELOPMENT_WORKFLOW.md)

---

**The system is fully automatic!** Caregivers just record signs, and Amy gets better at recognizing them automatically. 🎉
