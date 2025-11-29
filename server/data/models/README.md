# Gesture Recognition Models

This directory contains trained MLP (Multi-Layer Perceptron) models for gesture recognition.

## Structure

```
models/
├── global/
│   └── amy_model.npz          # Baseline model (all users)
└── <profileId>/
    └── amy_model.npz          # Personalized model per user
```

## Global Baseline Model

The `global/amy_model.npz` file is a zero-initialized baseline model that serves as:
- **Cold start** for new users who haven't trained any gestures yet
- **Fallback** when personalized models are unavailable
- **Foundation** that gets improved as users contribute training samples

### Model Architecture

- **Input**: 126 features (42 hand landmarks × 3D coordinates)
- **Hidden layer**: 256 neurons with ReLU activation
- **Output**: 12 gesture classes (German DGS gestures)
- **Size**: ~144 KB

### Supported Gestures

The baseline model recognizes these German Sign Language (DGS) gestures:

1. **alle** - all/everyone
2. **blau** - blue
3. **essen** - eat
4. **fertig** - finished/done
5. **gelb** - yellow
6. **gruen** - green
7. **nochmal** - again/once more
8. **rot** - red
9. **satt** - full/satisfied
10. **schwester** - sister
11. **spielen** - play
12. **trinken** - drink

### How It's Generated

The baseline model is created using `generate_zero_model.py`:

```bash
cd server
cat > /tmp/baseline_payload.json << 'EOF'
{
  "labels": ["alle", "blau", "essen", "fertig", "gelb", "gruen", "nochmal", "rot", "satt", "schwester", "spielen", "trinken"],
  "counts": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "inputSize": 126,
  "hiddenSize": 256
}
EOF
cat /tmp/baseline_payload.json | python3 src/amyserver_tools/generate_zero_model.py data/models/global/amy_model.npz
```

The zero-initialized model has neutral weights and won't make accurate predictions until trained with real data.

## Personalized Models

As users record training samples:
1. Samples are uploaded to `/api/v1/dgs/sample-bundles`
2. Server runs `train_mlp.py` to train personalized models
3. Personalized models are stored in `models/<profileId>/amy_model.npz`
4. App downloads via `/latest-mlp-model?profileId=<id>`

Personalized models typically achieve 85-95% accuracy after 10+ samples per gesture.

## Model Format

Models are stored as NumPy `.npz` files containing:

- `labels` - Array of gesture names (strings)
- `counts` - Training sample counts per gesture (floats)
- `w1` - Input→Hidden weights (256×126)
- `b1` - Hidden layer biases (256)
- `w2` - Hidden→Output weights (N×256, where N = number of gestures)
- `b2` - Output layer biases (N)

## Verification

Verify a model is valid:

```python
import numpy as np
model = np.load('data/models/global/amy_model.npz')
print('Labels:', model['labels'])
print('Input→Hidden shape:', model['w1'].shape)  # Should be (256, 126)
print('Hidden→Output shape:', model['w2'].shape) # Should be (N, 256)
```

## Production Deployment

For production deployments:

1. **Option A**: Include the baseline model in your deployment
   - Commit `data/models/global/amy_model.npz` to the repository
   - Deploy copies it to the server automatically

2. **Option B**: Generate on first run
   - Server auto-generates zero model when missing
   - Uses labels from `server/data/config/defaultBaselineLabels.json`

The baseline model improves over time as users contribute training data globally.
