/**
 * The app controller: one per page. It owns the page's single `ProfileStore`,
 * runs the start-up sequence into the board region, and re-mounts the board on
 * request. The caregiver area (card NG-13) gets the store from here and calls
 * `refreshBoard()` after it changed a profile.
 */
import { createBoardHost, mountBoard } from "./board.js";
import type { CatalogueConcept } from "./board-data.js";
import type { CaptureBridge } from "./capture/capture.js";
import type { KeyValueBackend } from "./profiles/backend.js";
import { ProfileStore } from "./profiles/store.js";
import { listExamples } from "./recognition/examples.js";
import type { GestureExample } from "./recognition/matcher.js";
import { attachRecognise } from "./recognise/recognise.js";
import { listDemoClipIds, readDemoClip } from "./demo-clips.js";
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
  /** The camera for recognising gestures; default the capture module's bridge. For tests. */
  readonly capture?: CaptureBridge | null;
  /** Milliseconds from a steady clock for the board and the gesture view; for tests. */
  readonly now?: () => number;
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
  const boardHost = createBoardHost(boardRegion);
  /**
   * The examples of a view's profile that recognising can use: those of
   * concepts on its board. Read with the view (`readView`), so the gesture
   * control is there when the board is drawn and nothing moves later. A view
   * without an entry here gets no gesture control.
   */
  const gestureExamples = new WeakMap<object, readonly GestureExample[]>();
  /** Card NG-56: the concepts of a view's board that have a demo clip, in board order; read with the view, each clip only when it is played. */
  const demoClips = new WeakMap<object, { readonly ids: readonly string[]; readonly load: (conceptId: string) => Promise<string | null> }>();
  /** Ends the gesture view of the board on screen (its camera too); called before anything replaces that board. */
  let detachGesture = (): void => undefined;
  const leaveBoard = (): void => {
    const detach = detachGesture;
    detachGesture = () => undefined;
    try {
      detach();
    } catch (error) {
      report(error);
    }
  };
  const host: StartupHost = {
    ...boardHost,
    showLoading: () => {
      leaveBoard();
      boardHost.showLoading();
    },
    showFailure: () => {
      leaveBoard();
      boardHost.showFailure();
    },
    mount: (view) => {
      leaveBoard();
      const examples = gestureExamples.get(view) ?? [];
      const now = options.now === undefined ? {} : { now: options.now };
      if (examples.length === 0 || view.kind !== "profile") return mountBoard(boardRegion, view, now);
      let open = (): void => undefined;
      const board = mountBoard(boardRegion, view, { ...now, gesture: { onStart: () => open() } });
      try {
        const attached = attachRecognise({
          root: boardRegion, board, entries: view.entries, examples,
          // Card NG-54: the gesture view recognises continuously and stacks what it recognised.
          continuous: true,
          ...(demoClips.has(view) ? { demos: demoClips.get(view)! } : {}),
          ...(options.capture === undefined ? {} : { capture: options.capture }),
          ...now,
        });
        open = attached.open;
        detachGesture = attached.dispose;
        return board;
      } catch (error) {
        // Recognising is an addition: the board without it.
        report(error);
        return mountBoard(boardRegion, view, now);
      }
    },
    ...(options.setTimer === undefined ? {} : { setTimer: options.setTimer }),
  };

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
    let view: StartupView;
    try {
      view = await resolveStartupView(store, options.catalogue);
    } catch (error) {
      report(error);
      return STORAGE_UNAVAILABLE;
    }
    if (view.kind === "profile" && view.entries.length > 0) {
      // Read on every start and refresh, so examples taught or deleted in the caregiver area count when it closes.
      try {
        const onBoard = new Set(view.entries.map((entry) => entry.id));
        const listing = await listExamples(store, view.profileId);
        const usable = listing.examples
          .filter((example) => onBoard.has(example.record.conceptId))
          .map((example) => ({ conceptId: example.record.conceptId, sequence: example.sequence }));
        if (usable.length > 0) gestureExamples.set(view, usable);
      } catch (error) {
        // Without examples the board is the board: no gesture control.
        report(error);
      }
      try {
        const stored = new Set(await listDemoClipIds(store, view.profileId));
        const ids = view.entries.map((entry) => entry.id).filter((id) => stored.has(id));
        const profileId = view.profileId;
        if (ids.length > 0) {
          demoClips.set(view, {
            ids,
            load: async (conceptId) => {
              const clip = await readDemoClip(store, profileId, conceptId);
              return clip.state === "ok" ? clip.dataUrl : null;
            },
          });
        }
      } catch (error) {
        // Without clips the gesture view has no "Vormachen".
        report(error);
      }
    }
    return view;
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
