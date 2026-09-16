"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { IconMail } from "@tabler/icons-react";
import { PageHeader } from "@/components/crm/page-header";

/* ------------------------------------------------------------------
   Tokens — troque apenas estes valores para aplicar a marca do sistema.
   ------------------------------------------------------------------ */
const T = {
  paper: "#F7F9FD",
  surface: "#FFFFFF",
  ink: "#1B1B33",
  ink2: "#454B63",
  muted: "#7C849B",
  line: "#E4E9F2",
  lineSoft: "#EFF3F9",
  accent: "#3B5BF0",
  accentSoft: "#ECF0FE",
  accentInk: "#1E2A78",
  amber: "#5B3BB0",
  amberSoft: "#F3EEFE",
} as const;

// Gradiente da marca: usado só no botão principal e no trilho de não lido.
const BRAND_GRADIENT = "linear-gradient(135deg, #2B7FFF 0%, #6A45F0 55%, #C13BD9 100%)";

const FONT =
  "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const NUM = { fontVariantNumeric: "tabular-nums" } as const;

/* ------------------------------------------------------------------ */
/* Ícones                                                              */
/* ------------------------------------------------------------------ */
interface IconProps {
  size?: number;
  stroke?: number;
  fill?: string;
}

const Ic = ({ d, size = 16, stroke = 1.6, fill = "none" }: { d: React.ReactNode } & IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);

