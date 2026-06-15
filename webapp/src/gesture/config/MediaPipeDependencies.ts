export const MEDIAPIPE_TASKS_VISION_VERSION = '0.10.35';
export const MEDIAPIPE_TASKS_VISION_CDN_BASE = 'https://cdn.jsdelivr.net/npm';

export function buildMediaPipeTasksVisionUrl(assetPath: string): string {
  const normalizedAssetPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
  return (
    `${MEDIAPIPE_TASKS_VISION_CDN_BASE}/@mediapipe/tasks-vision@` +
    `${MEDIAPIPE_TASKS_VISION_VERSION}/${normalizedAssetPath}`
  );
}
