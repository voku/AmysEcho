# DGS Pre-Training Pipeline

This document describes how to run the full DGS (Deutsche Gebärdensprache) pre-training pipeline to create a baseline model for Amy's Echo.

## Overview

The pipeline consists of 4 steps:
1. **Download videos** from signdict.org for all 46 kid starter preset labels
2. **Download MediaPipe models** for landmark extraction
3. **Process videos** to extract hand/pose/face landmarks
4. **Train MLP model** using the extracted landmarks

## Prerequisites

### Python Dependencies
```bash
pip install beautifulsoup4 mediapipe opencv-python numpy scikit-learn
```

### Directory Structure
The pipeline expects this structure:
```
AmysEcho/
├── scripts/
│   ├── fetch_signdict_videos_variants.py  # Step 1: Download videos
│   ├── dgs_common.py                       # Shared utilities
│   ├── process_dgs_videos.py               # Step 3: Extract landmarks
│   └── pretrain_baseline_model.py          # Step 4: Train model
├── server/
│   ├── data/
│   │   ├── config/
│   │   │   └── labelMetadata.json          # 46 label definitions
│   │   ├── dgs_video_examples/             # Downloaded videos + landmarks
│   │   ├── dgs_manifest.json               # Video inventory
│   │   ├── datasets/
│   │   │   └── training_manifest.json      # Training data manifest
│   │   └── models/
│   │       ├── global/
│   │       │   └── amy_model.npz           # Output model
│   │       ├── hand_landmarker.task        # MediaPipe models
│   │       ├── pose_landmarker.task
│   │       └── face_landmarker.task
│   └── training/
│       └── train_mlp.py                    # MLP trainer
```

---

## Step 1: Download DGS Videos

Download sign language videos for all 46 labels from signdict.org:

```bash
cd AmysEcho
PYTHONPATH=. python3 scripts/fetch_signdict_videos_variants.py
```

**What it does:**
- Searches signdict.org for each label and its synonyms
- Downloads main video + variant videos for each sign
- Updates `server/data/dgs_manifest.json` with video inventory

**Expected output:**
- ~300-400 videos in `server/data/dgs_video_examples/`
- Updated manifest with 46 labels

**Time estimate:** 15-30 minutes (depends on network speed)

---

## Step 2: Download MediaPipe Models

Download the MediaPipe landmark extraction models:

```bash
cd server/data/models

# Hand landmarker (~7.8 MB)
curl -L -o hand_landmarker.task \
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"

# Pose landmarker (~5.8 MB)
curl -L -o pose_landmarker.task \
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"

# Face landmarker (~3.8 MB)
curl -L -o face_landmarker.task \
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
```

---

## Step 3: Process Videos to Extract Landmarks

Extract hand, pose, and face landmarks from all videos:

```bash
cd AmysEcho
python3 scripts/process_dgs_videos.py \
  --videos-dir server/data/dgs_video_examples \
  --models-dir server/data/models \
  --manifest server/data/dgs_manifest.json \
  --split-output \
  --max-frames 150 \
  --frame-skip 2
```

**What it does:**
- Processes each video frame through MediaPipe
- Extracts 543 landmarks per frame (42 hand + 33 pose + 468 face)
- Saves landmarks to `{video}_landmarks.json` files

**Expected output:**
- One `*_landmarks.json` file per video
- Each file contains ~50-75 frames of landmark data

**Time estimate:** 30-60 minutes (CPU-intensive)

---

## Step 4: Train the Baseline Model

Create training manifest and train the MLP model:

```bash
cd AmysEcho
python3 scripts/pretrain_baseline_model.py \
  --epochs 500 \
  --learning-rate 0.01 \
  --max-per-label 15
```

**Parameters:**
- `--epochs`: Training iterations (default: 500, use 1000+ for better accuracy)
- `--learning-rate`: SGD learning rate (default: 0.01)
- `--max-per-label`: Max landmark files per label for balanced training (default: 15)

**Alternative: Direct training with custom settings:**
```bash
cd server
PYTHONPATH="training:src" \
MLP_EPOCHS=1000 \
MLP_LEARNING_RATE=0.005 \
python3 training/train_mlp.py
```

**Expected output:**
- Model saved to `server/data/models/global/amy_model.npz`
- Training report at `server/data/pretraining_report.json`

**Time estimate:** 10-30 minutes (depends on epochs)

---

## Full Pipeline (One Command)

Run all steps sequentially:

```bash
#!/bin/bash
set -e
cd /path/to/AmysEcho

echo "=== Step 1: Download Videos ==="
PYTHONPATH=. python3 scripts/fetch_signdict_videos_variants.py

echo "=== Step 2: Download MediaPipe Models ==="
cd server/data/models
curl -L -o hand_landmarker.task "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
curl -L -o pose_landmarker.task "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
curl -L -o face_landmarker.task "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
cd ../../..

echo "=== Step 3: Extract Landmarks ==="
python3 scripts/process_dgs_videos.py \
  --videos-dir server/data/dgs_video_examples \
  --models-dir server/data/models \
  --manifest server/data/dgs_manifest.json \
  --split-output \
  --max-frames 150 \
  --frame-skip 2

echo "=== Step 4: Train Model ==="
python3 scripts/pretrain_baseline_model.py --epochs 1000

echo "=== Done! ==="
cat server/data/pretraining_report.json
```

---

## Target Labels (46 Total)

### Colors (8)
rot, blau, gelb, gruen, lila, orange, schwarz, weiss

### Food & Drink (10)
essen, trinken, hunger, durst, satt, apfel, banane, brot, wasser, milch

### Caregivers (9)
mama, papa, schwester, bruder, oma, opa, hilfe, bitte, danke

### Activities (7)
spielen, schlafen, fertig, nochmal, stopp, mehr, alle

### Emotions (6)
gluecklich, traurig, muede, wuetend, angst, liebe

### Basics (6)
ja, nein, ich, du, wo, was

---

## Expected Results

With the full pipeline (46 labels, ~300 videos, 500-1000 epochs):
- **Training accuracy:** 40-60%
- **Validation accuracy:** 25-40%

This provides a usable baseline model that:
- Recognizes common kid-focused signs without user training
- Can be improved with user-provided training data
- Covers the full kid starter preset vocabulary

---

## Troubleshooting

### "No module named 'scripts'"
Run with PYTHONPATH:
```bash
PYTHONPATH=. python3 scripts/fetch_signdict_videos_variants.py
```

### "Unable to open zip archive" (MediaPipe)
The `.task` files are placeholders. Download the real models:
```bash
curl -L -o server/data/models/hand_landmarker.task \
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
```

### Low validation accuracy
- Increase epochs: `--epochs 1000`
- Lower learning rate: `--learning-rate 0.005`
- Check landmark extraction: files should have 50+ valid frames each

### Out of memory during training
- Reduce `--max-per-label` to 10
- Process fewer frames: `--max-frames 100`
