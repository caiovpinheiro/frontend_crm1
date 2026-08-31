"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Check,
  FileText,
  Loader2,
  Megaphone,
  MessageSquare,
  Zap,
} from "lucide-react";

import { InputGlass } from "@/components/crm/input-glass";
import { ButtonGlass } from "@/components/crm/button-glass";
import { Textarea } from "@/components/ui/textarea";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { MultiSelectPopover } from "@/features/dashboard-v2/components/multi-select-popover";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { cn } from "@/lib/utils";

import {
  useAudienceOptions,
  useAutomations,
  useChannels,
  useCreateCampaign,
  usePreviewAudience,
  useSegments,
  useTemplates,
} from "@/features/campaigns/hooks";
import type {
  CampaignFilters,
  CampaignType,
  CreateCampaignBody,
} from "@/features/campaigns/types";

type StepId = 1 | 2 | 3;

const STEPS = [
  { id: 1, label: "Defina o básico do disparo" },
  { id: 2, label: "Escolha a audiência" },
  { id: 3, label: "Conteúdo e envio" },
] as const;

const LIFECYCLE_OPTIONS = [
  { value: "SUBSCRIBER", label: "Subscriber" },
  { value: "LEAD", label: "Lead" },
  { value: "MQL", label: "MQL" },
  { value: "SQL", label: "SQL" },
  { value: "OPPORTUNITY", label: "Opportunity" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "EVANGELIST", label: "Evangelist" },
];

const TYPE_CARDS: {
  type: CampaignType;
  title: string;
  desc: string;
  icon: typeof FileText;
}[] = [
  {
    type: "TEMPLATE",
    title: "Template Meta",
    desc: "Template aprovado via API oficial",
    icon: FileText,
  },
  {
    type: "TEXT",
    title: "Texto livre",
    desc: "Mensagem de texto (janela 24h)",
    icon: MessageSquare,
  },
  {
    type: "AUTOMATION",
    title: "Automação",
    desc: "Fluxo com botões, tags e etapas",
    icon: Zap,
  },
];

function providerPill(provider: string): string {
  if (provider === "META_CLOUD_API") return "Meta Cloud API";
  if (provider === "BAILEYS_MD") return "Baileys";
  return provider;
}

