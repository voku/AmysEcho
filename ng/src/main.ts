import { mountBoard } from "./board.js";
import { getBootstrapState } from "./status.js";

const root = document.querySelector<HTMLElement>("#app");
if (root === null) {
  throw new Error("NG shell mount point is missing");
}
mountBoard(root);
root.dataset.bootstrap = getBootstrapState();

// The board always works without a service worker. Registration failure is
// not mistaken for successful offline installation.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error: unknown) => {
    console.warn("Offline installation unavailable:", error);
  });
}
