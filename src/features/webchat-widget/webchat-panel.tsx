"use client";

/**
 * Painel do widget (presentacional): cabeçalho, mensagens, composer e os
 * formulários de pré-chat / identificação / offline. Sem design system do
 * CRM — roda no iframe dentro do site do cliente. Texto do visitante e do
 * agente é renderizado como texto React (sem HTML cru).
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { WebchatIdentity } from "./api";
import type { UiMessage } from "./use-webchat-chat";
import {
  WEBCHAT_MAX_CONTENT,
  safeHexColor,
  type WebchatIdentification,
  type WebchatPublicConfig,
} from "./types";
import styles from "./webchat.module.css";

export type PanelVariant = "embedded" | "hosted" | "preview";
export type PanelView = "loading" | "unavailable" | "prechat" | "offline" | "chat";

/** Texto escuro sobre cores claras (amarelo, verde-limão…). */
export function contrastFor(hex: string): "light" | "dark" {
  const h = safeHexColor(hex).slice(1);
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0);
  return L > 0.45 ? "dark" : "light";
}

export function themeStyle(config: WebchatPublicConfig): {
  style: CSSProperties;
  contrast: "light" | "dark";
} {
  const primary = safeHexColor(config.theme.primary);
  return {
    style: { ["--wc-primary" as string]: primary } as CSSProperties,
    contrast: contrastFor(primary),
  };
}

/** `*negrito*`, `_itálico_`, `~riscado~` (formato do WhatsApp/composer do CRM). */
function formatInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (i % 2 === 0) return part;
    const inner = part.slice(1, -1);
    if (part.startsWith("*")) return <strong key={key}>{inner}</strong>;
    if (part.startsWith("_")) return <em key={key}>{inner}</em>;
    return <s key={key}>{inner}</s>;
  });
}

/**
 * Texto da mensagem como nós React (sem HTML cru): links http(s) clicáveis +
 * formatação simples do WhatsApp — a assinatura do agente chega como
 * `*Nome*: texto`.
 */
export function renderMessageText(text: string): ReactNode[] {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return parts.flatMap((part, i) =>
    i % 2 === 1
      ? [
          <a key={`l-${i}`} href={part} target="_blank" rel="noopener noreferrer nofollow">
            {part}
          </a>,
        ]
      : formatInline(part, `t-${i}`),
  );
}

