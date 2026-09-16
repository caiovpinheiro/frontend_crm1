"use client";

import * as React from "react";

import { IconAt as AtSign, IconBuilding as Building2, IconExternalLink as ExternalLink, IconMail as Mail, IconPhone as Phone, IconUser as User } from "@tabler/icons-react";

import { COURSE_MODE_LABEL, type CourseLevel, type CourseMode, type ProductKind } from "@/features/products-v2/types";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/phone";

export type DealDetailUser = { id: string; name: string; email: string | null };

export type DealDetailNote = {
  id: string;
  content: string;
  createdAt: string;
  user: DealDetailUser;
};

export type DealDetailActivity = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  completed: boolean;
  scheduledAt: string | null;
  createdAt: string;
  user: DealDetailUser;
};

export type DealDetailData = {
  id: string;
  title: string;
  value: number | string;
  status: "OPEN" | "WON" | "LOST";
  expectedClose: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; name: string; email: string | null; phone: string | null } | null;
  stage: { id: string; name: string; color?: string | null; pipeline: { id: string; name: string } };
  owner: DealDetailUser | null;
  /** Unidade organizacional (filial) do negócio. Base p/ ofertas por unidade + cotas. */
  orgUnitId?: string | null;
  tags?: { tag: { id: string; name: string; color: string } }[];
  activities: DealDetailActivity[];
  notes: DealDetailNote[];
};

export type DealTimelineEvent = {
  id: string;
  type: string;
  meta: Record<string, unknown>;
  createdAt: string;
  user: { id: string; name: string; avatarUrl: string | null } | null;
};

export type ConversationRow = {
  id: string;
  externalId: string | null;
  channel: string;
  status: string;
  inboxName: string | null;
  createdAt: string;
  updatedAt: string;
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string; email?: string | null } | null;
  tags?: { tag: { id: string; name: string; color: string } }[] | null;
};

export type ContactDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** @ do WhatsApp (Contact.whatsappUsername), quando disponível. */
  whatsappUsername?: string | null;
  avatarUrl: string | null;
  leadScore: number;
  lifecycleStage: string;
  source: string | null;
  company: { id: string; name: string; domain: string | null } | null;
  assignedTo: { id: string; name: string; email: string } | null;
  tags: { tag: { id: string; name: string; color: string } }[];
  deals: {
    id: string;
    title: string;
    value: string | number;
    status: string;
    stage: { id: string; name: string; color: string };
  }[];
  activities: DealDetailActivity[];
  notes: DealDetailNote[];
  conversations: ConversationRow[];
  createdAt: string;
  updatedAt: string;
};

export type UserOption = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  agentStatus?: {
    status: "ONLINE" | "OFFLINE" | "AWAY";
    availableForVoiceCalls?: boolean;
    updatedAt?: string;
  } | null;
};

export type DealProductItem = {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  unit: string;
  productType?: "PRODUCT" | "SERVICE";
  productKind?: "PHYSICAL" | "SERVICE" | "COURSE" | "JOB_OPENING" | null;
  imageUrl?: string | null;
  imageMime?: string | null;
  imageName?: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
};

export type CatalogProduct = {
  id: string;
  name: string;
  sku: string | null;
  price: number | string;
  unit: string;
  type?: "PRODUCT" | "SERVICE";
  kind?: ProductKind;
  courseConfig?: {
    level: CourseLevel | null;
    mode: CourseMode;
    semester: number | null;
  } | null;
};

/** Subtítulo cinza ao lado do nome no seletor de catálogo (pipeline/chat). */
export function catalogProductSubtitle(p: CatalogProduct): string {
  const cc = p.courseConfig;
  if (p.kind === "COURSE" && cc) {
    if (cc.level === "POSTGRADUATE" && cc.semester != null && cc.semester > 0) {
      return `${cc.semester} meses`;
    }
    if (cc.level === "GRADUATION" && cc.mode) {
      // No seletor comercial, HYBRID aparece como Semipresencial.
      if (cc.mode === "HYBRID") return "Semipresencial";
      return COURSE_MODE_LABEL[cc.mode] ?? cc.mode;
    }
  }
  return (p.sku ?? "").trim();
}

export const ACTIVITY_TYPES = [
  { value: "CALL", label: "Ligação", icon: "📞" },
  { value: "EMAIL", label: "E-mail", icon: "📧" },
  { value: "MEETING", label: "Reunião", icon: "🤝" },
  { value: "TASK", label: "Tarefa", icon: "✅" },
  { value: "NOTE", label: "Nota", icon: "📝" },
  { value: "WHATSAPP", label: "WhatsApp", icon: "💬" },
  { value: "OTHER", label: "Outro", icon: "📌" },
];

