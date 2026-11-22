/**
 * Decides what the board shows when the app starts. No DOM in here, so it is
 * tested in Node against the in-memory backend.
 */
import { resolveBoard } from "./board-data.js";
import type { BoardEntry, BoardProblem, CatalogueConcept } from "./board-data.js";
import type { KeyValueBackend } from "./profiles/backend.js";
import { ProfileStore } from "./profiles/store.js";

export type StartupView =
  /**
   * The synthetic example board. "empty": storage works and holds no profile.
   * "unavailable": storage could not be opened or read; the board still works.
   */
  | { readonly kind: "demo"; readonly storage: "empty" | "unavailable" }
  /** The active profile's board. `entries` may be empty. */
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
 * first: they must not lead to the example board or a "new device" flow.
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
 * Opens the store on the given backend and resolves the view. Never rejects:
 * whatever goes wrong (no storage, unknown storage layout, a read error)
 * yields the example board marked "unavailable" and is handed to `report`.
 */
export async function loadStartupView(
  openBackend: () => Promise<KeyValueBackend>, catalogue: readonly CatalogueConcept[], report: (error: unknown) => void = () => undefined,
): Promise<StartupView> {
  try {
    const store = await ProfileStore.open(await openBackend());
    return await resolveStartupView(store, catalogue);
  } catch (error) {
    try {
      report(error);
    } catch {
      // Reporting is best effort.
    }
    return { kind: "demo", storage: "unavailable" };
  }
}

/**
 * How long the start waits for storage before it shows the example board
 * instead. A guess: no device has been measured yet (card NG-14).
 */
export const STARTUP_WAIT_MS = 1500;

export interface BoardHandle {
  /** True once a concept has been chosen on this board. */
  hasSelection(): boolean;
}

/** What `runStartup` needs from the page; `createBoardHost` in board.ts is the real one. */
export interface StartupHost {
  /** Shows the waiting state: nothing that can be tapped. */
  showLoading(): void;
  /** Replaces what is shown with the board for this view. */
  mount(view: StartupView): BoardHandle;
  /** Sets `data-<name>` on the board root. */
  setData(name: "startup" | "startupLate", value: string): void;
  /** Calls `callback` once after `milliseconds`; the returned function cancels that. */
  setTimer(callback: () => void, milliseconds: number): () => void;
}

const UNAVAILABLE: StartupView = { kind: "demo", storage: "unavailable" };

function stateOf(view: StartupView): string {
  return view.kind === "demo" ? `demo-${view.storage}` : view.kind;
}

/**
 * Brings the page from "waiting" to exactly one board.
 *
 * 1. Shows the waiting state (`data-startup="pending"`). No concept can be
 *    tapped before it is known whose board this is.
 * 2. When `view` settles within `waitMs`: mounts that view, once.
 *    `data-startup` becomes "demo-empty", "demo-unavailable", "profile",
 *    "damaged" or "no-active".
 * 3. When it does not: mounts the example board with the storage notice
 *    (`data-startup="demo-timeout"`), so there is a board even if storage
 *    never answers.
 * 4. When `view` settles after that: the board is replaced only if nothing
 *    has been chosen on it yet (`data-startup-late="replaced"`, and
 *    `data-startup` follows the view). A board in use stays
 *    (`data-startup-late="kept"`); the stored board shows at the next start.
 *
 * A rejected `view` counts as unavailable storage. If a view cannot be
 * rendered, the example board with the storage notice is shown instead
 * (`data-startup="failed"`). The returned promise resolves when `view` has
 * been dealt with; it never rejects.
 */
export function runStartup(view: Promise<StartupView>, host: StartupHost, waitMs: number = STARTUP_WAIT_MS): Promise<void> {
  let fallback: BoardHandle | null = null;
  let answered = false;

  const mountOrFallBack = (resolved: StartupView): void => {
    try {
      host.mount(resolved);
      host.setData("startup", stateOf(resolved));
    } catch {
      host.mount(UNAVAILABLE);
      host.setData("startup", "failed");
    }
  };

  host.showLoading();
  host.setData("startup", "pending");
  const cancelTimer = host.setTimer(() => {
    if (answered || fallback !== null) return;
    fallback = host.mount(UNAVAILABLE);
    host.setData("startup", "demo-timeout");
  }, waitMs);

  return view.catch((): StartupView => UNAVAILABLE).then((resolved) => {
    answered = true;
    cancelTimer();
    if (fallback === null) {
      mountOrFallBack(resolved);
    } else if (fallback.hasSelection()) {
      // Never swap a board under a child who is using it.
      host.setData("startupLate", "kept");
    } else {
      mountOrFallBack(resolved);
      host.setData("startupLate", "replaced");
    }
  }).catch(() => undefined);
}
