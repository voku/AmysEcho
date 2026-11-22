import { createBoardHost } from "./board.js";
import { CONCEPTS } from "./concepts.js";
import { openIndexedDbBackend } from "./profiles/indexeddb-backend.js";
import { loadStartupView, runStartup } from "./startup.js";
import { getBootstrapState } from "./status.js";

const root = document.querySelector<HTMLElement>("#app");
if (root === null) {
  throw new Error("NG shell mount point is missing");
}

// `runStartup` shows a waiting line first, without anything to tap, and then
// mounts one board: what storage says this device should show, or the example
// board with a notice when storage fails or does not answer in time. A late
// answer never replaces a board that is in use. See src/startup.ts.
// The IndexedDB adapter behind `loadStartupView` has no automated test yet (card NG-14).
void runStartup(loadStartupView(() => openIndexedDbBackend(), CONCEPTS, (error) => {
  console.warn("Profile storage unavailable:", error);
}), createBoardHost(root));
root.dataset.bootstrap = getBootstrapState();

// The board always works without a service worker. Registration failure is
// not mistaken for successful offline installation.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error: unknown) => {
    console.warn("Offline installation unavailable:", error);
  });
}
