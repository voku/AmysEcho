// Deprecated facade during WebView migration; export a no-op hook for compatibility
export function useHybridFrameProcessor(): any {
  return () => null;
}
export { HYBRID_DEFAULTS } from './hybridDefaults';
