import { createApp } from "./app.js";
import { CONCEPTS } from "./concepts.js";
import { openIndexedDbBackend } from "./profiles/indexeddb-backend.js";
import { getBootstrapState } from "./status.js";

const root = document.querySelector<HTMLElement>("#app");
const boardRegion = document.querySelector<HTMLElement>("#board-region");
if (root === null || boardRegion === null) {
  throw new Error("NG shell mount point is missing");
}

// The app writes into the board region only; see src/app.ts and src/startup.ts
// for the start-up sequence. The caregiver area (card NG-13) will get `app`.
// The IndexedDB adapter has no automated test yet (card NG-14).
export const app = createApp(boardRegion, {
  openBackend: () => openIndexedDbBackend(),
  catalogue: CONCEPTS,
  report: (error) => console.warn("Profile storage unavailable:", error),
});
root.dataset.bootstrap = getBootstrapState();

// The board always works without a service worker. Registration failure is
// not mistaken for successful offline installation.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error: unknown) => {
    console.warn("Offline installation unavailable:", error);
  });
}
