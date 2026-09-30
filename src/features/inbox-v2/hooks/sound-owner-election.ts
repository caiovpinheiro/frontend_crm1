/**
 * Eleição da aba dona de um aviso sonoro via Web Locks — lógica pura,
 * sem React, para `useInboxSoundOwner` (bip do inbox) e para o som do
 * trilho (Bwipo Chat / e-mail). Uma instância por aba e por `lockName`.
 *
 * - Só disputa com o áudio destravado (`isAudioRunning`): aba que não
 *   pode tocar não segura o lock.
 * - `acquire(true)` (aba ganhou foco) pede com `steal: true` — o som sai de
 *   onde o operador está; a aba roubada volta para a fila.
 * - Sem `locks` (navegador antigo) toda aba é dona.
 */

/** Subconjunto de `navigator.locks` que a eleição usa (fake nos testes). */
export interface SoundOwnerLocks {
  request(
    name: string,
    options: LockOptions,
    callback: (lock: Lock | null) => unknown,
  ): Promise<unknown>;
}

export interface SoundOwnerElectionOptions {
  lockName: string;
  /** `navigator.locks` (ou fake nos testes). `undefined` = toda aba é dona. */
  locks: SoundOwnerLocks | undefined;
  isAudioRunning: () => boolean;
}

export interface SoundOwnerElection {
  isOwner(): boolean;
  /** Entra na disputa; `steal` rouba de quem segura o lock. */
  acquire(steal: boolean): void;
  /** Solta o lock / sai da fila. Depois disto a instância está morta. */
  dispose(): void;
}

export function createSoundOwnerElection(
  options: SoundOwnerElectionOptions,
): SoundOwnerElection {
  const { lockName, locks, isAudioRunning } = options;
  let owner = false;

  if (!locks) {
    owner = true;
    return {
      isOwner: () => owner,
      acquire: () => undefined,
      dispose: () => {
        owner = false;
      },
    };
  }

  let disposed = false;
  // Cada pedido tem uma geração; resposta de pedido superado é ignorada.
  let generation = 0;
  let queued: AbortController | null = null;
  let release: (() => void) | null = null;

  const acquire = (steal: boolean): void => {
    if (disposed || owner || !isAudioRunning()) return;
    if (!steal && queued) return;
    queued?.abort();
    queued = null;
    const mine = ++generation;
    const abort = steal ? null : new AbortController();
    queued = abort;
    // `steal` não aceita `signal`: o pedido com roubo não fica na fila.
    const lockOptions: LockOptions = abort ? { signal: abort.signal } : { steal: true };
    locks
      .request(lockName, lockOptions, () => {
        if (disposed || mine !== generation) return undefined;
        queued = null;
        owner = true;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => {
        // AbortError: fila cancelada por nós, ou o lock foi roubado.
        if (disposed || mine !== generation) return;
        owner = false;
        release = null;
        queued = null;
        acquire(false);
      });
  };

  return {
    isOwner: () => owner,
    acquire,
    dispose: () => {
      disposed = true;
      queued?.abort();
      release?.();
      owner = false;
    },
  };
}