/** Mensagem já começa com a assinatura `*Nome*:` — o rótulo do remetente sobraria. */
function hasSignaturePrefix(text: string): boolean {
  return /^\*[^*\n]{1,80}\*:?\s/.test(text);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const ChatIcon = () => (
  <Svg size={26}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z" />
  </Svg>
);
const CloseIcon = () => (
  <Svg>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
const UserIcon = () => (
  <Svg>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);
const SendIcon = () => (
  <Svg size={18}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </Svg>
);

type IdentityFieldsProps = {
  identification: WebchatIdentification | "all";
  initial?: WebchatIdentity;
  submitLabel: string;
  intro?: ReactNode;
  extra?: (onChange: (v: string) => void, value: string) => ReactNode;
  requireExtra?: boolean;
  onSubmit: (identity: WebchatIdentity, extra: string) => Promise<void>;
  onCancel?: () => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Campos de identificação: pré-chat (obrigatórios) ou "Informe seus dados". */
function IdentityForm({
  identification,
  initial,
  submitLabel,
  intro,
  extra,
  requireExtra,
  onSubmit,
  onCancel,
}: IdentityFieldsProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [extraValue, setExtraValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = identification === "all";
  const showEmail = all || identification === "name_email";
  const showPhone = all || identification === "name_phone";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const em = email.trim();
    const ph = phone.trim();
    if (!all && !n) return setError("Informe seu nome.");
    if (!all && identification === "name_email" && !em) return setError("Informe seu e-mail.");
    if (!all && identification === "name_phone" && !ph) return setError("Informe seu telefone.");
    if (all && !n && !em && !ph) return setError("Preencha ao menos um campo.");
    if (em && !EMAIL_RE.test(em)) return setError("E-mail inválido.");
    if (ph && ph.replace(/\D/g, "").length < 8) return setError("Telefone inválido.");
    if (requireExtra && !extraValue.trim()) return setError("Escreva sua mensagem.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit(
        { name: n || undefined, email: em || undefined, phone: ph || undefined },
        extraValue,
      );
    } catch {
      setError("Não foi possível enviar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
      {intro}
      <label className={styles.field}>
        Nome
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={120}
        />
      </label>
      {showEmail ? (
        <label className={styles.field}>
          E-mail
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            maxLength={200}
          />
        </label>
      ) : null}
      {showPhone ? (
        <label className={styles.field}>
          Telefone
          <input
            className={styles.input}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            maxLength={40}
          />
        </label>
      ) : null}
      {extra ? extra(setExtraValue, extraValue) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button className={styles.button} type="submit" disabled={busy}>
        {busy ? "Enviando…" : submitLabel}
      </button>
      {onCancel ? (
        <button
          className={`${styles.button} ${styles.buttonGhost}`}
          type="button"
          onClick={onCancel}
        >
          Cancelar
        </button>
      ) : null}
    </form>
  );
}

export type WebchatPanelProps = {
  config: WebchatPublicConfig;
  variant: PanelVariant;
  view: PanelView;
  messages: UiMessage[];
  agentTyping: boolean;
  agentReadAt: string | null;
  identity?: WebchatIdentity;
  offlineSent?: boolean;
  onClose?: () => void;
  onSend: (text: string) => Promise<boolean> | void;
  onRetry: (id: string) => void;
  onTyping: () => void;
  onIdentify: (identity: WebchatIdentity) => Promise<void>;
  onOfflineSubmit: (identity: WebchatIdentity, message: string) => Promise<void>;
};

export function WebchatPanel({
  config,
  variant,
  view,
  messages,
  agentTyping,
  agentReadAt,
  identity,
  offlineSent,
  onClose,
  onSend,
  onRetry,
  onTyping,
  onIdentify,
  onOfflineSubmit,
}: WebchatPanelProps) {
  const [draft, setDraft] = useState("");
  const [identifyOpen, setIdentifyOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const avatar = config.theme.avatarUrl;
  const title = config.theme.title;

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, agentTyping, view]);

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void onSend(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submitDraft();
    }
  };

  const lastInId = [...messages].reverse().find((m) => m.direction === "in")?.id;

  const receipt = (m: UiMessage): ReactNode => {
    if (m.local === "failed") {
      return (
        <span className={`${styles.meta} ${styles.metaFailed}`}>
          Não enviada ·{" "}
          <button type="button" className={styles.linkButton} onClick={() => onRetry(m.id)}>
            Tentar de novo
          </button>
        </span>
      );
    }
    if (m.id !== lastInId) return null;
    if (m.local === "pending") return <span className={styles.meta}>Enviando…</span>;
    const read = m.status === "read" || (agentReadAt != null && m.createdAt <= agentReadAt);
    return (
      <span className={styles.meta}>
        {formatTime(m.createdAt)} · {read ? "Lida" : "Enviada"}
      </span>
    );
  };

  let content: ReactNode;
  if (view === "loading") {
    content = <div className={styles.center}>Carregando…</div>;
  } else if (view === "unavailable") {
    content = <div className={styles.center}>Chat indisponível no momento.</div>;
  } else if (view === "prechat") {
    content = (
      <IdentityForm
        identification={config.identification}
        initial={identity}
        submitLabel="Iniciar conversa"
        intro={
          <>
            <p className={styles.formIntro}>{config.greeting}</p>
            <p className={styles.formHint}>Antes de começar, conte quem é você.</p>
          </>
        }
        onSubmit={(id) => onIdentify(id)}
      />
    );
  } else if (view === "offline") {
    content = offlineSent ? (
      <div className={styles.center}>
        Recebemos sua mensagem. Retornaremos pelo contato informado.
      </div>
    ) : (
      <IdentityForm
        identification="name_email"
        initial={identity}
        submitLabel="Enviar"
        requireExtra
        intro={<p className={styles.formIntro}>{config.offlineMessage}</p>}
        extra={(setValue, value) => (
          <label className={styles.field}>
            Mensagem
            <textarea
              className={styles.input}
              rows={4}
              value={value}
              maxLength={WEBCHAT_MAX_CONTENT}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        )}
        onSubmit={(id, message) => onOfflineSubmit(id, message)}
      />
    );
  } else {
    content = (
      <>
        {!config.online ? <div className={styles.banner}>{config.offlineMessage}</div> : null}
        <div
          ref={bodyRef}
          className={styles.body}
          role="log"
          aria-live="polite"
          aria-label="Mensagens"
        >
          <div className={`${styles.row} ${styles.rowOut}`}>
            <div className={styles.bubble}>{config.greeting}</div>
          </div>
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const showSender =
              m.direction === "out" &&
              m.senderName &&
              !hasSignaturePrefix(m.content) &&
              (prev?.direction !== "out" || prev.senderName !== m.senderName);
            return (
              <div
                key={m.id}
                className={`${styles.row} ${m.direction === "in" ? styles.rowIn : styles.rowOut}`}
              >
                {showSender ? <span className={styles.sender}>{m.senderName}</span> : null}
                <div className={styles.bubble} data-local={m.local ?? undefined}>
                  {renderMessageText(m.content)}
                </div>
                {m.direction === "in" ? receipt(m) : null}
              </div>
            );
          })}
          {agentTyping ? (
            <div className={styles.typing} aria-label="Atendente digitando">
              <span />
              <span />
              <span />
            </div>
          ) : null}
        </div>
        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            submitDraft();
          }}
        >
          <textarea
            className={styles.textarea}
            rows={1}
            value={draft}
            placeholder="Escreva sua mensagem…"
            aria-label="Mensagem"
            maxLength={WEBCHAT_MAX_CONTENT}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value) onTyping();
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={!draft.trim()}
            aria-label="Enviar"
          >
            <SendIcon />
          </button>
        </form>
        <div className={styles.footer}>
          Atendimento por{" "}
          <a href="https://bwipo.com" target="_blank" rel="noopener noreferrer">
            Bwipo
          </a>
        </div>
      </>
    );
  }

  return (
    <div className={styles.panel} role="dialog" aria-label={title}>
      <header className={styles.header}>
        <span className={styles.avatar} aria-hidden="true">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.avatar} src={avatar} alt="" referrerPolicy="no-referrer" />
          ) : (
            title.slice(0, 1).toUpperCase()
          )}
        </span>
        <div className={styles.headerText}>
          <p className={styles.title}>{title}</p>
          <p className={styles.status}>
            <span className={styles.statusDot} data-online={String(config.online)} />
            {config.online ? "Online" : "Fora do horário"}
          </p>
        </div>
        {view === "chat" ? (
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setIdentifyOpen(true)}
            aria-label="Informe seus dados"
            title="Informe seus dados"
          >
            <UserIcon />
          </button>
        ) : null}
        {variant !== "hosted" && onClose ? (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Fechar chat"
            title="Fechar"
          >
            <CloseIcon />
          </button>
        ) : null}
      </header>
      {content}
      {identifyOpen ? (
        <div className={styles.sheet}>
          <IdentityForm
            identification="all"
            initial={identity}
            submitLabel="Salvar dados"
            intro={
              <p className={styles.formHint}>
                Informe seus dados para que possamos retornar o contato.
              </p>
            }
            onSubmit={async (id) => {
              await onIdentify(id);
              setIdentifyOpen(false);
            }}
            onCancel={() => setIdentifyOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

export { styles as webchatStyles };
