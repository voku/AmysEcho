/**
 * In-memory `KeyValueBackend`. Used by the automated tests; nothing is kept
 * after the page or process ends, so it is not a storage choice for families.
 */
import { cloneJson } from "./backend.js";
import type { KeyValueBackend, WriteBatch } from "./backend.js";

export class InjectedWriteError extends Error {}

export class MemoryBackend implements KeyValueBackend {
  #entries = new Map<string, unknown>();
  #writesUntilFailure = 0;

  async get(key: string): Promise<unknown | undefined> {
    return this.#entries.has(key) ? cloneJson(this.#entries.get(key)) : undefined;
  }

  async keys(prefix: string): Promise<string[]> {
    return [...this.#entries.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async write(batch: WriteBatch): Promise<void> {
    const deletes = batch.delete ?? [];
    const sets = Object.entries(batch.set ?? {});
    const failing = this.#writesUntilFailure > 0 && (this.#writesUntilFailure -= 1) === 0;
    // Work on a copy and swap it in at the end: that swap is the commit.
    const next = new Map(this.#entries);
    let applied = 0;
    const step = (): void => {
      if (failing && applied === Math.floor((deletes.length + sets.length) / 2)) {
        throw new InjectedWriteError("injected write failure");
      }
      applied += 1;
    };
    for (const key of deletes) {
      step();
      next.delete(key);
    }
    for (const [key, value] of sets) {
      step();
      next.set(key, cloneJson(value));
    }
    if (failing) throw new InjectedWriteError("injected write failure");
    this.#entries = next;
  }

  /**
   * Test hook: the `nth` write from now (1 = the next one) rejects with
   * `InjectedWriteError` after half of its batch has been processed.
   */
  failWrite(nth = 1): void {
    this.#writesUntilFailure = nth;
  }

  /** Test hook: a deep copy of everything stored, keys sorted. */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries([...this.#entries.keys()].sort().map((key) => [key, cloneJson(this.#entries.get(key))]));
  }
}
