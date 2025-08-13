import { loadDatabase } from '../db';
import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';

async function autoRetrain(dbPath: string) {
  const db = await loadDatabase(dbPath);
  const corrections = db.corrections;
  const negativeSamples = db.negativeSamples;

  const trainingData = [...corrections, ...negativeSamples];

  if (trainingData.length === 0) {
    console.log('No new data to train on.');
    return;
  }

  const tmp = path.join(process.cwd(), 'tmp_training_data.json');
  await fs.writeFile(tmp, JSON.stringify(trainingData));

  const script = process.env.TRAIN_SCRIPT ?? path.join(__dirname, '../train.py');
  const child = spawn('python3', [script, tmp], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  child.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  child.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
    fs.unlink(tmp);
  });
}

// determine where our database JSON lives
const dbPath =
  process.argv[2] ??
  process.env.DB_PATH ??
  path.resolve(process.cwd(), 'db.json');

// run retraining asynchronously, but avoid unhandled rejections
// fire-and-forget with error handling
void autoRetrain(dbPath).catch((err) => {
  console.error('autoRetrain failed:', err);
  process.exitCode = 1;
});