export const LIFECYCLE_OPTIONS = [
  { value: "SUBSCRIBER", label: "Assinante", color: "bg-[var(--text-muted)]" },
  { value: "LEAD", label: "Lead", color: "bg-[var(--brand-primary)]" },
  { value: "MQL", label: "MQL", color: "bg-[var(--color-warning)]" },
  { value: "SQL", label: "SQL", color: "bg-[var(--color-warning)]" },
  { value: "OPPORTUNITY", label: "Oportunidade", color: "bg-[var(--brand-secondary)]" },
  { value: "CUSTOMER", label: "Cliente", color: "bg-[var(--color-success)]" },
  { value: "EVANGELIST", label: "Evangelista", color: "bg-[var(--brand-accent)]" },
  { value: "OTHER", label: "Outro", color: "bg-[var(--text-muted)]" },
] as const;

export const LIFECYCLE_COLORS: Record<string, string> = {
  SUBSCRIBER: "bg-[var(--glass-bg-subtle)] text-[var(--text-secondary)]",
  LEAD: "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]",
  MQL: "bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
  SQL: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  OPPORTUNITY: "bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)]",
  CUSTOMER: "bg-[var(--color-success)]/10 text-[var(--color-success)]",
  EVANGELIST: "bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]",
  OTHER: "bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]",
};

export const STATUS_LABEL: Record<string, string> = {
  OPEN: "Aberto",
  RESOLVED: "Resolvido",
  PENDING: "Pendente",
  SNOOZED: "Adiado",
};

export function SidebarSection({
  title,
  description,
  action,
  className,
  contentClassName,
  children,
}: {
  /** Titulo do header. Se omitido, so renderiza header quando existir `action`
   *  (util pra secoes que ja tem titulo em wrapper externo, ex: FieldCard). */
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const showHeader = Boolean(title) || Boolean(action);
  return (
    <section className={cn("border-b border-border/90 pb-4", className)}>
      {showHeader && (
        <div className={cn("flex items-start justify-between gap-3", title && "mb-2.5")}>
          {title ? (
            <div className="min-w-0">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {title}
              </h3>
              {description ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p> : null}
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          {action}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}

export function MiniInfoCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 shadow-sm",
        tone === "success" && "border-[var(--color-success)]/20 bg-[var(--color-success)]/10",
        tone === "warning" && "border-[var(--color-warning)]/20 bg-[var(--color-warning)]/10",
        tone === "default" && "border-border bg-[var(--color-bg-subtle)]/80",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <div className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[var(--text-muted)]">{hint}</div> : null}
    </div>
  );
}

export function CompactRow({
  icon,
  value,
  copyable,
}: {
  icon: React.ReactNode;
  value: string | null | undefined;
  copyable?: boolean;
}) {
  const text = value || "—";
  return (
    <div className="group/row flex items-center gap-2">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span
        className={cn(
          "truncate text-foreground",
          copyable && text !== "—" && "cursor-pointer hover:text-[var(--brand-primary)]",
        )}
        onClick={() => {
          if (copyable && text !== "—") navigator.clipboard.writeText(text);
        }}
        title={copyable && text !== "—" ? "Clique para copiar" : undefined}
      >
        {text}
      </span>
    </div>
  );
}

export function ContactInfoRows({ contact }: { contact: ContactDetail }) {
  return (
    <div className="grid gap-2 text-sm">
      <CompactRow icon={<User className="size-4" />} value={contact.name} />
      <CompactRow icon={<Mail className="size-4" />} value={contact.email} copyable />
      <CompactRow
        icon={<Phone className="size-4" />}
        value={contact.phone ? formatPhoneDisplay(contact.phone) : null}
        copyable
      />
      {contact.whatsappUsername && (
        <CompactRow
          icon={<AtSign className="size-4" />}
          value={`@${contact.whatsappUsername.replace(/^@/, "")}`}
          copyable
        />
      )}
      {contact.company && <CompactRow icon={<Building2 className="size-4" />} value={contact.company.name} />}
      {contact.source && <CompactRow icon={<ExternalLink className="size-4" />} value={contact.source} />}
      {contact.assignedTo && <CompactRow icon={<User className="size-4" />} value={contact.assignedTo.name} />}
    </div>
  );
}
