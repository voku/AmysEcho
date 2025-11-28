/**
 * MediaPipe Tasks Vision SDK loader
 * Handles dynamic loading and initialization of MediaPipe components
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * Dynamically load MediaPipe Tasks Vision from CDN
 */
export function loadTasksVision() {
    return __awaiter(this, void 0, void 0, function* () {
        // Resolve a pinned version from host config if provided
        function resolvePinnedBase() {
            return __awaiter(this, void 0, void 0, function* () {
                const pinnedVersion = window.__mediapipeVersion;
                if (typeof pinnedVersion === 'string' && pinnedVersion.length) {
                    return { base: 'https://cdn.jsdelivr.net/npm', version: pinnedVersion };
                }
                const cdns = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'];
                const controllers = cdns.map(() => new AbortController());
                const fetches = cdns.map((base, i) => (() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const ac = controllers[i];
                        const t = setTimeout(() => ac.abort(), 8000); // LOAD_TIMEOUT_MS
                        const pkg = yield fetch(base + '/@mediapipe/tasks-vision/package.json', {
                            method: 'GET',
                            signal: ac.signal,
                            cache: 'no-store',
                        }).finally(() => clearTimeout(t));
                        if (pkg.ok) {
                            const json = yield pkg.json().catch(() => null);
                            const v = json === null || json === void 0 ? void 0 : json.version;
                            if (typeof v === 'string' && v.length) {
                                controllers.forEach((c, j) => {
                                    if (j !== i)
                                        c.abort();
                                });
                                return { base, version: v };
                            }
                        }
                    }
                    catch (err) {
                        if ((err === null || err === void 0 ? void 0 : err.name) !== 'AbortError') {
                            console.warn('Fetch failed:', base, err);
                        }
                    }
                    return null;
                }))());
                const results = yield Promise.all(fetches);
                return results.find(Boolean) || null;
            });
        }
        function tryLoadScript(src, integrity, timeoutMs = 8000) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                if (integrity) {
                    s.integrity = integrity;
                    s.crossOrigin = 'anonymous';
                }
                if (window.__visionBundleNonce) {
                    s.nonce = window.__visionBundleNonce;
                }
                s.async = true;
                const cleanup = () => {
                    s.onload = s.onerror = null;
                    if (s.parentNode)
                        s.parentNode.removeChild(s);
                };
                const to = setTimeout(() => {
                    cleanup();
                    reject(new Error('Script load timeout: ' + src));
                }, timeoutMs);
                s.onload = () => {
                    clearTimeout(to);
                    cleanup();
                    resolve(null);
                };
                s.onerror = () => {
                    clearTimeout(to);
                    cleanup();
                    reject(new Error('Script failed to load: ' + src));
                };
                document.head.appendChild(s);
            });
        }
        const haveUMD = () => window.fileset_resolver &&
            window.fileset_resolver.FilesetResolver &&
            window.vision &&
            window.vision.GestureRecognizer;
        // Compute preferred URLs
        const pinned = yield resolvePinnedBase();
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
        for (const c of candidates) {
            try {
                // Try UMD first
                if (!haveUMD()) {
                    const sri = pinned && c.umd.includes(`@${pinned.version}/`) ? window.__visionBundleSri : undefined;
                    yield tryLoadScript(c.umd, sri);
                }
                if (haveUMD()) {
                    return {
                        FilesetResolver: window.fileset_resolver.FilesetResolver,
                        GestureRecognizer: window.vision.GestureRecognizer,
                        wasmBase: c.wasm,
                    };
                }
                // ESM loading is disabled in this environment to avoid dynamic imports
                // which cause bundling failures on the Expo build service. The UMD path
                // above remains the primary loading mechanism.
                // If ESM loading is required in the future, implement a script-tag based
                // loader here that does not rely on `import()`.
            }
            catch (e) {
                lastError = e;
            }
        }
        throw new Error('Tasks Vision globals not available' +
            (lastError ? ': ' + (lastError.message || lastError) : ''));
    });
}
