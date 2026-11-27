import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

// Include every local SVG/style/manifest/service-worker asset in production output.
await cp(
  new URL("../public/", import.meta.url),
  new URL("../dist/", import.meta.url),
  { recursive: true },
);

/*
 * The hand tracker (card NG-3, docs/capture.md). Nothing of it is committed:
 * the runtime files come from the exact devDependency @mediapipe/tasks-vision
 * in node_modules, the two models from Google's model storage at a pinned
 * URL. Every file is checked against the sha256 below; a mismatch fails the
 * build. The models are kept in node_modules/.cache/ so that a rebuild does
 * not download them again. The browser never contacts any of these hosts:
 * it gets the files from the app's own origin (dist/vendor/mediapipe/<version>-<digest>/).
 *
 * Whoever changes the version repeats the network check of the decision
 * record (docs/tracker-decision.md, "Metrics upload in 1.x") and the host
 * check of test/capture.test.mjs.
 */
const PACKAGE = "@mediapipe/tasks-vision";
const VERSION = "0.10.35";
const PACKAGE_FILES = [
  { from: "vision_bundle.mjs", path: "vision_bundle.mjs", sha256: "55d7ab624fbb70dcc5adc4ae6d7ea9cfcb569139d3dbfbf2b1deafcb966bc0fe" },
  { from: "wasm/vision_wasm_module_internal.js", path: "wasm/vision_wasm_module_internal.js", sha256: "1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44" },
  { from: "wasm/vision_wasm_module_internal.wasm", path: "wasm/vision_wasm_module_internal.wasm", sha256: "617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756" },
];
const MODELS = [
  {
    path: "models/hand_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    sha256: "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
  },
  {
    path: "models/pose_landmarker_lite.task",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    sha256: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
  },
];

const packageDir = new URL(`../node_modules/${PACKAGE}/`, import.meta.url);
const modelCache = new URL("../node_modules/.cache/amysecho-tracker-models/", import.meta.url);
const vendor = new URL("../dist/vendor/mediapipe/", import.meta.url);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function checked(bytes, expected, what) {
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`assemble: ${what} has sha256 ${actual}, expected ${expected}`);
  return bytes;
}

async function model({ url, sha256: expected, path }) {
  const cached = new URL(expected, modelCache);
  try {
    return checked(await readFile(cached), expected, `cached ${path}`);
  } catch {
    // Not cached yet, or damaged: download again.
  }
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`assemble: cannot download ${url} (${error.cause?.code ?? error.message}). The board does not need it, but the build ships the tracker.`);
  }
  if (!response.ok) throw new Error(`assemble: ${url} answered HTTP ${response.status}`);
  const bytes = checked(Buffer.from(await response.arrayBuffer()), expected, url);
  await mkdir(modelCache, { recursive: true });
  const partial = new URL(`${expected}.partial`, modelCache);
  await writeFile(partial, bytes);
  await rename(partial, cached);
  return bytes;
}

const installed = JSON.parse(await readFile(new URL("package.json", packageDir), "utf8"));
if (installed.version !== VERSION) {
  throw new Error(`assemble: ${PACKAGE} ${installed.version} is installed, the app is pinned to ${VERSION}; run npm ci --ignore-scripts`);
}

const contents = [];
for (const file of PACKAGE_FILES) {
  contents.push({ path: file.path, sha256: file.sha256, bytes: checked(await readFile(new URL(file.from, packageDir)), file.sha256, `${PACKAGE}/${file.from}`) });
}
for (const entry of MODELS) contents.push({ path: entry.path, sha256: entry.sha256, bytes: await model(entry) });

// The files live in a directory named after their contents, and the cache that
// holds them carries the same name (TRACKER_CACHE_PREFIX + directory). When any
// file changes, every URL changes: an old cache can never answer for a new
// file, and the service worker answers a tracker request only from the cache
// named in its path (public/sw.js).
const digest = sha256(contents.map((file) => `${file.path} ${file.sha256}`).join("\n")).slice(0, 16);
const directory = `${VERSION}-${digest}`;
await rm(vendor, { recursive: true, force: true });
const files = [];
for (const file of contents) {
  const target = new URL(`${directory}/${file.path}`, vendor);
  await mkdir(new URL("./", target), { recursive: true });
  await writeFile(target, file.bytes);
  files.push({ path: `${directory}/${file.path}`, sha256: file.sha256, bytes: file.bytes.byteLength });
}

