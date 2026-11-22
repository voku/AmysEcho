/**
 * Decides what the board shows when the app starts. No DOM in here, so it is
 * tested in Node against the in-memory backend.
 */
import { resolveBoard } from "./board-data.js";
import type { BoardEntry, BoardProblem, CatalogueConcept } from "./board-data.js";
import type { ProfileStore } from "./profiles/store.js";

export type StartupView =
  /**
   * The synthetic example board. "empty": storage works and holds no profile.
   * "unavailable": storage could not be opened or read; the board still works.
   */
  | { readonly kind: "demo"; readonly storage: "empty" | "unavailable" }
  /** The active profile's board. `entries` may be empty. `displayName` is for the caregiver area; the board does not show it. */
  | {
    readonly kind: "profile";
    readonly profileId: string;
    readonly displayName: string;
    readonly entries: readonly BoardEntry[];
    readonly problems: readonly BoardProblem[];
  }
  /** No readable active profile, and `count` stored profiles cannot be read. Never treated as a new device. */
  | { readonly kind: "damaged"; readonly count: number }
  /** Readable profiles exist, none is active. Choosing one is the caregiver area's job. */
  | { readonly kind: "no-active"; readonly profiles: readonly { readonly id: string; readonly displayName: string }[] };

/**
 * `store.getActive()` is null both when no profile is active and when the
 * active one is unreadable; the damage shows in `store.list()` only. So
 * without an active profile the listing decides, and damaged entries come
 * first: they must not be taken for a new device. An active-profile pointer
 * that is not an id, or names a profile that is not stored, counts as none.
 */
export async function resolveStartupView(store: ProfileStore, catalogue: readonly CatalogueConcept[]): Promise<StartupView> {
  const activeId = await store.getActive();
  if (activeId !== null) {
    const board = await resolveBoard(store, activeId, catalogue);
    return { kind: "profile", profileId: activeId, displayName: board.profile.displayName, entries: board.entries, problems: board.problems };
  }
  const listing = await store.list();
  if (listing.damaged.length > 0) return { kind: "damaged", count: listing.damaged.length };
  if (listing.profiles.length === 0) return { kind: "demo", storage: "empty" };
  return { kind: "no-active", profiles: listing.profiles.map((profile) => ({ id: profile.id, displayName: profile.displayName })) };
}

/**
 * Why the board shows the example concepts although this is not simply a
 * device without profiles.
 *
 * From storage: "storage-unavailable" (cannot be opened or read), "damaged"
 * (stored profiles cannot be read), "no-active" (none chosen),
 * "empty-profile" (no concepts chosen), "unloadable-profile" (none of the
 * chosen concepts could be loaded).
 * From the start-up sequence: "timeout" (storage has not answered yet),
 * "timeout-kept" (it answered late, the child was already using the examples,
 * the own board comes with the next page load), "render-failed" (the own
 * board could not be drawn).
 */
export type FallbackCause =
  | "storage-unavailable" | "damaged" | "no-active" | "empty-profile" | "unloadable-profile"
  | "timeout" | "timeout-kept" | "render-failed";

/** What a board can be asked to show: a view from storage, or the examples for a start-up cause. */
export type BoardView = StartupView | { readonly kind: "fallback"; readonly cause: "timeout" | "timeout-kept" | "render-failed" };

/**
 * A board problem that changes what the child sees. A custom concept under
 * an id the catalogue uses too is shown as stored, so it does not count.
 */
export function isTroubled(problems: readonly BoardProblem[]): boolean {
  return problems.some((problem) => problem.kind !== "custom-shadows-catalogue");
}

/**
 * Null when the view shows its own content: the profile's concepts, or the
 * examples on a device without profiles. Otherwise the reason the examples
 * stand in.
 */
export function fallbackCause(view: BoardView): FallbackCause | null {
  switch (view.kind) {
    case "demo": return view.storage === "unavailable" ? "storage-unavailable" : null;
    case "damaged": return "damaged";
    case "no-active": return "no-active";
    case "fallback": return view.cause;
    case "profile":
      if (view.entries.length > 0) return null;
      return isTroubled(view.problems) ? "unloadable-profile" : "empty-profile";
  }
}

/** True when the view is drawn as the example concepts. */
export function showsExamples(view: BoardView): boolean {
  return view.kind !== "profile" || view.entries.length === 0;
}

/**
 * How long the start waits for storage before it shows the example board
 * instead. A guess: no device has been measured yet (card NG-14).
 */
export const STARTUP_WAIT_MS = 1500;

export interface BoardHandle {
  /** True once a concept has been chosen on this board. */
  hasSelection(): boolean;
  /**
   * On a board of examples: changes the line that says why examples are
   * shown (null: the plain examples line) without touching the buttons or the
   * selection. Does nothing on a profile's own board.
   */
  setFallback(cause: FallbackCause | null): void;
}

