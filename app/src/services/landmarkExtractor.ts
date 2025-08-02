import * as FileSystem from 'expo-file-system';
// TODO: ffmpeg-kit-react-native is not longer supported v1
/*import { FFmpegKit } from 'ffmpeg-kit-react-native';*/
import type { TensorflowModel } from 'react-native-fast-tflite';
const { loadTensorflowModel } = require('react-native-fast-tflite');
import { HAND_LANDMARKER_MODEL } from '../constants/modelPaths';

let handModel: TensorflowModel | null = null;

async function loadHandModel(): Promise<void> {
  if (handModel) return;
  handModel = await loadTensorflowModel(HAND_LANDMARKER_MODEL);
}

export async function extractLandmarksFromVideo(videoPath: string): Promise<number[][][]> {
  // TODO: ffmpeg-kit-react-native is not longer supported v2
  /*
    await loadHandModel();
  if (!handModel) return [];

  const tmpDir = FileSystem.cacheDirectory + 'frames_' + Date.now() + '/';
  await FileSystem.makeDirectoryAsync(tmpDir, { intermediates: true });
  await FFmpegKit.execute(`-i ${videoPath} ${tmpDir}frame_%04d.png`);
  const files = await FileSystem.readDirectoryAsync(tmpDir);
  const results: number[][][] = [];
  for (const f of files) {
    try {
      const data = await FileSystem.readAsStringAsync(tmpDir + f, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const out = handModel.runSync([new Uint8Array(Buffer.from(data, 'base64'))]) as any[];
      if (out && out[0]) results.push(out[0] as number[][]);
    } catch {}
  }
  await FileSystem.deleteAsync(tmpDir, { idempotent: true });
  await FileSystem.deleteAsync(videoPath, { idempotent: true });
  return results;
   */

  console.warn('Video-based landmark extraction is not supported.');
  await FileSystem.deleteAsync(videoPath, { idempotent: true });
  return [];
}