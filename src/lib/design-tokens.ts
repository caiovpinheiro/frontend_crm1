// DNA visual global — fonte única de verdade
// Alterar aqui reflete em todas as telas automaticamente.
// Cores de superfície/texto/borda: tokens do tema (globals.css / .dark).

export const dt = {
  bg: {
    page: "bg-background",
    card: "bg-card",
    hover: "bg-bg-hover",
  },

  text: {
    // Tokens semânticos do tema (globals.css → light + .dark). Sem
    // `text-slate-*` hardcoded — em dark mode preto sobre navy fica
    // ilegível, sintoma reportado nos cards do Kanban e nos badges.
    title: "text-[15px] font-semibold tracking-tight text-foreground",
    label: "text-[12px] text-[var(--color-ink-muted)]",
    value: "text-[13px] font-medium text-[var(--color-ink-soft)]",
    link: "text-[13px] font-medium text-primary",
    section: "text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-muted)]",
    muted: "text-[11px] text-[var(--color-ink-muted)]",
    time: "text-[10px] tabular-nums text-[var(--color-ink-muted)]",
    preview: "text-[13px] text-[var(--color-ink-muted)]",
  },

  card: {
    base: "rounded-xl border border-border-soft bg-card overflow-hidden",
    shadow: "shadow-[var(--shadow-card-sm)]",
    row: "flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border-soft last:border-0 hover:bg-bg-hover transition-colors",
    rowSm:
      "flex items-center justify-between gap-2 px-3 py-2 border-b border-border-soft last:border-0 hover:bg-bg-hover transition-colors",
    /** Hover do card Kanban / fila — sombra leve */
    kanbanHover: "hover:shadow-[var(--shadow-card-sm)]",
  },

  pill: {
    /** Tag padrão F — combinar com `tagStyle` / `tagPillStyle` em `utils.ts`. */
    base: "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold leading-tight rounded",
    sm: "inline-flex items-center px-2 py-0.5 text-[10px] font-semibold leading-tight rounded",
    expired:
      "inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground",
    neutral:
      "inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground",
    /** Chip de etapa de pipeline (não é etiqueta de contato). */
    stage:
      "inline-flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1 text-[12px] font-medium text-primary shadow-[var(--shadow-sm)]",
  },

  // TODO DS-004: add --workspace-leader-bg/border tokens to globals-v2.css
  /** Header petróleo do DealWorkspace (coluna esquerda compacta). */
  workspace: {
    leader:
      "shrink-0 border-b border-[#0a3d5e] bg-[#0f4c75]",
    leaderLabel: "mb-1 text-[10px] font-medium text-white/45",
    leaderTitle: "mb-3 truncate text-[14px] font-semibold text-white",
    leaderValue: "text-[13px] font-bold text-white tabular-nums",
    leaderBarTrack: "relative h-[3px] overflow-hidden rounded-full bg-[var(--glass-bg-subtle)]",
    leaderBarFill: "absolute inset-y-0 left-0 rounded-full bg-sky-400 transition-all",
    leaderMeta: "mt-1 text-[10px] text-white/35",
  },

  chat: {
    bubble: {
      /** Cores via `var(--chat-bubble-sent-*)` no wrapper; padding no bloco interno (`px-2 py-1`). */
      sent: "rounded-[var(--radius-input)] rounded-br-sm shadow-[0_1px_1px_rgba(0,0,0,0.08)]",
      /** Recebida — fundo via token de tema para suportar dark mode corretamente. */
      received:
        "rounded-[var(--radius-input)] rounded-bl-sm border border-[var(--chat-bubble-received-border)] bg-[var(--chat-bubble-received-bg)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]",
      /** Nota interna — faixa compacta (menos altura que bolha de conversa). */
      note: "border-l-2 border-l-[var(--chat-bubble-note-border)] bg-[var(--chat-bubble-note-bg)]",
      audio: "rounded-[var(--radius-input)] rounded-br-sm shadow-[0_1px_1px_rgba(0,0,0,0.08)]",
    },
    text: {
      sent: "text-[13px] leading-[1.4]",
      received: "text-[13px] leading-[1.4] text-[color:var(--chat-bubble-received-text)]",
      note: "text-[13px] leading-snug text-[var(--color-ink-soft)]",
    },
    time: {
      sent: "text-[10px] tabular-nums",
      received: "text-[10px] tabular-nums text-[color:var(--chat-bubble-received-time)]",
      note: "text-[10px] tabular-nums text-[var(--text-muted)]",
    },
    check: {
      sent: "text-[color:var(--chat-bubble-sent-time)]",
      read: "text-[color:var(--chat-bubble-sent-check-read)]",
      default: "text-ink-subtle",
    },
    fontSize: {
      compact: "text-[14px]",
      full: "text-[15px]",
    },
    dateSep:
      "rounded-full border border-[var(--color-success)]/25 bg-[var(--color-success-soft)] px-3 py-0.5 font-display text-[11px] font-semibold text-[var(--color-success)] shadow-[var(--glass-shadow-sm)] backdrop-blur",
    /** Card de sessão 24h encerrada (footer compactChrome) — ver `chat-window.tsx`. */
    sessionExpiredCard:
      "mx-3 my-2 flex items-center gap-3 rounded-xl border border-[var(--color-danger-subtle)] bg-card px-3 py-2.5 shadow-[0_2px_8px_rgba(220,38,38,0.08)]",
    noteLabel: "text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
    thread: "chat-thread-texture",
  },

  /** Inbox / bWiPO Chat — tipografia e SLA via tokens de tema. */
  inbox: {
    label: "text-[12px] font-medium text-[var(--inbox-text-muted)]",
    body: "text-[14px] text-[var(--inbox-text)]",
    title: "font-display text-[16px] font-semibold tracking-tight text-[var(--inbox-text)]",
    slaOk: "text-[var(--inbox-sla-ok)]",
    slaWarn: "text-[var(--inbox-sla-warn)]",
    slaLate: "text-[var(--inbox-sla-late)]",
    focus:
      "outline-none focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]",
  },

  /**
   * Avatar — dois papéis:
   * - contato/conversa: `ChatAvatar` (foto | sólido + badge de canal)
   * - pessoa interna: `AvatarGlass` (gradiente glass, sem badge de canal)
   * Cores/tamanhos: CSS vars `--avatar-*` em globals-v2.css.
   */
  avatar: {
    size: {
      xs: "size-6", // 24
      sm: "size-7", // 28
      md: "size-9", // 36
      lg: "size-11", // 44
      xl: "size-14", // 56
      inbox: "size-12", // 48 — lista Inbox
    },
    initials:
      "pointer-events-none font-semibold uppercase leading-none text-white/95",
    ring: "border-[var(--avatar-ring)]",
    glass: {
      blue: "bg-[image:var(--avatar-glass-blue)]",
      teal: "bg-[image:var(--avatar-glass-teal)]",
      orange: "bg-[image:var(--avatar-glass-orange)]",
      purple: "bg-[image:var(--avatar-glass-purple)]",
      pink: "bg-[image:var(--avatar-glass-pink)]",
      coral: "bg-[image:var(--avatar-glass-coral)]",
    },
  },

  /** Nomes de ícones Lucide alinhados a `SidebarFieldIcon` em `sidebar-field.tsx`. */
  icons: {
    stage: "Clock",
    owner: "User",
    origin: "MapPin",
    forecast: "Calendar",
    tags: "Tag",
    deal: "Monitor",
    phase: "User",
    engagement: "Activity",
    interests: "Heart",
    contact: "Phone",
    email: "Mail",
    company: "Building2",
    fields: "Tag",
    product: "ShoppingBag",
    responsible: "User",
  } as const,
} as const;
