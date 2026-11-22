import { mountBoard } from "./board.js";
import { CONCEPTS } from "./concepts.js";
import { openIndexedDbBackend } from "./profiles/indexeddb-backend.js";
import { loadStartupView } from "./startup.js";
import { getBootstrapState } from "./status.js";

const root = document.querySelector<HTMLElement>("#app");
if (root === null) {
  throw new Error("NG shell mount point is missing");
}
const mountPoint = root;

// The example board is mounted first and without touching storage, so there is
// a working board at once and whatever storage does later.
mountBoard(mountPoint, { kind: "demo", storage: "empty" });
mountPoint.dataset.bootstrap = getBootstrapState();
mountPoint.dataset.startup = "pending";

// Then storage is asked what this device should show. `loadStartupView` does
// not reject; a storage failure comes back as the example board with a notice.
// The IndexedDB adapter behind it has no automated test yet (card NG-14).
void loadStartupView(() => openIndexedDbBackend(), CONCEPTS, (error) => {
  console.warn("Profile storage unavailable:", error);
}).then((view) => {
  try {
    if (view.kind !== "demo" || view.storage === "unavailable") mountBoard(mountPoint, view);
    mountPoint.dataset.startup = view.kind === "demo" ? `demo-${view.storage}` : view.kind;
  } catch (error) {
    // mountBoard swaps the content in as its last step, so the board mounted above is still there.
    mountPoint.dataset.startup = "failed";
    console.warn("Board could not be rendered from storage:", error);
  }
});

// The board always works without a service worker. Registration failure is
// not mistaken for successful offline installation.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error: unknown) => {
    console.warn("Offline installation unavailable:", error);
  });
}
