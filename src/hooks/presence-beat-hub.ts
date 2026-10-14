"use client";

import type { EntityViewer } from "./presence-sync";

/**
 * Elo entre o tique de presença (`presence-ticker.ts`, só a aba líder
 * chama a API) e o "quem está vendo" (`presence-sync.ts`) quando o
 * backend tem `POST /api/presence/beat`: UMA chamada por navegador por
 * ciclo leva `lastInteractionAt` e a união das entidades abertas em todas
 * as abas, e devolve `viewers` por entidade — no lugar do ping e do
 * heartbeat por entidade.
 *
 *  - `presence-sync` é a FONTE das entidades (as seguidoras já informam as
 *    suas à líder pelo `state` do `tab-coordinator`) e entrega os viewers
 *    (localmente e às seguidoras pelo canal);
 *  - o tique é o MOTOR, em cadência estrita: mudar a lista de entidades
 *    não antecipa nada (a próxima batida leva a lista nova);
 *  - 404 no beat (backend antigo): `markUnsupported` — o tique volta ao
 *    ping e o `presence-sync` ao heartbeat por entidade, e o navegador
 *    não tenta o beat por `PRESENCE_BEAT_RETRY_MS`.
 */

export type PresenceEntity = { type: string; id: string };
/** `viewers` do beat: chave `"<type>:<id>"`. */
export type BeatViewers = Record<string, EntityViewer[]>;

export interface PresenceBeatSource {
  /** Chaves `type|id` a reportar (líder: união de todas as abas). */
  keys: () => string[];
  /** Viewers de uma entidade (chave `type|id`). */
  deliver: (key: string, viewers: EntityViewer[]) => void;
}

export interface PresenceBeatHubEnv {
  readUnsupportedAt?: () => number | null;
  writeUnsupportedAt?: (at: number) => void;
  now?: () => number;
}

/** localStorage: instante (ms) do último 404 do beat neste navegador. */
export const PRESENCE_BEAT_UNSUPPORTED_KEY = "crm:presence-beat-unsupported-at";
/** Depois disto o navegador tenta o beat de novo (backend pode ter sido atualizado). */
export const PRESENCE_BEAT_RETRY_MS = 6 * 60 * 60_000;
/** Contrato do beat (be #194): tipos aceitos, formato do id e teto por batida. */
export const PRESENCE_BEAT_TYPES: ReadonlySet<string> = new Set(["deal", "conversation"]);
export const PRESENCE_BEAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const PRESENCE_BEAT_MAX_ENTITIES = 20;

export function entityFromKey(key: string): PresenceEntity {
  const i = key.indexOf("|");
  return { type: key.slice(0, i), id: key.slice(i + 1) };
}

/** `"deal:abc"` (beat) → `"deal|abc"` (presence-sync). */
export function beatKeyToPresenceKey(key: string): string | null {
  const i = key.indexOf(":");
  if (i <= 0 || i === key.length - 1) return null;
  return `${key.slice(0, i)}|${key.slice(i + 1)}`;
}

export class PresenceBeatHub {
  private unsupported: boolean;
  private source: PresenceBeatSource | null = null;
  private readonly modeListeners = new Set<() => void>();

  constructor(private readonly env: PresenceBeatHubEnv = {}) {
    const now = env.now ?? Date.now;
    let at: number | null = null;
    try {
      at = env.readUnsupportedAt?.() ?? null;
    } catch {
      at = null;
    }
    this.unsupported = at !== null && now() - at < PRESENCE_BEAT_RETRY_MS;
  }

  /** Beat em uso (ou ainda não descartado por 404). */
  get active(): boolean {
    return !this.unsupported;
  }

  setSource(source: PresenceBeatSource): () => void {
    this.source = source;
    return () => {
      if (this.source === source) this.source = null;
    };
  }

  onModeChange(fn: () => void): () => void {
    this.modeListeners.add(fn);
    return () => this.modeListeners.delete(fn);
  }

  /**
   * Entidades para o corpo do beat: só tipos/ids do contrato, ordenadas
   * (corpo estável) e no máximo `PRESENCE_BEAT_MAX_ENTITIES`.
   */
  entities(): PresenceEntity[] {
    const keys = [...new Set(this.source?.keys() ?? [])].sort();
    return keys
      .map(entityFromKey)
      .filter((e) => PRESENCE_BEAT_TYPES.has(e.type) && PRESENCE_BEAT_ID_RE.test(e.id))
      .slice(0, PRESENCE_BEAT_MAX_ENTITIES);
  }

  /** Viewers da resposta do beat → quem assina cada entidade. */
  deliver(viewers: unknown): void {
    if (!viewers || typeof viewers !== "object" || Array.isArray(viewers)) return;
    for (const [beatKey, list] of Object.entries(viewers as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const key = beatKeyToPresenceKey(beatKey);
      if (key) this.source?.deliver(key, list as EntityViewer[]);
    }
  }

  /** 404: backend sem o beat. Volta ao ping + heartbeat por entidade. */
  markUnsupported(): void {
    if (this.unsupported) return;
    this.unsupported = true;
    try {
      this.env.writeUnsupportedAt?.((this.env.now ?? Date.now)());
    } catch {
      /* storage bloqueado: só esta página */
    }
    for (const fn of this.modeListeners) {
      try {
        fn();
      } catch {
        /* isola */
      }
    }
  }
}

function readStored(): number | null {
  try {
    const raw = window.localStorage.getItem(PRESENCE_BEAT_UNSUPPORTED_KEY);
    const at = raw ? Number(raw) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

let defaultHub: PresenceBeatHub | null = null;

/** Elo desta página (um por página, compartilhado por tique e presence-sync). */
export function presenceBeatHub(): PresenceBeatHub {
  defaultHub ??= new PresenceBeatHub(
    typeof window === "undefined"
      ? {}
      : {
          readUnsupportedAt: readStored,
          writeUnsupportedAt: (at) => window.localStorage.setItem(PRESENCE_BEAT_UNSUPPORTED_KEY, String(at)),
        },
  );
  return defaultHub;
}

/** Só para testes. */
export function __resetPresenceBeatHubForTests(hub: PresenceBeatHub | null = null): void {
  defaultHub = hub;
}