const IconSearch = (p: IconProps) => (
  <Ic {...p} d={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>} />
);
const IconInbox = (p: IconProps) => (
  <Ic {...p} d={<><path d="M3 12h4l2 3h6l2-3h4" /><path d="M5 5h14l2 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /></>} />
);
const IconSent = (p: IconProps) => <Ic {...p} d={<path d="M21 4 3 11l7 3 3 7 8-17Z" />} />;
const IconSpam = (p: IconProps) => (
  <Ic {...p} d={<><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" /><path d="M12 9v3.5" /><path d="M12 16h.01" /></>} />
);
const IconTrash = (p: IconProps) => (
  <Ic {...p} d={<><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /></>} />
);
const IconFolder = (p: IconProps) => (
  <Ic {...p} d={<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />} />
);
const IconRules = (p: IconProps) => (
  <Ic {...p} d={<><path d="M4 6h16" /><path d="M7 12h13" /><path d="M10 18h10" /><circle cx="4" cy="12" r="1.4" /><circle cx="7" cy="18" r="1.4" /></>} />
);
const IconReply = (p: IconProps) => (
  <Ic {...p} d={<><path d="M9 7 4 12l5 5" /><path d="M4 12h9a6 6 0 0 1 6 6v1" /></>} />
);
const IconForward = (p: IconProps) => (
  <Ic {...p} d={<><path d="m15 7 5 5-5 5" /><path d="M20 12h-9a6 6 0 0 0-6 6v1" /></>} />
);
const IconArchive = (p: IconProps) => (
  <Ic {...p} d={<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></>} />
);
const IconClip = (p: IconProps) => (
  <Ic {...p} d={<path d="M16 7 9.5 13.5a2.5 2.5 0 0 0 3.5 3.5L19 11a4.5 4.5 0 0 0-6.5-6.5L6 11" />} />
);
const IconRefresh = (p: IconProps) => (
  <Ic {...p} d={<><path d="M20 11a8 8 0 0 0-13.7-5.3L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 13.7 5.3L20 16" /><path d="M20 20v-4h-4" /></>} />
);
const IconChevron = (p: IconProps) => <Ic {...p} d={<path d="m6 9 6 6 6-6" />} />;
const IconPlus = (p: IconProps) => <Ic {...p} d={<><path d="M12 5v14" /><path d="M5 12h14" /></>} />;
const IconNote = (p: IconProps) => (
  <Ic {...p} d={<><path d="M5 4h14v10l-5 6H5z" /><path d="M19 14h-5v6" /></>} />
);

/* ------------------------------------------------------------------ */
/* Dados de exemplo                                                    */
/* ------------------------------------------------------------------ */
const H = 36e5;
const now = new Date("2026-09-15T12:00:00");
const ago = (h: number) => new Date(now.getTime() - h * H);

interface Message {
  id: number;
  from: string;
  address: string;
  to: string;
  subject: string;
  preview: string;
  date: Date;
  unread: boolean;
  kind: "marketing" | "codigo" | "sistema" | "pessoa";
  body?: string[];
  attachment?: boolean;
}

const MESSAGES: Message[] = [
  {
    id: 1,
    from: "Porto Seguro",
    address: "comunicacao@novidades.portoseguro.com.br",
    to: "financeiro@eduit.com.br",
    subject: "10% OFF para proteger o futuro da sua empresa",
    preview:
      '<table class="container" cellpadding="0"><tr><td>Manter um negócio em crescimento exige planejamento e proteção contra qualquer imprevisto.</td></tr></table>',
    date: ago(20),
    unread: false,
    kind: "marketing",
    body: [
      "Olá,",
      "Manter um negócio em crescimento exige planejamento e proteção contra qualquer imprevisto. Na Semana do Cliente, a Porto Seguro preparou uma oportunidade especial para você proteger sua empresa.",
      "Com o Seguro Empresarial, sua empresa conta com cobertura para incêndio, danos elétricos, vendaval e roubo, além de assistência 24 horas para reparos emergenciais.",
      "A condição é válida para contratações feitas até 30/09.",
    ],
  },
  {
    id: 2,
    from: "Caju Benefícios",
    address: "atendimento@caju.com.br",
    to: "financeiro@eduit.com.br",
    subject: "Conversa com o time de suporte",
    preview: "Olá, peço desculpas pela demora no retorno. Revisamos o cadastro dos cartões e a recarga já foi liberada.",
    date: ago(20),
    unread: true,
    kind: "pessoa",
    attachment: true,
  },
  {
    id: 3,
    from: "mfa@kommo.com",
    address: "mfa@kommo.com",
    to: "marcelo@eduit.com.br",
    subject: "217296 é o seu código para logar na Kommo",
    preview: "Use o código abaixo para concluir o acesso. Ele expira em 10 minutos.",
    date: ago(18),
    unread: false,
    kind: "codigo",
  },
  {
    id: 4,
    from: "mfa@kommo.com",
    address: "mfa@kommo.com",
    to: "marcelo@eduit.com.br",
    subject: "562186 é o seu código para logar na Kommo",
    preview: "Use o código abaixo para concluir o acesso. Ele expira em 10 minutos.",
    date: ago(18),
    unread: false,
    kind: "codigo",
  },
  {
    id: 5,
    from: "MadeiraMadeira",
    address: "ofertas@madeiramadeira.com.br",
    to: "marcelo@eduit.com.br",
    subject: "Combo de vantagem: frete grátis e cashback",
    preview: "Selecionamos móveis com até 45% de desconto para escritório e home office.",
    date: ago(21),
    unread: true,
    kind: "marketing",
  },
  {
    id: 6,
    from: "Suporte Kommo",
    address: "support@kommo.com",
    to: "marcelo@eduit.com.br",
    subject: "A Meta aprovou seu modelo do WhatsApp",
    preview: "O modelo pedido_ligacao_processando foi aprovado e já pode ser usado nos disparos.",
    date: ago(21),
    unread: true,
    kind: "sistema",
  },
  {
    id: 7,
    from: "GitHub Actions",
    address: "noreply@github.com",
    to: "marcelo@eduit.com.br",
    subject: "frontend_crm: Run failed — Build & Deploy",
    preview: "O job de build falhou no passo de testes. Veja o log completo da execução #482.",
    date: ago(22),
    unread: true,
    kind: "sistema",
  },
  {
    id: 8,
    from: "GitHub Actions",
    address: "noreply@github.com",
    to: "marcelo@eduit.com.br",
    subject: "backend_crm: Run failed — Build & Deploy",
    preview: "O job de build falhou no passo de migração do banco. Veja o log da execução #311.",
    date: ago(22),
    unread: true,
    kind: "sistema",
  },
  {
    id: 9,
    from: "Meta for Business",
    address: "business@meta.com",
    to: "marcelo@eduit.com.br",
    subject: "A categoria do modelo pedido_ligacao_processando mudou",
    preview: "Olá, Marcelo. A categoria do modelo foi atualizada para Utilidade e não haverá cobrança adicional.",
    date: ago(22),
    unread: true,
    kind: "sistema",
  },
  {
    id: 10,
    from: "Carolina Alexandrino",
    address: "carolina@nexadigital.com.br",
    to: "marcelo@eduit.com.br",
    subject: "Sua empresa conectada com mais velocidade",
    preview: "Marcelo, montei uma proposta de link dedicado para as duas unidades. Posso ligar amanhã?",
    date: ago(22),
    unread: true,
    kind: "pessoa",
    attachment: true,
  },
  {
    id: 11,
    from: "Asaas",
    address: "financeiro@asaas.com.br",
    to: "financeiro@eduit.com.br",
    subject: "Resumo de recebíveis de setembro",
    preview: "Sua conta recebeu 14 pagamentos nas últimas 24 horas, totalizando R$ 18.430,00.",
    date: ago(30),
    unread: false,
    kind: "sistema",
  },
  {
    id: 12,
    from: "Bruno Tavares",
    address: "bruno@eduit.com.br",
    to: "financeiro@eduit.com.br",
    subject: "Fechamento do contrato Nexa — falta assinatura",
    preview: "Mandei o contrato revisado. Só falta a assinatura do jurídico para liberar o faturamento.",
    date: ago(34),
    unread: false,
    kind: "pessoa",
    attachment: true,
  },
];

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

// O preview cru do HTML vazava para a lista. Aqui o corpo é limpo antes de exibir.
const stripHtml = (s: string): string =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sameDay = (a: Date, b: Date): boolean =>
  a.getDate() === b.getDate() &&
  a.getMonth() === b.getMonth() &&
  a.getFullYear() === b.getFullYear();

const shortTime = (d: Date): string => {
  if (sameDay(d, now))
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now.getTime() - 24 * H);
  if (sameDay(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const groupLabel = (d: Date): string => {
  if (sameDay(d, now)) return "Hoje";
  if (sameDay(d, new Date(now.getTime() - 24 * H))) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
};

const fullDate = (d: Date): string =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
  " às " +
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const initials = (name: string): string =>
  name
    .replace(/[@].*/, "")
    .split(/[\s._]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

// Cor derivada do remetente: estável, sem semântica inventada.
const avatarTone = (name: string): [string, string] => {
  const tones: [string, string][] = [
    ["#E8EEFE", "#2F4FD8"],
    ["#EFEAFD", "#6035D6"],
    ["#E6F1FB", "#1F5F96"],
    ["#F7EAF8", "#9B2FB0"],
    ["#EAEDF6", "#3A4670"],
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return tones[h % tones.length];
};

const KIND_LABEL = {
  marketing: "Marketing",
  codigo: "Código de acesso",
  sistema: "Automático",
  pessoa: null,
} as const;

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */
interface SidebarProps {
  folder: string;
  setFolder: (folder: string) => void;
  counts: { unread: number };
}

function Sidebar({ folder, setFolder, counts }: SidebarProps) {
  const main = [
    { id: "inbox", label: "Caixa de entrada", Icon: IconInbox, count: counts.unread },
    { id: "sent", label: "Enviados", Icon: IconSent },
    { id: "spam", label: "Spam", Icon: IconSpam },
    { id: "trash", label: "Excluídos", Icon: IconTrash, count: 7, quiet: true },
  ] as const;
  const folders = [
    { id: "meta", label: "WhatsApp Meta", count: 1 },
    { id: "asaas", label: "DNA Asaas", count: 20 },
  ] as const;

  interface RowItem {
    id: string;
    label: string;
    Icon?: React.ComponentType<IconProps>;
    count?: number;
    quiet?: boolean;
  }

  const Row = ({ id, label, Icon, count, quiet }: RowItem) => {
    const active = folder === id;
    return (
      <button
        onClick={() => setFolder(id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "7px 10px",
          borderRadius: 7,
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontSize: 13.5,
          fontWeight: active ? 600 : 450,
          color: active ? T.accentInk : T.ink2,
          background: active ? T.accentSoft : "transparent",
        }}
      >
        {Icon ? (
          <span style={{ color: active ? T.accent : T.muted, display: "flex" }}>
            <Icon size={17} />
          </span>
        ) : (
          <span style={{ color: T.muted, display: "flex" }}>
            <IconFolder size={17} />
          </span>
        )}
        <span style={{ flex: 1 }}>{label}</span>
        {count ? (
          <span
            style={{
              ...NUM,
              fontSize: 12,
              fontWeight: 600,
              color: quiet ? T.muted : active ? T.accent : T.ink2,
            }}
          >
            {count}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <aside
      style={{
        width: 224,
        flexShrink: 0,
        borderRight: `1px solid ${T.line}`,
        padding: "14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        background: T.paper,
      }}
    >
      <button
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          height: 36,
          borderRadius: 8,
          border: "none",
          background: BRAND_GRADIENT,
          color: "#fff",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <IconPlus size={16} /> Escrever
      </button>

      <label style={{ display: "block" }}>
        <span style={{ fontSize: 12, color: T.muted, display: "block", marginBottom: 5 }}>
          Conta
        </span>
        <div style={{ position: "relative" }}>
          <select
            defaultValue="all"
            style={{
              width: "100%",
              appearance: "none",
              height: 32,
              padding: "0 28px 0 10px",
              borderRadius: 7,
              border: `1px solid ${T.line}`,
              background: T.surface,
              fontSize: 13,
              color: T.ink,
              fontFamily: FONT,
              cursor: "pointer",
            }}
          >
            <option value="all">Todas as contas</option>
            <option>marcelo@eduit.com.br</option>
            <option>financeiro@eduit.com.br</option>
          </select>
          <span
            style={{
              position: "absolute",
              right: 9,
              top: 8,
              color: T.muted,
              pointerEvents: "none",
            }}
          >
            <IconChevron size={15} />
          </span>
        </div>
      </label>

      <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {main.map((m) => (
          <Row key={m.id} {...m} />
        ))}
      </nav>

      <div>
        <div
          style={{
            fontSize: 12,
            color: T.muted,
            padding: "0 10px 6px",
          }}
        >
          Pastas
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {folders.map((f) => (
            <Row key={f.id} {...f} />
          ))}
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 10px",
              border: "none",
              background: "transparent",
              color: T.muted,
              fontSize: 13.5,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            <IconPlus size={16} /> Nova pasta
          </button>
        </nav>
      </div>

      <div style={{ marginTop: "auto" }}>
        <Row id="rules" label="Regras" Icon={IconRules} />
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Lista                                                               */
/* ------------------------------------------------------------------ */
interface MessageRowProps {
  m: Message;
  active: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  dense: boolean;
}

function MessageRow({ m, active, selected, onOpen, onToggle, dense }: MessageRowProps) {
  const [hover, setHover] = useState(false);
  const [bg, fg] = avatarTone(m.from);
  const showCheck = hover || selected;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      style={{
        position: "relative",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: dense ? "8px 14px 8px 16px" : "11px 14px 11px 16px",
        cursor: "pointer",
        background: active ? T.accentSoft : selected ? T.lineSoft : hover ? "#F7F5F2" : "transparent",
        borderBottom: `1px solid ${T.lineSoft}`,
        outline: "none",
      }}
    >
      {/* trilho de não lido: substitui o badge "Novo" */}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: m.unread ? BRAND_GRADIENT : "transparent",
        }}
      />

      <div style={{ width: 28, flexShrink: 0, marginTop: 1 }}>
        {showCheck ? (
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggle}
            style={{ width: 15, height: 15, accentColor: T.accent, cursor: "pointer", margin: "5px 0 0 3px" }}
          />
        ) : (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              borderRadius: 7,
              background: bg,
              color: fg,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.2,
            }}
          >
            {initials(m.from)}
          </span>
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: m.unread ? 650 : 500,
              color: m.unread ? T.ink : T.ink2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {m.from}
          </span>
          {m.attachment && (
            <span style={{ color: T.muted, display: "flex" }}>
              <IconClip size={13} />
            </span>
          )}
          <span
            style={{
              ...NUM,
              marginLeft: "auto",
              fontSize: 11.5,
              color: T.muted,
              flexShrink: 0,
            }}
          >
            {shortTime(m.date)}
          </span>
        </div>

        <div
          style={{
            fontSize: 13.5,
            fontWeight: m.unread ? 600 : 450,
            color: m.unread ? T.ink : T.ink2,
            marginTop: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {m.subject}
        </div>

        {!dense && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginTop: 2,
            }}
          >
            {KIND_LABEL[m.kind] && (
              <span
                style={{
                  fontSize: 10.5,
                  color: T.muted,
                  border: `1px solid ${T.line}`,
                  borderRadius: 4,
                  padding: "0 4px",
                  flexShrink: 0,
                  lineHeight: "15px",
                }}
              >
                {KIND_LABEL[m.kind]}
              </span>
            )}
            <span
              style={{
                fontSize: 12.5,
                color: T.muted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {stripHtml(m.preview)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface ListProps {
  messages: Message[];
  activeId: number;
  setActiveId: (id: number) => void;
  selected: number[];
  setSelected: (ids: number[] | ((prev: number[]) => number[])) => void;
  markRead: (id: number) => void;
}

function List({ messages, activeId, setActiveId, selected, setSelected, markRead }: ListProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [dense, setDense] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return messages.filter((m) => {
      if (filter === "nao-lidos" && !m.unread) return false;
      if (filter === "pessoas" && m.kind !== "pessoa") return false;
      if (filter === "anexos" && !m.attachment) return false;
      if (!q) return true;
      return (
        m.from.toLowerCase().includes(q) ||
        m.subject.toLowerCase().includes(q) ||
        stripHtml(m.preview).toLowerCase().includes(q)
      );
    });
  }, [messages, query, filter]);

  const groups = useMemo(() => {
    const out: { label: string; items: Message[] }[] = [];
    filtered.forEach((m) => {
      const label = groupLabel(m.date);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    });
    return out;
  }, [filtered]);

  const chips: [string, string, number][] = [
    ["todos", "Tudo", messages.length],
    ["nao-lidos", "Não lidos", messages.filter((m) => m.unread).length],
    ["pessoas", "Pessoas", messages.filter((m) => m.kind === "pessoa").length],
    ["anexos", "Com anexo", messages.filter((m) => m.attachment).length],
  ];

  const anySelected = selected.length > 0;

  return (
    <section
      style={{
        width: 392,
        flexShrink: 0,
        borderRight: `1px solid ${T.line}`,
        display: "flex",
        flexDirection: "column",
        background: T.surface,
      }}
    >
      <div style={{ padding: "12px 14px 0" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: 9, color: T.muted }}>
            <IconSearch size={16} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por remetente, assunto ou conteúdo"
            style={{
              width: "100%",
              height: 36,
              padding: "0 10px 0 32px",
              borderRadius: 10,
              border: "1px solid transparent",
              background: "#F1F4FB",
              fontSize: 13,
              color: T.ink,
              fontFamily: FONT,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 0 9px",
          }}
        >
          {chips.map(([id, label, count]) => {
            const on = filter === id;
            return (
              <button
                key={id}
                onClick={() => setFilter(id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: on ? 600 : 500,
                  fontFamily: FONT,
                  cursor: "pointer",
                  border: "none",
                  background: on ? T.accentSoft : "transparent",
                  color: on ? T.accentInk : T.muted,
                }}
              >
                {label}
                <span
                  style={{
                    ...NUM,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 15,
                    height: 15,
                    padding: "0 3px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 600,
                    color: on ? "#fff" : T.ink2,
                    background: on ? T.accent : T.lineSoft,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setDense((d) => !d)}
            title={dense ? "Mostrar prévia" : "Ocultar prévia"}
            style={{
              marginLeft: "auto",
              border: "none",
              background: "transparent",
              color: T.muted,
              cursor: "pointer",
              fontSize: 12.5,
              fontFamily: FONT,
            }}
          >
            {dense ? "Confortável" : "Compacto"}
          </button>
          <button
            title="Atualizar"
            style={{ border: "none", background: "transparent", color: T.muted, cursor: "pointer", display: "flex" }}
          >
            <IconRefresh size={16} />
          </button>
        </div>
      </div>

      {/* barra contextual: só aparece quando há seleção */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 36,
          padding: "0 14px",
          borderTop: `1px solid ${T.lineSoft}`,
          borderBottom: `1px solid ${T.line}`,
          background: anySelected ? T.accentSoft : T.paper,
        }}
      >
        {anySelected ? (
          <>
            <span style={{ fontSize: 12.5, color: T.accentInk, fontWeight: 600, marginRight: 6 }}>
              {selected.length} selecionados
            </span>
            {[
              [IconArchive, "Arquivar"] as const,
              [IconSpam, "Spam"] as const,
              [IconTrash, "Excluir"] as const,
            ].map(([I, label]) => (
              <button
                key={label}
                onClick={() => setSelected([])}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  border: "none",
                  background: "transparent",
                  color: T.accentInk,
                  fontSize: 12.5,
                  fontFamily: FONT,
                  cursor: "pointer",
                  padding: "4px 6px",
                }}
              >
                <I size={15} /> {label}
              </button>
            ))}
            <button
              onClick={() => setSelected([])}
              style={{
                marginLeft: "auto",
                border: "none",
                background: "transparent",
                color: T.ink2,
                fontSize: 12.5,
                fontFamily: FONT,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 12.5, color: T.ink2, fontWeight: 600 }}>
              Caixa de entrada
            </span>
            <span style={{ ...NUM, fontSize: 12.5, color: T.muted, marginLeft: 8 }}>
              {filtered.filter((m) => m.unread).length} não lidos de {filtered.length}
            </span>
          </>
        )}
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {groups.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: T.ink2, margin: 0, fontWeight: 600 }}>
              Nada por aqui
            </p>
            <p style={{ fontSize: 13, color: T.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
              Ajuste a busca ou volte para o filtro Todos.
            </p>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                padding: "6px 16px",
                fontSize: 11.5,
                color: T.muted,
                background: "rgba(251,250,248,.94)",
                backdropFilter: "blur(6px)",
                borderBottom: `1px solid ${T.lineSoft}`,
              }}
            >
              {g.label}
            </div>
            {g.items.map((m) => (
              <MessageRow
                key={m.id}
                m={m}
                dense={dense}
                active={m.id === activeId}
                selected={selected.includes(m.id)}
                onOpen={() => {
                  setActiveId(m.id);
                  markRead(m.id);
                }}
                onToggle={() =>
                  setSelected((s) =>
                    s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]
                  )
                }
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */
interface ReaderProps {
  m: Message | null;
}

function Reader({ m }: ReaderProps) {
  const [replying, setReplying] = useState(false);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReplying(false);
    if (ref.current) ref.current.scrollTop = 0;
  }, [m?.id]);

  if (!m) return null;
  const [bg, fg] = avatarTone(m.from);

  const Action = ({
    Icon,
    label,
    primary,
  }: {
    Icon: React.ComponentType<IconProps>;
    label: string;
    primary?: boolean;
  }) => (
    <button
      onClick={() => label === "Responder" && setReplying(true)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 32,
        padding: primary ? "0 14px" : "0 10px",
        borderRadius: 7,
        fontSize: 13,
        fontFamily: FONT,
        fontWeight: primary ? 600 : 500,
        cursor: "pointer",
        border: primary ? "none" : `1px solid ${T.line}`,
        background: primary ? T.accent : T.surface,
        color: primary ? "#fff" : T.ink2,
      }}
    >
      <Icon size={15} />
      {label}
    </button>
  );

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: T.surface }}>
      {/* cabeçalho fixo: assunto + ações juntos, sem bloco escuro */}
      <header
        style={{
          padding: "14px 28px 12px",
          borderBottom: `1px solid ${T.line}`,
          background: T.surface,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              lineHeight: 1.35,
              fontWeight: 650,
              color: T.ink,
              letterSpacing: -0.2,
              flex: 1,
            }}
          >
            {m.subject}
          </h1>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <Action Icon={IconReply} label="Responder" primary />
            <Action Icon={IconForward} label="Encaminhar" />
            <Action Icon={IconArchive} label="Arquivar" />
            <Action Icon={IconTrash} label="Excluir" />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: 8,
              background: bg,
              color: fg,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {initials(m.from)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: T.ink, fontWeight: 600 }}>
              {m.from}{" "}
              <span style={{ fontWeight: 400, color: T.muted }}>&lt;{m.address}&gt;</span>
            </div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 1 }}>
              para {m.to} · <span style={NUM}>{fullDate(m.date)}</span>
            </div>
          </div>
          <button
            onClick={() => setNoteOpen((o) => !o)}
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: `1px solid ${T.line}`,
              background: T.surface,
              borderRadius: 7,
              height: 30,
              padding: "0 10px",
              fontSize: 12.5,
              color: T.ink2,
              fontFamily: FONT,
              cursor: "pointer",
            }}
          >
            <IconNote size={15} />
            {note ? "Anotação interna (1)" : "Anotar"}
          </button>
        </div>

        {noteOpen && (
          <div
            style={{
              marginTop: 10,
              border: `1px solid ${T.amberSoft}`,
              background: T.amberSoft,
              borderRadius: 8,
              padding: 10,
            }}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Visível só para o time. Ex.: aguardando retorno do jurídico."
              rows={2}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                resize: "vertical",
                fontSize: 13,
                fontFamily: FONT,
                color: T.ink,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </header>

      <div ref={ref} style={{ flex: 1, overflowY: "auto", padding: "24px 28px 40px" }}>
        <div style={{ maxWidth: 660 }}>
          {m.kind === "marketing" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                color: T.ink2,
                background: T.paper,
                border: `1px solid ${T.line}`,
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 18,
              }}
            >
              Imagens bloqueadas neste remetente.
              <button
                style={{
                  border: "none",
                  background: "transparent",
                  color: T.accent,
                  fontWeight: 600,
                  fontSize: 12.5,
                  fontFamily: FONT,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Exibir imagens
              </button>
            </div>
          )}

          {(m.body || [stripHtml(m.preview)]).map((p, i) => (
            <p
              key={i}
              style={{
                margin: "0 0 14px",
                fontSize: 14.5,
                lineHeight: 1.65,
                color: T.ink2,
              }}
            >
              {p}
            </p>
          ))}

          {m.attachment && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 22,
                border: `1px solid ${T.line}`,
                borderRadius: 8,
                padding: "10px 12px",
                width: "fit-content",
              }}
            >
              <span style={{ color: T.muted, display: "flex" }}>
                <IconClip size={16} />
              </span>
              <div>
                <div style={{ fontSize: 13, color: T.ink, fontWeight: 550 }}>proposta.pdf</div>
                <div style={{ ...NUM, fontSize: 12, color: T.muted }}>248 KB</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* resposta acontece no mesmo lugar da leitura */}
      <div style={{ borderTop: `1px solid ${T.line}`, padding: "12px 28px 16px", background: T.paper }}>
        {replying ? (
          <div
            style={{
              border: `1px solid ${T.line}`,
              borderRadius: 10,
              background: T.surface,
              padding: 12,
              maxWidth: 660,
            }}
          >
            <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 8 }}>
              Respondendo para {m.address}
            </div>
            <textarea
              autoFocus
              rows={4}
              placeholder="Escreva sua resposta"
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                resize: "vertical",
                fontSize: 14,
                lineHeight: 1.6,
                fontFamily: FONT,
                color: T.ink,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                style={{
                  height: 32,
                  padding: "0 16px",
                  borderRadius: 7,
                  border: "none",
                  background: T.accent,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: FONT,
                  cursor: "pointer",
                }}
              >
                Enviar resposta
              </button>
              <button
                onClick={() => setReplying(false)}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 7,
                  border: `1px solid ${T.line}`,
                  background: T.surface,
                  color: T.ink2,
                  fontSize: 13,
                  fontFamily: FONT,
                  cursor: "pointer",
                }}
              >
                Descartar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setReplying(true)}
            style={{
              width: "100%",
              maxWidth: 660,
              textAlign: "left",
              height: 40,
              padding: "0 14px",
              borderRadius: 10,
              border: `1px solid ${T.line}`,
              background: T.surface,
              color: T.muted,
              fontSize: 13.5,
              fontFamily: FONT,
              cursor: "pointer",
            }}
          >
            Responder para {m.from}
          </button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
export default function InboxRefatorado() {
  const [messages, setMessages] = useState<Message[]>(MESSAGES);
  const [activeId, setActiveId] = useState<number>(2);
  const [selected, setSelected] = useState<number[]>([]);
  const [folder, setFolder] = useState<string>("inbox");

  const markRead = (id: number) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, unread: false } : m)));

  // navegação por teclado: j / k para mover, r para responder
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key !== "j" && e.key !== "k") return;
      const i = messages.findIndex((m) => m.id === activeId);
      const next = e.key === "j" ? Math.min(i + 1, messages.length - 1) : Math.max(i - 1, 0);
      setActiveId(messages[next].id);
      markRead(messages[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, messages]);

  const active = messages.find((m) => m.id === activeId) || messages[0];
  const counts = { unread: messages.filter((m) => m.unread).length };

  return (
    <div
      style={{
        fontFamily: FONT,
        color: T.ink,
        background: T.paper,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <PageHeader
        icon={<IconMail size={22} />}
        title="E-mail"
        className="rounded-none border-0 bg-transparent shadow-none"
      />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar folder={folder} setFolder={setFolder} counts={counts} />
        <List
          messages={messages}
          activeId={activeId}
          setActiveId={setActiveId}
          selected={selected}
          setSelected={setSelected}
          markRead={markRead}
        />
        <Reader m={active} />
      </div>
    </div>
  );
}
