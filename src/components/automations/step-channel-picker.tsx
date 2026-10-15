"use client";

/**
 * step-channel-picker — seleção de canal (`config.channelId`) para steps
 * de mensagem (WhatsApp texto/mídia/template/botões/lista/produto + e-mail
 * e `question`). Compartilhado entre o campo inline do editor
 * (`inline-editor.tsx`, via `useConnectedStepChannels`) e o menu kebab
 * dos nodes do canvas (`StepChannelKebabMenu`).
 *
 * Padrão: `channelId` vazio = canal da conversa (entrada / gatilho).
 * Override explícito só quando o operador escolhe uma conexão no passo.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { IconBrandWhatsapp, IconCheck, IconChevronDown, IconDotsVertical, IconMail } from "@tabler/icons-react";

import {
  FILTER_FIELD_ITEM_CLASS,
  FILTER_FIELD_MENU_CLASS,
  FILTER_FIELD_TRIGGER_CLASS,
} from "@/components/crm/dropdown-glass";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useModalPortalContainer } from "@/components/ui/modal-portal-context";
import { TooltipHost } from "@/components/ui/tooltip";
import {
  fetchConnectedEmailChannels,
  fetchConnectedMetaCloudWhatsAppChannels,
  formatMetaChannelLabel,
} from "@/lib/meta-whatsapp/meta-cloud-channels";
import { cn } from "@/lib/utils";

export type StepChannelOption = {
  id: string;
  label: string;
  detail?: string;
  kind?: "whatsapp" | "email";
};

/** Mockup do /fluxo quando a org não tem canal conectado. */
const MOCK_WHATSAPP_CHANNELS: StepChannelOption[] = [
  { id: "mock-wa-oficial", label: "WhatsApp Oficial", detail: "+55 11 99999-0001", kind: "whatsapp" },
  { id: "mock-wa-suporte", label: "WhatsApp Suporte", detail: "+55 11 99999-0002", kind: "whatsapp" },
  { id: "mock-wa-comercial", label: "WhatsApp Comercial", detail: "+55 11 99999-0003", kind: "whatsapp" },
];

const MOCK_EMAIL_CHANNELS: StepChannelOption[] = [
  { id: "mock-email-noreply", label: "E-mail operacional", detail: "noreply@empresa.com", kind: "email" },
  { id: "mock-email-contato", label: "E-mail contato", detail: "contato@empresa.com", kind: "email" },
];

/** `send_email` usa canais de e-mail; todo o resto usa WhatsApp (Meta Cloud API). */
function channelKindForStepType(stepType: string): "whatsapp" | "email" {
  return stepType === "send_email" ? "email" : "whatsapp";
}

export function useConnectedStepChannels(
  stepType: string,
  opts?: { enabled?: boolean; mockIfEmpty?: boolean },
): {
  options: StepChannelOption[];
  isLoading: boolean;
} {
  const kind = channelKindForStepType(stepType);
  const mockIfEmpty = opts?.mockIfEmpty === true;
  const { data, isLoading } = useQuery({
    queryKey: ["automation-step-connected-channels", kind],
    queryFn: async () =>
      kind === "email" ? fetchConnectedEmailChannels() : fetchConnectedMetaCloudWhatsAppChannels(),
    staleTime: 60_000,
    enabled: opts?.enabled ?? true,
  });
  // Memo obrigatório: array novo a cada render quebrava o useEffect de
  // buildNodes no canvas (setNodes em loop → Maximum update depth).
  const options: StepChannelOption[] = useMemo(() => {
    const real = (data ?? []).map((c) => ({
      id: c.id,
      label: c.name?.trim() || (kind === "email" ? "Canal" : formatMetaChannelLabel(c)),
      detail:
        kind === "email"
          ? undefined
          : typeof c.phoneNumber === "string"
            ? c.phoneNumber.trim()
            : undefined,
      kind,
    }));
    if (real.length > 0 || !mockIfEmpty) return real;
    return kind === "email" ? MOCK_EMAIL_CHANNELS : MOCK_WHATSAPP_CHANNELS;
  }, [data, kind, mockIfEmpty]);
  return { options, isLoading };
}

