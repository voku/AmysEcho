/**
 * The app controller: one per page. It owns the page's single `ProfileStore`,
 * runs the start-up sequence into the board region, and re-mounts the board on
 * request. The caregiver area (card NG-13) gets the store from here and calls
 * `refreshBoard()` after it changed a profile.
 */
import { createBoardHost } from "./board.js";
import type { CatalogueConcept } from "./board-data.js";
import type { KeyValueBackend } from "./profiles/backend.js";
import { ProfileStore } from "./profiles/store.js";
import { STARTUP_WAIT_MS, STORAGE_UNAVAILABLE, mountStartupView, mountView, resolveStartupView, runStartup } from "./startup.js";
import type { StartupHost, StartupView } from "./startup.js";

export interface AppOptions {
  /** Opens the storage backend. Called once. A rejection means: no storage on this page. */
  readonly openBackend: () => Promise<KeyValueBackend>;
  readonly catalogue: readonly CatalogueConcept[];
  /** Receives storage errors (open, read). They never reach the board as errors. */
  readonly report?: (error: unknown) => void;
  /** How long start-up, and each refresh, waits for storage; default `STARTUP_WAIT_MS`. */
  readonly waitMs?: number;
  /** Replaces the timer of the board host; for tests. */
  readonly setTimer?: StartupHost["setTimer"];
}

export interface App {
  /** Resolves when start-up has dealt with the answer of storage. Never rejects. Stays pending if storage never answers. */
  readonly started: Promise<void>;
  /**
   * The page's one store, or null when storage could not be opened. Every
   * call resolves to the same instance. Never rejects.
   */
  store(): Promise<ProfileStore | null>;
  /**
   * Reads the view again from the same store and mounts it, replacing the
   * board also when something was selected on it, and stopping running
   * speech. For the caregiver area, after it changed something. Calls are
   * carried out one after another in call order, each after start-up; the
   * last one decides what is shown. A refresh that storage does not answer
   * within the bound shows the examples (`data-startup="refresh-timeout"`)
   * and resolves, so it does not hold up later ones. Never rejects.
   */
  refreshBoard(): Promise<void>;
}

/**
 * Starts the app in `boardRegion`. Only that element is written to: its
 * children and its `data-startup`, `data-startup-late`, `data-board-fallback`
 * and `data-board-problems` attributes.
 */
export function createApp(boardRegion: HTMLElement, options: AppOptions): App {
  const report = (error: unknown): void => {
    try {
      options.report?.(error);
    } catch {
      // Reporting is best effort.
    }
  };
  const host: StartupHost = options.setTimer === undefined
    ? createBoardHost(boardRegion)
    : { ...createBoardHost(boardRegion), setTimer: options.setTimer };

  const opened: Promise<ProfileStore | null> = Promise.resolve()
    .then(() => options.openBackend())
    .then((backend) => ProfileStore.open(backend))
    .catch((error: unknown) => {
      report(error);
      return null;
    });

  const readView = async (): Promise<StartupView> => {
    const store = await opened;
    if (store === null) return STORAGE_UNAVAILABLE;
    try {
      return await resolveStartupView(store, options.catalogue);
    } catch (error) {
      report(error);
      return STORAGE_UNAVAILABLE;
    }
  };

  const waitMs = options.waitMs ?? STARTUP_WAIT_MS;
  const started = runStartup(readView(), host, waitMs);
  // Refreshes line up behind start-up, so a refresh never races the first mount.
  let queue: Promise<void> = started;

  /**
   * One refresh: whichever comes first decides, the answer of storage or the
   * bound. On the bound the examples replace the board with the
   * "refresh-timeout" sentence: what was on screen may be the board of a
   * profile that is no longer the active one, so it must not stay. The answer
   * of a refresh that ran into the bound is dropped, so it cannot replace a
   * board mounted since; the next refresh reads again.
   */
  const refreshOnce = (): Promise<void> => new Promise((resolve) => {
    let decided = false;
    let cancelTimer = (): void => undefined;
    const decide = (mount: () => void): void => {
      if (decided) return;
      decided = true;
      try {
        cancelTimer();
        host.setData("startupLate", null);
      } catch {
        // The board matters, not the marker.
      }
      mount();
      resolve();
    };
    try {
      cancelTimer = host.setTimer(() => decide(() => {
        mountView(host, { kind: "fallback", cause: "refresh-timeout" }, "refresh-timeout");
      }), waitMs);
    } catch {
      // Without a timer the refresh waits for storage.
    }
    void readView().then((view) => decide(() => {
      mountStartupView(host, view);
    }));
  });

  return {
    started,
    store: () => opened,
    refreshBoard() {
      queue = queue.then(refreshOnce).catch(() => undefined);
      return queue;
    },
  };
}
