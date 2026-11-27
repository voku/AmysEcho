import { createApp } from "./app.js";
import { mountCaregiver } from "./caregiver.js";
import { CONCEPTS } from "./concepts.js";
import { openIndexedDbBackend } from "./profiles/indexeddb-backend.js";
import { getBootstrapState } from "./status.js";

const root = document.querySelector<HTMLElement>("#app");
const boardRegion = document.querySelector<HTMLElement>("#board-region");
if (root === null || boardRegion === null) {
  throw new Error("NG shell mount point is missing");
}

// The app writes into the board region only; see src/app.ts and src/startup.ts
// for the start-up sequence.
// The IndexedDB adapter is tested in Chromium (test/browser/indexeddb.test.mjs, card NG-14).
export const app = createApp(boardRegion, {
  openBackend: () => openIndexedDbBackend(),
  catalogue: CONCEPTS,
  report: (error) => console.warn("Profile storage unavailable:", error),
});
root.dataset.bootstrap = getBootstrapState();

// The caregiver area (src/caregiver.ts, docs/caregiver.md) is an addition: the
// board must work also when its mount points are missing or it fails to mount.
const caregiverRegion = document.querySelector<HTMLElement>("#caregiver-region");
const caregiverEntry = document.querySelector<HTMLElement>("#caregiver-entry");
try {
  if (caregiverRegion === null || caregiverEntry === null) throw new Error("mount point is missing");
  mountCaregiver({ app, boardRegion, caregiverRegion, entry: caregiverEntry, catalogue: CONCEPTS });
} catch (error) {
  console.warn("Caregiver area unavailable:", error);
}

// The board always works without a service worker. Registration failure is
// not mistaken for successful offline installation.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error: unknown) => {
    console.warn("Offline installation unavailable:", error);
  });
}
