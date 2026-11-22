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
