import fs from 'fs';
import path from 'path';
import https from 'https';

const DEST_DIR = path.join(__dirname, '../../models');
const DEST_FILE = path.join(DEST_DIR, 'gesture_recognizer.task');
const URL = process.env.GESTURE_TASK_URL ||
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task';

async function download(url: string, dest: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', reject);
  });
}

(async () => {
  try {
    if (fs.existsSync(DEST_FILE)) {
      const stat = await fs.promises.stat(DEST_FILE);
      if (stat.size > 0) {
        console.log(`gesture_recognizer.task already present at ${DEST_FILE}`);
        return;
      }
    }
    console.log(`Downloading gesture_recognizer.task to ${DEST_FILE}...`);
    await download(URL, DEST_FILE);
    const size = (await fs.promises.stat(DEST_FILE)).size;
    if (size === 0) throw new Error('Downloaded file is empty');
    console.log('Done.');
  } catch (e) {
    console.error('Failed to download gesture task file:', e);
    process.exitCode = 1;
  }
})();

