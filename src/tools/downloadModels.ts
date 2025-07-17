import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import https from 'https';
import fs from 'fs';
import path from 'path';

const models = [
  {
    url: 'https://storage.googleapis.com/mediapipe-assets/hand_landmarker.task',
    out: path.join(__dirname, '../../app/assets/models/hand_landmarker.tflite'),
  },
  {
    url: 'https://storage.googleapis.com/mediapipe-assets/gesture_recognizer.task',
    out: path.join(__dirname, '../../app/assets/models/gesture_classifier.tflite'),
  },
];

async function download(url: string, dest: string) {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  return new Promise<void>((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`Request failed: ${res.statusCode}`));
        return;
      }
      const file = createWriteStream(dest);
      const pipe = pipeline(res, file, err => {
        if (err) reject(err);
        else resolve();
      });
    }).on('error', reject);
  });
}

(async () => {
  for (const m of models) {
    const name = path.basename(m.out);
    console.log(`Downloading ${name}...`);
    try {
      await download(m.url, m.out);
      console.log(`Saved to ${m.out}`);
    } catch (err) {
      console.error(`Failed to download ${name}:`, err);
    }
  }
})();