// The package ships no licence file of its own; its package.json says Apache-2.0.
// The licence text is taken from the pinned TypeScript devDependency, which is
// under the same licence, and checked to be that text.
const licence = await readFile(new URL("../node_modules/typescript/LICENSE.txt", import.meta.url), "utf8");
if (!/^Apache License\s+Version 2\.0, January 2004/.test(licence) || !licence.includes("END OF TERMS AND CONDITIONS")) {
  throw new Error("assemble: node_modules/typescript/LICENSE.txt is not the Apache License 2.0 text");
}
await writeFile(new URL("LICENSE.txt", vendor), licence);
await writeFile(new URL("NOTICE.txt", vendor), [
  `${PACKAGE} ${VERSION} (vision_bundle.mjs, wasm/vision_wasm_module_internal.js, wasm/vision_wasm_module_internal.wasm)`,
  "Copyright Google LLC. Licensed under the Apache License, Version 2.0 (LICENSE.txt), as stated in the package's package.json.",
  "",
  "models/hand_landmarker.task (float16, version 1): MediaPipe Hand Landmarker, model card \"Hand Tracking (Lite/Full)\", Apache License 2.0.",
  "models/pose_landmarker_lite.task (float16, version 1): MediaPipe Pose Landmarker (lite), model card \"BlazePose GHUM 3D\", Apache License 2.0.",
  "",
  "Unmodified copies. Fetched by scripts/assemble.mjs and checked against pinned sha256 sums; see docs/capture.md.",
  "",
].join("\n"));

await writeFile(new URL("manifest.json", vendor), `${JSON.stringify({
  package: PACKAGE,
  version: VERSION,
  directory,
  cache: `amysecho-tracker-${directory}`,
  files,
}, null, 2)}\n`);

/*
 * The board's cache name carries a digest of every pre-cached file, so any
 * change to a shipped asset gives the service worker new bytes, and an
 * installed app picks up the whole new set instead of mixing old and new
 * files (card NG-39). The hand-set part of the name stays in public/sw.js.
 */
const { appAssets, precacheList } = await import("./offline-smoke.mjs");
const workerUrl = new URL("../dist/sw.js", import.meta.url);
/*
 * The pre-cache list is generated from the built app (card NG-14), so a new
 * module or picture cannot be forgotten in it. public/sw.js leaves it empty.
 */
const EMPTY_LIST = /^const ASSETS = \[\];$/m;
const template = await readFile(workerUrl, "utf8");
if (!EMPTY_LIST.test(template)) throw new Error("dist/sw.js: the empty `const ASSETS = [];` line to fill is not found");
const assets = (await appAssets(new URL("../dist/", import.meta.url))).map((path) => JSON.stringify(`./${path}`));
const worker = template.replace(EMPTY_LIST, `const ASSETS = [\n  ${assets.join(", ")}\n];`);
const NAME = /const CACHE_NAME = CACHE_PREFIX \+ "([^"]+)";/;
const base = NAME.exec(worker)?.[1];
if (base === undefined) throw new Error("dist/sw.js: CACHE_NAME not found");
const assetHash = createHash("sha256");
for (const asset of [...await precacheList(worker)].sort()) {
  const file = new URL(asset.replace(/^\.\//, "").replace(/^$/, "index.html").replace(/\/$/, "/index.html"), new URL("../dist/", import.meta.url));
  assetHash.update(`${asset}\0`).update(await readFile(file)).update("\0");
}
await writeFile(workerUrl, worker.replace(NAME, `const CACHE_NAME = CACHE_PREFIX + "${base}-${assetHash.digest("hex").slice(0, 12)}";`));
