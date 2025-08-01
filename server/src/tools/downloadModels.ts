import fs from 'fs';
import path from 'path';
import https from 'https';
import os from 'os';
import { execFile } from 'child_process';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import {
  HAND_LANDMARKER_MODEL_PATH,
  GESTURE_CLASSIFIER_MODEL_PATH,
} from '../constants/modelPaths';

interface ModelSpec {
  url: string;
  extract: (downloadedPath: string, destPath: string) => Promise<void>;
  dest: string;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  return new Promise<void>((resolve, reject) => {
    https
      .get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`Request failed: ${res.statusCode}`));
          return;
        }
        const file = createWriteStream(dest);
        pipeline(res, file, err => {
          if (err) reject(err);
          else resolve();
        });
      })
      .on('error', reject);
  });
}

async function unzip(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });
  return new Promise((resolve, reject) => {
    execFile('unzip', ['-o', src, '-d', dest], err => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function extractHandLandmarker(taskPath: string, dest: string) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hand-'));
  await unzip(taskPath, tmpDir);
  const modelSrc = path.join(tmpDir, 'hand_landmarks_detector.tflite');
  await fs.promises.copyFile(modelSrc, dest);
}

async function extractGestureClassifier(taskPath: string, dest: string) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gesture-'));
  await unzip(taskPath, tmpDir);
  const recognizerTask = path.join(tmpDir, 'hand_gesture_recognizer.task');
  const nestedDir = path.join(tmpDir, 'recognizer');
  await unzip(recognizerTask, nestedDir);
  const modelSrc = path.join(nestedDir, 'canned_gesture_classifier.tflite');
  await fs.promises.copyFile(modelSrc, dest);
}

const models: ModelSpec[] = [
  {
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
    dest: HAND_LANDMARKER_MODEL_PATH,
    extract: extractHandLandmarker,
  },
  {
    url: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task',
    dest: GESTURE_CLASSIFIER_MODEL_PATH,
    extract: extractGestureClassifier,
  },
];

async function ensureModel(model: ModelSpec) {
  if (fs.existsSync(model.dest)) {
    console.log(`${path.basename(model.dest)} already exists, skipping`);
    return;
  }
  const tmpFile = path.join(os.tmpdir(), path.basename(model.url));
  console.log(`Downloading ${model.url}...`);
  await downloadFile(model.url, tmpFile);
  await model.extract(tmpFile, model.dest);
  await fs.promises.unlink(tmpFile).catch(() => {});
  console.log(`Saved to ${model.dest}`);
}

(async () => {
  for (const m of models) {
    try {
      await ensureModel(m);
    } catch (err) {
      console.error(`Failed to process ${path.basename(m.dest)}:`, err);
    }
  }
})();
