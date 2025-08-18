import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Define the structure of the landmark data for clarity
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type Hand = Landmark[];

// Resolve Python script path in both dev (ts-node or compiled) and build outputs
const scriptCandidates = [
  path.join(__dirname, 'detect_hand_landmarks.py'), // when run from ts-node in src
  path.join(__dirname, '../../src/services/detect_hand_landmarks.py'), // when compiled to dist
  path.join(process.cwd(), 'server/src/services/detect_hand_landmarks.py'), // fallback from repo root
];
const PYTHON_SCRIPT_PATH = scriptCandidates.find((p) => {
  try { return fs.existsSync(p); } catch { return false; }
}) || scriptCandidates[0];

export function detectHandLandmarks(base64Image: string): Promise<Hand[]> {
  return new Promise((resolve, reject) => {
    // Spawn the python process
    const pythonProcess = spawn('python3', [PYTHON_SCRIPT_PATH, base64Image]);

    let result = '';
    let error = '';

    // Listen for data from the python script
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });

    // Listen for any errors
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    // Handle process exit
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python script exited with code ${code}: ${error}`));
      }
      try {
        const parsedResult = JSON.parse(result);
        // Check if the python script returned a specific error message
        if (parsedResult.error) {
            return reject(new Error(`Error from Python script: ${parsedResult.error}`));
        }
        resolve(parsedResult as Hand[]);
      } catch (e: any) {
        reject(new Error(`Failed to parse JSON from Python script: ${e.message}`));
      }
    });
  });
}
