export const MEDIAPIPE_TASKS_VISION_VERSION = '0.10.35';
export const MEDIAPIPE_TASKS_VISION_CDN_BASE = 'https://cdn.jsdelivr.net/npm';

export function buildMediaPipeTasksVisionUrl(assetPath: string): string {
  const normalizedAssetPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
  const version =
    typeof window !== 'undefined' && typeof (window as any).__mediapipeVersion === 'string' && (window as any).__mediapipeVersion.length
      ? (window as any).__mediapipeVersion
      : MEDIAPIPE_TASKS_VISION_VERSION;
  return (
    `${MEDIAPIPE_TASKS_VISION_CDN_BASE}/@mediapipe/tasks-vision@` +
    `${version}/${normalizedAssetPath}`
  );
}
