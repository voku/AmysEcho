import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { mapRawToAppLabel } from './labelMap';

export interface GestureResult {
  label: string;
  confidence: number;
}

export interface RecognitionResponse {
  result: GestureResult;
  landmarks: Array<[number, number, number]>;
  landmarks_px?: Array<[number, number, number]>;
  image_size?: { width: number; height: number };
  handedness?: string | null;
  categories?: Array<{ name: string | null; score: number }>;
  appLabel?: string | null;
  appConfidence?: number | null;
}

// Resolve Python script path robustly for dev/dist
const scriptCandidates = [
  path.join(__dirname, 'recognize_gesture.py'),
  path.join(__dirname, '../../src/services/recognize_gesture.py'),
  path.join(process.cwd(), 'server/src/services/recognize_gesture.py'),
];
const PYTHON_SCRIPT_PATH = scriptCandidates.find((p) => {
  try { return fs.existsSync(p); } catch { return false; }
}) || scriptCandidates[0];

import { DB_FILE_PATH } from '../constants/dbPaths';
import { loadDatabase } from '../db';

export function recognizeGesture(base64Image: string, profileId?: string): Promise<RecognitionResponse> {
  return new Promise(async (resolve, reject) => {
    // Avoid E2BIG by sending image via stdin; pass profileId via env
    const env = { ...process.env } as NodeJS.ProcessEnv;
    env['AE_PROFILE_ID'] = profileId ?? '';

    // Calculate gesture bias from correction history
    if (profileId) {
      try {
        const db = await loadDatabase(DB_FILE_PATH);
        const scores = db.corrections
          .filter(c => c.profileId === profileId)
          .reduce((acc, c) => {
            acc[c.actualGesture] = (acc[c.actualGesture] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
        env['AE_GESTURE_BIAS'] = JSON.stringify(scores);
      } catch (e) {
        console.error('Failed to calculate gesture bias', e);
      }
    }

    const python = spawn('python3', [PYTHON_SCRIPT_PATH], { env });
    let out = '';
    let err = '';
    python.stdout.on('data', (d) => (out += d.toString()));
    python.stderr.on('data', (d) => (err += d.toString()));
    // write base64 payload to stdin
    python.stdin.write(base64Image);
    python.stdin.end();
    python.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Python exited ${code}: ${err}`));
      try {
        const parsed = JSON.parse(out);
        if (parsed.error) return reject(new Error(parsed.error));
        // Map to app labels
        const rawLabel: string | null = parsed?.result?.label ?? null;
        const mapped = mapRawToAppLabel(rawLabel, parsed?.categories);
        const enriched: RecognitionResponse = { ...parsed, appLabel: mapped.appLabel, appConfidence: mapped.appConfidence };
        resolve(enriched);
      } catch (e: any) {
        reject(new Error(`Invalid JSON from recognizer: ${e.message}`));
      }
    });
  });
}