/** What the start-up sequence needs from the page; `createBoardHost` in board.ts is the real one. */
export interface StartupHost {
  /** Shows the waiting state: nothing that can be tapped. */
  showLoading(): void;
  /** Replaces what is shown with the board for this view. */
  mount(view: BoardView): BoardHandle;
  /** Last resort when no board can be drawn: a plain line, nothing to tap. */
  showFailure(): void;
  /** Sets `data-<name>` on the board region; null removes it. */
  setData(name: "startup" | "startupLate", value: string | null): void;
  /** Calls `callback` once after `milliseconds`; the returned function cancels that. */
  setTimer(callback: () => void, milliseconds: number): () => void;
}

export const STORAGE_UNAVAILABLE: StartupView = { kind: "demo", storage: "unavailable" };

function stateOf(view: StartupView): string {
  return view.kind === "demo" ? `demo-${view.storage}` : view.kind;
}

function quietly(action: () => void): void {
  try {
    action();
  } catch {
    // The page keeps what it shows.
  }
}

/**
 * Mounts `view` and names the result in `data-startup` (`state`). Never
 * throws. If the view cannot be drawn, the examples are mounted with the
 * "render-failed" line (`data-startup="failed"`); if not even those can be,
 * the host's failure line is shown (`data-startup="unrenderable"`) and the
 * result is null.
 */
export function mountView(host: StartupHost, view: BoardView, state: string): BoardHandle | null {
  try {
    const handle = host.mount(view);
    quietly(() => host.setData("startup", state));
    return handle;
  } catch {
    try {
      const handle = host.mount({ kind: "fallback", cause: "render-failed" });
      quietly(() => host.setData("startup", "failed"));
      return handle;
    } catch {
      quietly(() => host.showFailure());
      quietly(() => host.setData("startup", "unrenderable"));
      return null;
    }
  }
}

/** Mounts a view that came from storage; `data-startup` is named after it. */
export function mountStartupView(host: StartupHost, view: StartupView): BoardHandle | null {
  return mountView(host, view, stateOf(view));
}

/**
 * Brings the page from "waiting" to exactly one board.
 *
 * 1. Shows the waiting state (`data-startup="pending"`). No concept can be
 *    tapped before it is known whose board this is.
 * 2. When `view` settles within `waitMs`: mounts that view, once.
 *    `data-startup` becomes "demo-empty", "demo-unavailable", "profile",
 *    "damaged" or "no-active".
 * 3. When it does not: mounts the examples with the "timeout" line
 *    (`data-startup="demo-timeout"`), so there is a board even if storage
 *    never answers.
 * 4. When `view` settles after that, `data-startup` stays "demo-timeout" only
 *    in the "kept" case and otherwise follows the view:
 *    - the view shows examples too: the buttons stay, only the line above
 *      them changes (`data-startup-late="same-board"`). No re-mount, a
 *      selection is kept;
 *    - the view is a profile's own board and nothing has been chosen yet: the
 *      board is replaced (`data-startup-late="replaced"`);
 *    - the view is a profile's own board and the child has already chosen
 *      something: the examples stay and say that the own board comes with a
 *      reload (`data-startup-late="kept"`). Never swap a board under a child
 *      who is using it.
 *
 * A rejected `view` counts as unavailable storage. Nothing here throws, also
 * when the host does; see `mountView` for a view that cannot be drawn. The
 * returned promise resolves when `view` has been dealt with; it never rejects.
 */
export function runStartup(view: Promise<StartupView>, host: StartupHost, waitMs: number = STARTUP_WAIT_MS): Promise<void> {
  let timedOut = false;
  let fallback: BoardHandle | null = null;
  let answered = false;

  // If these throw, the static line of the page stays until a board is mounted.
  quietly(() => host.showLoading());
  quietly(() => host.setData("startup", "pending"));
  let cancelTimer = (): void => undefined;
  quietly(() => {
    cancelTimer = host.setTimer(() => {
      if (answered || timedOut) return;
      timedOut = true;
      fallback = mountView(host, { kind: "fallback", cause: "timeout" }, "demo-timeout");
    }, waitMs);
  });

  return view.catch((): StartupView => STORAGE_UNAVAILABLE).then((resolved) => {
    answered = true;
    quietly(cancelTimer);
    const shown = fallback as BoardHandle | null;
    if (!timedOut) {
      mountStartupView(host, resolved);
    } else if (shown !== null && showsExamples(resolved)) {
      shown.setFallback(fallbackCause(resolved));
      host.setData("startup", stateOf(resolved));
      host.setData("startupLate", "same-board");
    } else if (shown !== null && shown.hasSelection()) {
      shown.setFallback("timeout-kept");
      host.setData("startupLate", "kept");
    } else {
      mountStartupView(host, resolved);
      host.setData("startupLate", "replaced");
    }
  }).catch(() => undefined);
}
