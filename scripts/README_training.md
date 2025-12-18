# Gesture Model Training Guide

This guide explains how to train and deploy gesture recognition models for Amy's Echo.

## Quick Start

Training data is now primarily captured through the webapp's training flow. For historical reference or if you need to train from external video files:

```bash
# Train a model with video files (legacy approach)
python scripts/train_model.py --videos-dir /path/to/videos/
```

This will:
1. Extract landmarks from all videos in the specified directory
2. Augment the data (4x increase)
3. Split the data into training (80%) and testing (20%) sets
4. Train an MLP model for 500 epochs
5. Evaluate the model on the test set
6. Deploy the model to the server's data directory

### Browser-captured DGS clips

**This is now the primary training method.** Record Amy's DGS attempts directly in the webapp training flow (`/training` route). The browser produces ZIP bundles containing `metadata.json`, `landmarks.json`, and optional `clip/still` media. These bundles are uploaded to the server and used for training, providing the best data source for early-child vocabulary and idiosyncratic signing patterns.

## Adding More Training Videos (Legacy)

**Note:** The preferred method is now to use the webapp's training interface. This section is for reference if you need to train from external video files.

### Multiple Videos per Gesture

You can add multiple videos for the same gesture by naming them with a suffix:

```
/path/to/videos/
├── rot.mp4
├── rot_1.mp4
├── rot_2.mp4
├── gelb.mp4
├── gelb_extra.mp4
└── ...
```

The script automatically recognizes these as additional samples for the same gesture.

### Video Requirements

- **Format**: MP4 videos
- **Content**: Clear hand gestures performed by Amy or similar subjects
- **Naming**: Use the gesture name as the base filename (e.g., `rot.mp4`, `essen.mp4`)
- **Duration**: 5-10 seconds per gesture is ideal
- **Quality**: Good lighting, clear hand visibility

## Advanced Usage

### Custom Training Parameters

```bash
python scripts/train_model.py \
  --videos-dir /path/to/videos/ \
  --output-model data/my_custom_model.npz \
  --epochs 1000 \
  --hidden-size 256 \
  --learning-rate 0.005 \
  --max-frames 500 \
  --frame-skip 1 \
  --augmentation-factor 8 \
  --test-split 0.3
```

### Parameters Explained

- `--epochs`: Number of training iterations (default: 500)
- `--hidden-size`: Size of the hidden layer (default: 128)
- `--learning-rate`: Learning rate for training (default: 0.01)
- `--max-frames`: Maximum frames to extract per video (default: 300)
- `--frame-skip`: Process every Nth frame (default: 2, higher = faster but less data)
- `--augmentation-factor`: How much to augment data (default: 4x)
- `--test-split`: Fraction of data to use for testing (default: 0.2)

### Skip Deployment

If you only want to train the model without deploying:

```bash
python scripts/train_model.py --videos-dir /path/to/videos/ --skip-deploy
```

## Model Validation

After training, the script evaluates the model and shows:
- Training and testing accuracy
- Number of gesture classes
- Model architecture

Example output:
```
Evaluation results:
  - Training Accuracy: 0.9876
  - Testing Accuracy: 0.9543
```

## Troubleshooting

### Low Test Accuracy

If testing accuracy is poor (<80%):
1. Add more videos for each gesture, ensuring variety in performance.
2. Use `--frame-skip 1` to get more frames.
3. Increase `--epochs` to 1000+.
4. Try a larger `--hidden-size` (256 or 512).
5. Ensure your test set is representative of real-world gestures.

### Memory Issues

If training fails due to memory:
1. Reduce `--hidden-size`.
2. Increase `--frame-skip` to 3 or higher.
3. Reduce `--max-frames`.

### Video Processing Issues

If landmark extraction fails:
1. Check video quality and lighting.
2. Ensure hands are clearly visible.
3. Try shorter videos with clearer gestures.

## Model Files

The script creates the following model file:
- `server/data/models/global/amy_model.npz`: Baseline model served to clients (or profile-specific models in `server/data/models/<profileId>/`)

**Note:** The old app-specific files (`app/assets/gestureDetector.js`, `app/src/constants/bundledMlpModel.ts`) are no longer used. The webapp loads models directly from the server via API endpoints.

## Testing the Model

After deployment:
1. Restart the Amy's Echo app
2. Test gesture recognition
3. Check logs for MLP predictions
4. Monitor accuracy and performance

## Current Gesture Set

The system currently recognizes these gestures:
- alle (all)
- blau (blue)
- essen (eat)
- fertig (done)
- gelb (yellow)
- gruen (green)
- nochmal (again)
- rot (red)
- satt (full/satisfied)
- schwester (sister)
- spielen (play)
- trinken (drink)

## Evaluation

Focus evaluation on Amy-first data captured through the browser workflow. Keep small, targeted probe sets (e.g., lip pointing
for "rot", occlusion tolerance) next to the training bundles and measure progress with lightweight scripts or notebooks that
consume those manifests. Avoid pulling in large weather datasets that do not reflect the target users.
