import { describe, expect, it } from "vitest";

import { createSoundOwnerElection, type SoundOwnerLocks } from "../sound-owner-election";

type Entry = {
  name: string;
  cb: (lock: Lock | null) => unknown;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

/** Emulação mínima de `navigator.locks` (exclusivo, fila FIFO, steal, signal). */
class FakeLocks implements SoundOwnerLocks {
  private readonly held = new Map<string, Entry>();
  private readonly queue: Entry[] = [];

  holder(name: string): Entry | undefined {
    return this.held.get(name);
  }

  request(name: string, options: LockOptions, cb: (lock: Lock | null) => unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const entry: Entry = { name, cb, resolve, reject };
      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          const i = this.queue.indexOf(entry);
          if (i >= 0) this.queue.splice(i, 1);
          reject(new DOMException("aborted", "AbortError"));
        });
      }
      if (options.steal) {
        const current = this.held.get(name);
        if (current) {
          this.held.delete(name);
          current.reject(new DOMException("stolen", "AbortError"));
        }
        this.grant(entry);
        return;
      }
      if (!this.held.has(name)) this.grant(entry);
      else this.queue.push(entry);
    });
  }

  private grant(entry: Entry) {
    this.held.set(entry.name, entry);
    Promise.resolve(entry.cb(null)).then(
      (v) => this.release(entry, () => entry.resolve(v)),
      (e) => this.release(entry, () => entry.reject(e)),
    );
  }

  private release(entry: Entry, settle: () => void) {
    if (this.held.get(entry.name) === entry) {
      this.held.delete(entry.name);
      const next = this.queue.find((q) => q.name === entry.name);
      if (next) {
        this.queue.splice(this.queue.indexOf(next), 1);
        this.grant(next);
      }
    }
    settle();
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const LOCK = "nav-sound:org:user";

function tab(locks: SoundOwnerLocks | undefined, audioRunning = true) {
  return createSoundOwnerElection({
    lockName: LOCK,
    locks,
    isAudioRunning: () => audioRunning,
  });
}

describe("sound owner election (MA-6)", () => {
  it("sem Web Locks toda aba é dona", () => {
    const a = tab(undefined);
    expect(a.isOwner()).toBe(true);
    a.dispose();
    expect(a.isOwner()).toBe(false);
  });

  it("só uma aba vira dona; a outra espera na fila", async () => {
    const locks = new FakeLocks();
    const a = tab(locks);
    const b = tab(locks);
    a.acquire(false);
    b.acquire(false);
    await flush();
    expect(a.isOwner()).toBe(true);
    expect(b.isOwner()).toBe(false);

    // A fecha → B assume.
    a.dispose();
    await flush();
    expect(a.isOwner()).toBe(false);
    expect(b.isOwner()).toBe(true);
    b.dispose();
  });

  it("a aba que ganha foco rouba o lock; a roubada volta para a fila", async () => {
    const locks = new FakeLocks();
    const a = tab(locks);
    const b = tab(locks);
    a.acquire(false);
    b.acquire(false);
    await flush();
    expect(a.isOwner()).toBe(true);

    b.acquire(true); // foco em B
    await flush();
    expect(b.isOwner()).toBe(true);
    expect(a.isOwner()).toBe(false);

    // B fecha → A (que voltou para a fila) reassume.
    b.dispose();
    await flush();
    expect(a.isOwner()).toBe(true);
    a.dispose();
  });

  it("aba com áudio travado não disputa", async () => {
    const locks = new FakeLocks();
    const locked = tab(locks, false);
    locked.acquire(true);
    await flush();
    expect(locked.isOwner()).toBe(false);
    expect(locks.holder(LOCK)).toBeUndefined();

    const running = tab(locks, true);
    running.acquire(false);
    await flush();
    expect(running.isOwner()).toBe(true);
    locked.dispose();
    running.dispose();
  });

  it("depois de dispose não responde a pedidos antigos", async () => {
    const locks = new FakeLocks();
    const a = tab(locks);
    a.acquire(false);
    a.dispose();
    await flush();
    expect(a.isOwner()).toBe(false);
    expect(locks.holder(LOCK)).toBeUndefined();
  });
});