export function channelLabelFromOptions(
  options: StepChannelOption[],
  channelId: string | undefined | null,
): string | null {
  if (!channelId) return null;
  return options.find((o) => o.id === channelId)?.label ?? null;
}

export const INHERIT_CHANNEL_VALUE = "__inherit__";

/** Menu "⋮" nos nodes do canvas — mesmas opções, formato compacto. */
export function StepChannelKebabMenu({
  stepType,
  channelId,
  isFirstMessageStep,
  onChange,
}: {
  stepType: string;
  channelId: string | undefined;
  isFirstMessageStep: boolean;
  onChange: (channelId: string) => void;
}) {
  const { options } = useConnectedStepChannels(stepType);
  if (options.length <= 1) return null;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <TooltipHost label="Canal de envio" side="top">
          <DropdownMenuTrigger
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--color-ink-muted)] opacity-0 transition-all hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-ink-soft)] group-hover/node:opacity-100"
            aria-label="Canal de envio"
          >
            <IconDotsVertical className="size-3.5" strokeWidth={2.2} />
          </DropdownMenuTrigger>
        </TooltipHost>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Canal de envio
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onChange("")}
            className={cn("text-[12.5px]", !channelId && "font-semibold text-primary")}
          >
            Canal da conversa (entrada)
          </DropdownMenuItem>
          {options.map((o) => (
            <DropdownMenuItem
              key={o.id}
              onClick={() => onChange(o.id)}
              className={cn("text-[12.5px]", channelId === o.id && "font-semibold text-primary")}
            >
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Selo pequeno exibido no node quando há canal explícito/relevante. */
export function StepChannelBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-[var(--color-primary-soft)] px-1.5 py-0.5 text-[9.5px] font-bold tracking-tight text-[var(--brand-primary)]">
      {label}
    </span>
  );
}

function ChannelKindIcon({ kind }: { kind?: "whatsapp" | "email" }) {
  if (kind === "email") {
    return <IconMail size={15} className="shrink-0 text-[var(--text-muted)]" />;
  }
  return <IconBrandWhatsapp size={15} className="shrink-0 text-[#25D366]" />;
}

/**
 * Dropdown estilo Kommo: "Canais: Selecionar tudo" + checkboxes dos
 * canais CONNECTED da org.
 */
export function ActiveChannelMultiSelect({
  id,
  kinds = "all",
  scope,
  values,
  onChange,
  mockIfEmpty,
  emptyHint = "Marque ao menos um canal. Sem seleção, não dispara.",
}: {
  id: string;
  kinds?: "all" | "whatsapp" | "email";
  scope: "all" | "selected";
  values: string[];
  onChange: (scope: "all" | "selected", channelIds: string[]) => void;
  mockIfEmpty?: boolean;
  emptyHint?: string;
}) {
  const wa = useConnectedStepChannels("send_whatsapp_message", {
    enabled: kinds !== "email",
    mockIfEmpty,
  });
  const email = useConnectedStepChannels("send_email", {
    enabled: kinds !== "whatsapp",
    mockIfEmpty,
  });
  const portalContainer = useModalPortalContainer();

  const groups = (
    kinds === "email"
      ? [{ key: "email" as const, label: "E-mail", options: email.options }]
      : kinds === "whatsapp"
        ? [{ key: "whatsapp" as const, label: "WhatsApp", options: wa.options }]
        : [
            { key: "whatsapp" as const, label: "WhatsApp", options: wa.options },
            { key: "email" as const, label: "E-mail", options: email.options },
          ]
  ).filter((g) => g.options.length > 0);

  const all = groups.flatMap((g) => g.options);
  const allIds = all.map((o) => o.id);
  const isLoading =
    (kinds !== "email" && wa.isLoading) || (kinds !== "whatsapp" && email.isLoading);
  const selectAll = scope === "all";
  const checkedIds = selectAll ? allIds : values;

  const setAll = () => onChange("all", []);
  const setNone = () => onChange("selected", []);

  const toggle = (cid: string) => {
    if (selectAll) {
      onChange(
        "selected",
        allIds.filter((id) => id !== cid),
      );
      return;
    }
    const next = values.includes(cid)
      ? values.filter((v) => v !== cid)
      : [...values, cid];
    if (next.length === allIds.length && allIds.length > 0) {
      onChange("all", []);
      return;
    }
    onChange("selected", next);
  };

  const triggerLabel = selectAll
    ? "Selecionar tudo"
    : values.length === 0
      ? "Nenhum canal"
      : values.length === 1
        ? (all.find((o) => o.id === values[0])?.label ?? "1 canal")
        : `${values.length} canais`;

  return (
    <div className="space-y-1.5">
      <DropdownPrimitive.Root modal={false}>
        <DropdownPrimitive.Trigger asChild suppressHydrationWarning>
          <button
            type="button"
            id={id}
            className={cn(FILTER_FIELD_TRIGGER_CLASS, "group")}
          >
            <span className="shrink-0 font-semibold text-[var(--text-muted)]">Canais:</span>
            <span className="min-w-0 flex-1 truncate text-left text-[var(--text-primary)]">
              {isLoading ? "Carregando…" : triggerLabel}
            </span>
            <IconChevronDown
              size={15}
              className="ml-auto shrink-0 text-current opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </button>
        </DropdownPrimitive.Trigger>
        <DropdownPrimitive.Portal container={portalContainer ?? undefined}>
          <DropdownPrimitive.Content
            align="start"
            sideOffset={6}
            className={cn(
              FILTER_FIELD_MENU_CLASS,
              "min-w-[var(--radix-dropdown-menu-trigger-width)]",
            )}
          >
            {all.length === 0 && !isLoading ? (
              <p className="px-2.5 py-2 text-[12px] text-[var(--text-muted)]">
                {kinds === "email"
                  ? "Nenhuma conta de e-mail conectada. Conecte uma em E-mail."
                  : "Nenhum canal ativo. Conecte um WhatsApp em Canais ou uma conta em E-mail."}
              </p>
            ) : (
              <>
                <DropdownPrimitive.CheckboxItem
                  checked={selectAll}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => (selectAll ? setNone() : setAll())}
                  className={FILTER_FIELD_ITEM_CLASS}
                >
                  <CheckBox checked={selectAll} />
                  <span className="min-w-0 flex-1 truncate">Selecionar tudo</span>
                </DropdownPrimitive.CheckboxItem>
                {groups.map((g) => (
                  <DropdownPrimitive.Group key={g.key}>
                    {groups.length > 1 ? (
                      <DropdownPrimitive.Label className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {g.label}
                      </DropdownPrimitive.Label>
                    ) : null}
                    {g.options.map((o) => {
                      const checked = checkedIds.includes(o.id);
                      return (
                        <DropdownPrimitive.CheckboxItem
                          key={o.id}
                          checked={checked}
                          onSelect={(e) => e.preventDefault()}
                          onCheckedChange={() => toggle(o.id)}
                          className={FILTER_FIELD_ITEM_CLASS}
                        >
                          <CheckBox checked={checked} />
                          <ChannelKindIcon kind={o.kind ?? g.key} />
                          <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        </DropdownPrimitive.CheckboxItem>
                      );
                    })}
                  </DropdownPrimitive.Group>
                ))}
              </>
            )}
          </DropdownPrimitive.Content>
        </DropdownPrimitive.Portal>
      </DropdownPrimitive.Root>
      {scope === "selected" && values.length === 0 ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">{emptyHint}</p>
      ) : null}
    </div>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        checked
          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
          : "border-[var(--glass-border)]",
      )}
    >
      {checked ? <IconCheck size={12} /> : null}
    </span>
  );
}
