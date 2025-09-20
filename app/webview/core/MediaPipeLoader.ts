/**
 * MediaPipe Tasks Vision SDK loader
 * Handles dynamic loading and initialization of MediaPipe components
 */

// Types for MediaPipe components
export interface MediaPipeComponents {
  FilesetResolver: any;
  GestureRecognizer: any;
  wasmBase: string;
}

// Global references for MediaPipe (populated after loading)
declare global {
  interface Window {
    fileset_resolver?: { FilesetResolver: any };
    vision?: { GestureRecognizer: any };
  }
}

/**
 * Dynamically load MediaPipe Tasks Vision from CDN
 */
export async function loadTasksVision(): Promise<MediaPipeComponents> {
  // Resolve a pinned version from host config if provided
  async function resolvePinnedBase() {
    const pinnedVersion = (window as any).__mediapipeVersion;
    if (typeof pinnedVersion === 'string' && pinnedVersion.length) {
      return { base: 'https://cdn.jsdelivr.net/npm', version: pinnedVersion };
    }
    const cdns = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'];
    const controllers = cdns.map(() => new AbortController());
    const fetches = cdns.map((base, i) =>
      (async () => {
        try {
          const ac = controllers[i];
          const t = setTimeout(() => ac.abort(), 8000); // LOAD_TIMEOUT_MS
          const pkg = await fetch(base + '/@mediapipe/tasks-vision/package.json', {
            method: 'GET',
            signal: ac.signal,
            cache: 'no-store',
          }).finally(() => clearTimeout(t));
          if (pkg.ok) {
            const json = await pkg.json().catch(() => null);
            const v = json?.version;
            if (typeof v === 'string' && v.length) {
              controllers.forEach((c, j) => {
                if (j !== i) c.abort();
              });
              return { base, version: v };
            }
          }
        } catch (err) {
          if ((err as any)?.name !== 'AbortError') {
            console.warn('Fetch failed:', base, err);
          }
        }
        return null;
      })(),
    );
    const results = await Promise.all(fetches);
    return results.find(Boolean) || null;
  }

  function tryLoadScript(src: string, integrity?: string, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      if (integrity) {
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
      }
      if ((window as any).__visionBundleNonce) {
        s.nonce = (window as any).__visionBundleNonce;
      }
      s.async = true;
      const cleanup = () => {
        s.onload = s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
      };
      const to = setTimeout(() => {
        cleanup();
        console.warn(`Script load timeout after ${timeoutMs}ms: ${src}`);
        reject(new Error(`Script load timeout after ${timeoutMs}ms: ${src}`));
      }, timeoutMs);
      s.onload = () => {
        clearTimeout(to);
        cleanup();
        console.log(`Script loaded successfully: ${src}`);
        resolve(null);
      };
      s.onerror = (event) => {
        clearTimeout(to);
        cleanup();
        console.error(`Script failed to load: ${src}`, event);
        reject(new Error(`Script failed to load: ${src}`));
      };
      document.head.appendChild(s);
    });
  }

  const haveUMD = () =>
    window.fileset_resolver &&
    window.fileset_resolver.FilesetResolver &&
    window.vision &&
    window.vision.GestureRecognizer;

  // Compute preferred URLs
  const pinned = await resolvePinnedBase();
  const candidates = [];
  if (pinned) {
    candidates.push({
      umd: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/vision_bundle.js',
      esm: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/vision_bundle.mjs',
      wasm: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/wasm',
    });
  }
  // Generic latest as fallback
  candidates.push({
    umd: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js',
    esm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs',
    wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
  });
  candidates.push({
    umd: 'https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.js',
    esm: 'https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.mjs',
    wasm: 'https://unpkg.com/@mediapipe/tasks-vision/wasm',
  });

  let lastError = null;
  let attemptCount = 0;

  for (const c of candidates) {
    attemptCount++;
    try {
      console.log(`Attempting to load MediaPipe from ${c.umd} (attempt ${attemptCount}/${candidates.length})`);

      // Try UMD first
      if (!haveUMD()) {
        const sri =
          pinned && c.umd.includes(`@${pinned.version}/`) ? (window as any).__visionBundleSri : undefined;
        console.log(`Loading script from ${c.umd} with SRI: ${sri ? 'enabled' : 'disabled'}`);
        await tryLoadScript(c.umd, sri);
      }
      if (haveUMD()) {
        console.log('Successfully loaded MediaPipe via UMD');
        return {
          FilesetResolver: window.fileset_resolver!.FilesetResolver,
          GestureRecognizer: window.vision!.GestureRecognizer,
          wasmBase: c.wasm,
        };
      }

      // If UMD failed, try ESM as fallback
      if ((window as any).__allowCdnEsm === true) {
        try {
          console.log(`Attempting ESM import from ${c.esm}`);
          const mod = await import(/* @vite-ignore */ c.esm);
          if (mod?.FilesetResolver && mod?.GestureRecognizer) {
            console.log('Successfully loaded MediaPipe via ESM');
            return {
              FilesetResolver: mod.FilesetResolver,
              GestureRecognizer: mod.GestureRecognizer,
              wasmBase: c.wasm,
            };
          }
        } catch (e) {
          console.warn(`ESM import failed for ${c.esm}:`, e);
          lastError = e;
        }
      }
    } catch (e) {
      console.warn(`MediaPipe load attempt ${attemptCount} failed:`, e);
      lastError = e;
    }
  }

  // Provide more detailed error information
  const errorDetails = {
    attempts: attemptCount,
    candidates: candidates.map(c => ({ umd: c.umd, esm: c.esm })),
    lastError: lastError ? {
      message: lastError.message,
      name: lastError.name,
      stack: lastError.stack
    } : null,
    userAgent: navigator.userAgent,
    hasFetch: typeof fetch !== 'undefined',
    isSecureContext: window.isSecureContext,
  };

  console.error('All MediaPipe loading attempts failed:', errorDetails);

  throw new Error(
    'Tasks Vision globals not available after ' + attemptCount + ' attempts' +
      (lastError ? ': ' + (lastError.message || lastError) : ''),
  );
}