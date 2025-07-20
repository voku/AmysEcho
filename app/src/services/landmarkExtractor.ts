import * as FileSystem from 'expo-file-system';
import { FFmpegKit } from 'ffmpeg-kit-react-native';
import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';

let handModel: TensorflowModel | null = null;

async function loadHandModel(): Promise<void> {
  if (handModel) return;
  handModel = await loadTensorflowModel(
    require('../../assets/models/hand_landmarker.tflite'),
  );
}

export async function extractLandmarksFromVideo(videoPath: string): Promise<number[][][]> {
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
}

