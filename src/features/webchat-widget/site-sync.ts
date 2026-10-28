/**
 * Webchat v2 — envio do que o site manda pelo loader (identify, contexto vivo
 * e linha do tempo) para a API pública. Contrato:
 * `backend_crm1/docs/decisoes/webchat-widget.md` §9.1/§9.3/§9.4.
 *
 *  - `identify` vai primeiro: contexto/eventos esperam o resultado (o
 *    servidor só aceita depois do identify assinado, ou com o canal em modo
 *    anônimo). Eventos de antes do identify não se perdem.
 *  - Contexto: patches fundidos (merge raso) e mandados com um pequeno
 *    atraso (o site pode chamar `setContext` várias vezes seguidas).
 *  - Eventos: fila de no máximo 100 (descarta os mais antigos), lotes de
 *    até 20.
 *  - 403 `TRACKING_DISABLED`: para de mandar até o próximo `identify`
 *    (guarda o contexto fundido e a fila limitada).
 *  - Página fechando (`flush`): manda o que restou já, com keepalive.
 *  - Falha transitória (rede/5xx/429): tenta de novo depois; 4xx de regra
 *    descarta o lote (não fica em laço).
 */
import { WebchatApiError, isTransientWebchatError } from "./api";
import type {
  WebchatContextPatch,
  WebchatIdentifyPayload,
  WebchatIdentifyVerification,
  WebchatTrackEvent,
} from "./protocol";

export const SITE_QUEUE_MAX = 100;
export const SITE_BATCH_MAX = 20;
export const SITE_CONTEXT_DELAY_MS = 1000;
export const SITE_RETRY_MS = 15_000;

export type SiteSyncDeps = {
  identify: (payload: WebchatIdentifyPayload) => Promise<WebchatIdentifyVerification>;
  /** Roda `fn` com o token do visitante (cria a sessão se preciso). */
  withToken: <T>(fn: (token: string) => Promise<T>) => Promise<T>;
  postContext: (token: string, context: WebchatContextPatch, keepalive: boolean) => Promise<unknown>;
  postEvents: (token: string, events: WebchatTrackEvent[], keepalive: boolean) => Promise<unknown>;
  onIdentity: (verified: boolean) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

function isTrackingDisabled(e: unknown): boolean {
  return e instanceof WebchatApiError && e.status === 403 && e.code === "TRACKING_DISABLED";
}

export class SiteSync {
  private context: WebchatContextPatch | null = null;
  private events: WebchatTrackEvent[] = [];
  private identifying: Promise<void> | null = null;
  private disabled = false;
  private sending: Promise<void> | null = null;
  private timer: unknown = null;
  private disposed = false;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly deps: SiteSyncDeps) {
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  identify(payload: WebchatIdentifyPayload): Promise<void> {
    const previous = this.identifying;
    const run = (async () => {
      if (previous) await previous.catch(() => {});
      let verified = false;
      try {
        verified = (await this.deps.identify(payload)).verified;
      } catch {
        verified = false;
      }
      // Novo identify: volta a tentar mandar (o servidor decide de novo).
      this.disabled = false;
      this.deps.onIdentity(verified);
    })();
    this.identifying = run;
    void run.finally(() => {
      if (this.identifying === run) this.identifying = null;
      this.schedule(0);
    });
    return run;
  }

  setContext(patch: WebchatContextPatch): void {
    this.context = { ...(this.context ?? {}), ...patch };
    this.schedule(SITE_CONTEXT_DELAY_MS);
  }

  track(events: WebchatTrackEvent[]): void {
    this.events.push(...events);
    if (this.events.length > SITE_QUEUE_MAX) this.events.splice(0, this.events.length - SITE_QUEUE_MAX);
    this.schedule(0);
  }

  /** Página fechando: manda o que restou já, com keepalive. */
  flush(): Promise<void> {
    this.cancelTimer();
    return this.send(true);
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
  }

  /** Para teste/inspeção. */
  pending(): { context: WebchatContextPatch | null; events: number; disabled: boolean } {
    return { context: this.context, events: this.events.length, disabled: this.disabled };
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private schedule(ms: number): void {
    if (this.disposed || this.timer !== null) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.send(false);
    }, ms);
  }

  private async send(keepalive: boolean): Promise<void> {
    if (this.disposed && !keepalive) return;
    if (this.sending) {
      await this.sending.catch(() => {});
      if (!this.context && this.events.length === 0) return;
    }
    const run = this.sendOnce(keepalive);
    this.sending = run;
    try {
      await run;
    } finally {
      if (this.sending === run) this.sending = null;
    }
  }

  private async sendOnce(keepalive: boolean): Promise<void> {
    if (this.identifying && !keepalive) await this.identifying.catch(() => {});
    if (this.disabled || (!this.context && this.events.length === 0)) return;
    let retry = false;
    try {
      await this.deps.withToken(async (token) => {
        if (this.context) {
          const ctx = this.context;
          this.context = null;
          try {
            await this.deps.postContext(token, ctx, keepalive);
          } catch (e) {
            if (isTrackingDisabled(e) || isTransientWebchatError(e)) {
              // Guarda (fundido com o que chegou no meio) para depois.
              this.context = { ...ctx, ...(this.context ?? {}) };
            }
            throw e;
          }
        }
        while (this.events.length && !this.disabled) {
          const batch = this.events.splice(0, SITE_BATCH_MAX);
          try {
            await this.deps.postEvents(token, batch, keepalive);
          } catch (e) {
            if (isTrackingDisabled(e) || isTransientWebchatError(e)) {
              this.events.unshift(...batch);
              if (this.events.length > SITE_QUEUE_MAX) {
                this.events.splice(0, this.events.length - SITE_QUEUE_MAX);
              }
            }
            throw e;
          }
        }
      });
    } catch (e) {
      if (isTrackingDisabled(e)) this.disabled = true;
      else if (isTransientWebchatError(e)) retry = true;
    }
    if (retry && !keepalive) this.schedule(SITE_RETRY_MS);
  }
}