export default function NewCampaignClientPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const isAuth = authStatus === "authenticated";

  const [step, setStep] = useState<StepId>(1);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const [name, setName] = useState("");
  const [type, setType] = useState<CampaignType>("TEMPLATE");
  const [channelId, setChannelId] = useState("");
  const [useLastConversationChannel, setUseLastConversationChannel] =
    useState(false);

  const [audienceMode, setAudienceMode] = useState<"filters" | "segment">(
    "filters",
  );
  const [segmentId, setSegmentId] = useState("");
  const [filters, setFilters] = useState<CampaignFilters>({ hasPhone: true });

  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("pt_BR");
  const [textContent, setTextContent] = useState("");
  const [automationId, setAutomationId] = useState("");

  const [sendRate, setSendRate] = useState(80);
  const [scheduledAt, setScheduledAt] = useState("");

  const channelsQuery = useChannels(isAuth);
  const segmentsQuery = useSegments(isAuth);
  const optionsQuery = useAudienceOptions(isAuth);

  const providerRequired =
    type === "TEXT" ? "BAILEYS_MD" : "META_CLOUD_API";

  const availableChannels = useMemo(
    () =>
      (channelsQuery.data ?? []).filter(
        (ch) =>
          ch.status === "CONNECTED" &&
          (!providerRequired || ch.provider === providerRequired),
      ),
    [channelsQuery.data, providerRequired],
  );

  const templateChannelId = useLastConversationChannel
    ? (availableChannels.find((ch) => ch.provider === "META_CLOUD_API")?.id ??
      undefined)
    : channelId || null;

  const templatesQuery = useTemplates(
    isAuth &&
      type === "TEMPLATE" &&
      (useLastConversationChannel || Boolean(channelId)),
    templateChannelId,
  );
  const automationsQuery = useAutomations(isAuth && type === "AUTOMATION");
  const preview = usePreviewAudience();
  const createMutation = useCreateCampaign();

  const tags = optionsQuery.data?.tags ?? [];
  const pipelines = optionsQuery.data?.pipelines ?? [];
  const users = optionsQuery.data?.users ?? [];
  const stagesForPipeline =
    pipelines.find((p) => p.id === filters.pipelineId)?.stages ?? [];

  const effectiveFilters = useMemo<CampaignFilters | null>(() => {
    if (audienceMode === "segment") {
      const seg = segmentsQuery.data?.find((s) => s.id === segmentId);
      return seg ? (seg.filters as CampaignFilters) : null;
    }
    return filters;
  }, [audienceMode, segmentId, segmentsQuery.data, filters]);

  useEffect(() => {
    if (step !== 2 || !effectiveFilters) return;
    const t = setTimeout(() => {
      preview.mutate(effectiveFilters);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, JSON.stringify(effectiveFilters)]);

  function canAdvance(): boolean {
    switch (step) {
      case 1:
        return (
          !!name.trim() && (useLastConversationChannel || !!channelId)
        );
      case 2:
        return audienceMode === "segment" ? !!segmentId : true;
      case 3:
        if (type === "TEMPLATE") return !!templateName;
        if (type === "TEXT") return !!textContent.trim();
        if (type === "AUTOMATION") return !!automationId;
        return true;
      default:
        return true;
    }
  }

  function closeWizard() {
    setOpen(false);
    router.push("/campaigns");
  }

  function handleCreate() {
    setError(null);
    const body: CreateCampaignBody = {
      name: name.trim(),
      type,
      useLastConversationChannel,
      sendRate,
    };
    if (!useLastConversationChannel) body.channelId = channelId;
    if (audienceMode === "segment") body.segmentId = segmentId;
    else body.filters = filters;
    if (type === "TEMPLATE") {
      body.templateName = templateName;
      body.templateLanguage = templateLanguage;
    }
    if (type === "TEXT") body.textContent = textContent;
    if (type === "AUTOMATION") body.automationId = automationId;
    if (scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();

    createMutation.mutate(body, {
      onSuccess: (data) => {
        router.push(`/campaigns/${data.campaign.number ?? data.campaign.id}`);
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : "Erro ao criar campanha."),
    });
  }

  const stepMeta = STEPS[step - 1];

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeWizard();
      }}
      size="xl"
      title="Nova campanha"
      description={`Passo ${step} de 3 · ${stepMeta.label}`}
      icon={
        <FormDialogIcon>
          <Megaphone className="size-4" />
        </FormDialogIcon>
      }
      busy={createMutation.isPending}
      footer={
        <>
          {step === 1 ? (
            <ButtonGlass
              type="button"
              variant="glass"
              className={formDialogCancelClass}
              onClick={closeWizard}
            >
              Cancelar
            </ButtonGlass>
          ) : (
            <ButtonGlass
              type="button"
              variant="glass"
              className={formDialogCancelClass}
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as StepId) : s))}
            >
              Voltar
            </ButtonGlass>
          )}
          {step < 3 ? (
            <ButtonGlass
              type="button"
              variant="primary"
              className={formDialogPrimaryClass}
              disabled={!canAdvance()}
              onClick={() => setStep((s) => (s + 1) as StepId)}
            >
              Continuar
            </ButtonGlass>
          ) : (
            <ButtonGlass
              type="button"
              variant="primary"
              className={formDialogPrimaryClass}
              disabled={createMutation.isPending || !canAdvance()}
              onClick={handleCreate}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Criar campanha
            </ButtonGlass>
          )}
        </>
      }
    >
      <div className="flex gap-1.5">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              s.id <= step ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-5">
          <div>
            <span className={formLabelClass}>Nome da campanha</span>
            <InputGlass
              className={formControlClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Black Friday 2026"
              autoFocus
            />
          </div>

          <div>
            <span className={formLabelClass}>Tipo</span>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_CARDS.map((card) => {
                const active = type === card.type;
                const Icon = card.icon;
                return (
                  <button
                    key={card.type}
                    type="button"
                    onClick={() => {
                      setType(card.type);
                      setChannelId("");
                    }}
                    className={cn(
                      "relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    {active ? (
                      <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full",
                        active
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="font-display text-[13px] font-bold text-foreground">
                      {card.title}
                    </span>
                    <span className="text-[11.5px] leading-snug text-muted-foreground">
                      {card.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className={formLabelClass}>Canal de envio</span>
            {channelsQuery.isLoading ? (
              <div className="h-12 animate-pulse rounded-xl bg-muted" />
            ) : (
              <div className="space-y-2">
                <ChannelRow
                  selected={useLastConversationChannel}
                  title="Último canal conversado"
                  description="Usa o canal da última conversa de cada contato."
                  pill="Por contato"
                  onClick={() => {
                    setUseLastConversationChannel(true);
                    setChannelId("");
                  }}
                />
                {availableChannels.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    Nenhum canal compatível conectado. Conecte um canal WhatsApp
                    em Configurações → Canais.
                  </p>
                ) : (
                  availableChannels.map((ch) => (
                    <ChannelRow
                      key={ch.id}
                      selected={!useLastConversationChannel && channelId === ch.id}
                      title={ch.name}
                      pill={providerPill(ch.provider)}
                      onClick={() => {
                        setUseLastConversationChannel(false);
                        setChannelId(ch.id);
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <TypePickCard
              active={audienceMode === "filters"}
              title="Filtros"
              desc="Combinar critérios manualmente"
              onClick={() => setAudienceMode("filters")}
            />
            <TypePickCard
              active={audienceMode === "segment"}
              title="Segmento salvo"
              desc="Usar um segmento existente"
              onClick={() => setAudienceMode("segment")}
            />
          </div>

          {audienceMode === "segment" ? (
            <div>
              <span className={formLabelClass}>Segmento</span>
              <DropdownGlass
                options={(segmentsQuery.data ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                value={segmentId || undefined}
                onValueChange={setSegmentId}
                placeholder="Selecione um segmento"
                triggerClassName="w-full"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <MultiSelectPopover
                  label="Tags"
                  options={tags.map((t) => ({
                    value: t.id,
                    label: t.name,
                    color: t.color,
                  }))}
                  selected={filters.tagIds ?? []}
                  onChange={(next) =>
                    setFilters((f) => ({
                      ...f,
                      tagIds: next.length ? next : undefined,
                    }))
                  }
                />
                <MultiSelectPopover
                  label="Responsável"
                  options={users.map((u) => ({ value: u.id, label: u.name }))}
                  selected={filters.dealOwnerId ? [filters.dealOwnerId] : []}
                  onChange={(next) =>
                    setFilters((f) => ({
                      ...f,
                      dealOwnerId: next[next.length - 1],
                    }))
                  }
                />
                <MultiSelectPopover
                  label="Pipeline"
                  options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
                  selected={filters.pipelineId ? [filters.pipelineId] : []}
                  onChange={(next) =>
                    setFilters((f) => ({
                      ...f,
                      pipelineId: next[next.length - 1],
                      stageIds: undefined,
                    }))
                  }
                />
                {filters.pipelineId ? (
                  <MultiSelectPopover
                    label="Etapas"
                    options={stagesForPipeline.map((s) => ({
                      value: s.id,
                      label: s.name,
                    }))}
                    selected={filters.stageIds ?? []}
                    onChange={(next) =>
                      setFilters((f) => ({
                        ...f,
                        stageIds: next.length ? next : undefined,
                      }))
                    }
                  />
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className={formLabelClass}>Estágio de vida</span>
                  <DropdownGlass
                    options={[
                      { value: "", label: "Todos" },
                      ...LIFECYCLE_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      })),
                    ]}
                    value={filters.lifecycleStage ?? ""}
                    onValueChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        lifecycleStage: v || undefined,
                      }))
                    }
                    triggerClassName="w-full"
                  />
                </div>
                <div>
                  <span className={formLabelClass}>Criado desde</span>
                  <InputGlass
                    className={formControlClass}
                    type="date"
                    value={filters.createdAfter ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        createdAfter: e.target.value || undefined,
                      }))
                    }
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-card p-3 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={!!filters.hasPhone}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      hasPhone: e.target.checked || undefined,
                    }))
                  }
                />
                Apenas contatos com telefone (obrigatório p/ WhatsApp)
              </label>
            </div>
          )}

          <AudiencePreview
            loading={preview.isPending}
            count={preview.data?.count}
            sample={preview.data?.sample}
          />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-5">
          {type === "TEMPLATE" ? (
            <>
              <div>
                <span className={formLabelClass}>Template aprovado (Meta)</span>
                {templatesQuery.isLoading ? (
                  <div className="h-11 animate-pulse rounded-xl bg-muted" />
                ) : (
                  <DropdownGlass
                    options={(templatesQuery.data ?? [])
                      .filter((t) => t.status === "APPROVED")
                      .map((t) => ({
                        value: t.name,
                        label: `${t.name} (${t.language})`,
                      }))}
                    value={templateName || undefined}
                    onValueChange={(v) => {
                      setTemplateName(v);
                      const tpl = (templatesQuery.data ?? []).find(
                        (t) => t.name === v,
                      );
                      if (tpl?.language) setTemplateLanguage(tpl.language);
                    }}
                    placeholder="Selecione um template"
                    triggerClassName="w-full"
                  />
                )}
              </div>
              <div>
                <span className={formLabelClass}>Idioma</span>
                <InputGlass
                  className={formControlClass}
                  value={templateLanguage}
                  onChange={(e) => setTemplateLanguage(e.target.value)}
                  placeholder="pt_BR"
                />
              </div>
            </>
          ) : type === "AUTOMATION" ? (
            <div>
              <span className={formLabelClass}>Automação</span>
              {automationsQuery.isLoading ? (
                <div className="h-11 animate-pulse rounded-xl bg-muted" />
              ) : (
                <>
                  <DropdownGlass
                    options={(automationsQuery.data ?? [])
                      .filter((a) => a.active)
                      .map((a) => ({ value: a.id, label: a.name }))}
                    value={automationId || undefined}
                    onValueChange={setAutomationId}
                    placeholder="Selecione uma automação ativa"
                    triggerClassName="w-full"
                    searchable
                    searchPlaceholder="Buscar automação…"
                  />
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    {useLastConversationChannel
                      ? "Cada contato entra no fluxo pelo canal da última conversa."
                      : "Cada contato da audiência entra no fluxo ao receber o disparo. O envio sai pelo canal escolhido no passo 1."}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div>
              <span className={formLabelClass}>Mensagem</span>
              <Textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Digite a mensagem que será enviada..."
                className="min-h-[140px] w-full rounded-xl border-border bg-card"
              />
            </div>
          )}

          <div>
            <span className={formLabelClass}>
              Velocidade de envio — {sendRate} msgs/s
            </span>
            <input
              type="range"
              min={1}
              max={type === "TEXT" ? 20 : 80}
              value={sendRate}
              onChange={(e) => setSendRate(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div>
            <span className={formLabelClass}>Agendamento (opcional)</span>
            <InputGlass
              className={formControlClass}
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Deixe vazio para enviar imediatamente ao lançar.
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            <ReviewRow label="Nome" value={name} />
            <ReviewRow
              label="Tipo"
              value={
                type === "TEMPLATE"
                  ? "Template Meta"
                  : type === "AUTOMATION"
                    ? "Automação"
                    : "Texto livre"
              }
            />
            <ReviewRow
              label="Canal"
              value={
                useLastConversationChannel
                  ? "Último canal conversado"
                  : (availableChannels.find((c) => c.id === channelId)?.name ??
                    "")
              }
            />
            <ReviewRow
              label="Audiência"
              value={
                preview.data
                  ? `${preview.data.count} contatos`
                  : audienceMode === "segment"
                    ? "Segmento selecionado"
                    : "Filtros ad-hoc"
              }
            />
            {type === "TEMPLATE" ? (
              <ReviewRow label="Template" value={templateName} />
            ) : null}
            {type === "AUTOMATION" ? (
              <ReviewRow
                label="Automação"
                value={
                  (automationsQuery.data ?? []).find((a) => a.id === automationId)
                    ?.name ?? ""
                }
              />
            ) : null}
            <ReviewRow
              label="Agendamento"
              value={
                scheduledAt
                  ? new Date(scheduledAt).toLocaleString("pt-BR")
                  : "Imediato"
              }
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-[12.5px] text-destructive">{error}</p>
      ) : null}
    </FormDialog>
  );
}

function ChannelRow({
  selected,
  title,
  description,
  pill,
  onClick,
}: {
  selected: boolean;
  title: string;
  description?: string;
  pill: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/40",
      )}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-transparent",
        )}
      >
        {selected ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[13px] font-semibold text-foreground">
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {pill}
      </span>
    </button>
  );
}

function TypePickCard({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/40",
      )}
    >
      {active ? (
        <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" strokeWidth={3} />
        </span>
      ) : null}
      <span className="font-display text-[13px] font-bold text-foreground">
        {title}
      </span>
      <span className="text-[11.5px] text-muted-foreground">{desc}</span>
    </button>
  );
}

function AudiencePreview({
  loading,
  count,
  sample,
}: {
  loading: boolean;
  count?: number;
  sample?: { id: string; name: string; phone: string }[];
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-[12.5px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Contando contatos...
      </div>
    );
  }
  if (count === undefined) return null;
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        count > 0
          ? "border-border bg-card"
          : "border-destructive/30 bg-destructive/5",
      )}
    >
      <p className="font-display text-[15px] font-bold text-foreground">
        {count.toLocaleString("pt-BR")} contato{count === 1 ? "" : "s"} na
        audiência
      </p>
      {sample && sample.length > 0 ? (
        <div className="mt-2 space-y-0.5">
          {sample.slice(0, 5).map((c) => (
            <p key={c.id} className="text-[11.5px] text-muted-foreground">
              {c.name} {c.phone ? `· ${c.phone}` : ""}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span className="text-right font-display text-[12.5px] font-semibold text-foreground">
        {value || "—"}
      </span>
    </div>
  );
}
