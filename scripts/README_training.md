# Gesture Model Training Guide

This guide explains how to train and deploy gesture recognition models for Amy's Echo.

## Quick Start

```bash
# Train a model with default settings
python scripts/train_gesture_model.py --videos-dir app/assets/videos/
```

This will:
1. Extract landmarks from all videos in `app/assets/videos/`
2. Augment the data (4x increase)
3. Train an MLP model for 500 epochs
4. Deploy the model to the app
5. Rebuild the WebView bundle

## Adding More Training Videos

### Multiple Videos per Gesture

You can add multiple videos for the same gesture by naming them with a suffix:

```
app/assets/videos/
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
python scripts/train_gesture_model.py \
  --videos-dir app/assets/videos/ \
  --output-model data/my_custom_model.npz \
  --epochs 1000 \
  --hidden-size 256 \
  --learning-rate 0.005 \
  --max-frames 500 \
  --frame-skip 1 \
  --augmentation-factor 8
```

### Parameters Explained

- `--epochs`: Number of training iterations (default: 500)
- `--hidden-size`: Size of the hidden layer (default: 128)
- `--learning-rate`: Learning rate for training (default: 0.01)
- `--max-frames`: Maximum frames to extract per video (default: 300)
- `--frame-skip`: Process every Nth frame (default: 2, higher = faster but less data)
- `--augmentation-factor`: How much to augment data (default: 4x)

### Skip Deployment

If you only want to train the model without deploying:

```bash
python scripts/train_gesture_model.py --videos-dir app/assets/videos/ --skip-deploy
```

## Model Validation

After training, the script validates the model and shows:
- Number of gesture classes
- Model architecture
- Training accuracy

Example output:
```
✅ Model trained successfully!
   Classes: 12
   Labels: ['alle', 'blau', 'essen', 'fertig', 'gelb', 'gruen', 'nochmal', 'rot', 'satt', 'schwester', 'spielen', 'trinken']
   Architecture: 126 -> 128 -> 12
```

## Troubleshooting

### Low Accuracy

If training accuracy is poor (<20%):
1. Add more videos for each gesture
2. Use `--frame-skip 1` to get more frames
3. Increase `--epochs` to 1000+
4. Try larger `--hidden-size` (256 or 512)

### Memory Issues

If training fails due to memory:
1. Reduce `--hidden-size`
2. Use `--frame-skip 3` or higher
3. Reduce `--max-frames`

### Video Processing Issues

If landmark extraction fails:
1. Check video quality and lighting
2. Ensure hands are clearly visible
3. Try shorter videos with clearer gestures

## Model Files

The script creates several files:
- `data/amy_model.npz`: Trained model weights and labels
- `app/assets/dgs_model.npz`: Deployed model (copied from amy_model.npz)
- `app/assets/dgs_model_base64.txt`: Base64 encoded model for WebView
- `app/assets/gestureDetector.js`: Updated WebView bundle

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