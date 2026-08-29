"use client";

import { apiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { pageHeaderDescriptionClass, pageHeaderTitleClass } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

import { useCampaignDraft } from "./use-campaign-draft";

type BuilderStep = 0 | 1 | 2 | 3;
const STEPS = ["Tipo de impulso", "Automação", "Leads", "Configuração"] as const;

type Channel = { id: string; name: string; provider: string; status: string };
type Segment = { id: string; name: string };
type Automation = { id: string; name: string; active: boolean };

export function CampaignBuilderWizard() {
  const router = useRouter();
  const [step, setStep] = useState<BuilderStep>(0);
  const [draftId, setDraftId] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [type, setType] = useState<"TEMPLATE" | "TEXT" | "AUTOMATION">("TEMPLATE");
  const [channelId, setChannelId] = useState("");
  const [useLastConversationChannel, setUseLastConversationChannel] =
    useState(false);
  const [segmentId, setSegmentId] = useState("");
  const [automationId, setAutomationId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("pt_BR");
  const [textContent, setTextContent] = useState("");
  const [sendRate, setSendRate] = useState(80);
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { saveMutation, previewMutation, launchMutation } = useCampaignDraft(draftId);

  const channelsQuery = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/channels"));
      const data = await res.json();
      return (data.channels ?? []) as Channel[];
    },
  });

  const segmentsQuery = useQuery({
    queryKey: ["segments"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/segments"));
      const data = await res.json();
      return (data.segments ?? []) as Segment[];
    },
  });

  const automationsQuery = useQuery({
    queryKey: ["automations-list"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/automations"));
      const data = await res.json();
      return (data.automations ?? data.items ?? []) as Automation[];
    },
    enabled: type === "AUTOMATION",
  });

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(type && (useLastConversationChannel || channelId));
    if (step === 1) return type !== "AUTOMATION" || Boolean(automationId);
    if (step === 2) return Boolean(segmentId);
    if (step === 3) {
      if (!name.trim()) return false;
      if (type === "TEMPLATE" && !templateName) return false;
      if (type === "TEXT" && !textContent.trim()) return false;
      return true;
    }
    return false;
  }, [automationId, channelId, name, segmentId, step, templateName, textContent, type, useLastConversationChannel]);

  async function upsertDraft() {
    const payload = {
      id: draftId,
      patch: {
        name: name.trim() || "Nova campanha",
        type,
        channelId: useLastConversationChannel ? undefined : channelId,
        useLastConversationChannel,
        segmentId,
        automationId: automationId || undefined,
        templateName: templateName || undefined,
        templateLanguage,
        textContent: textContent || undefined,
        sendRate,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      },
    };
    const result = await saveMutation.mutateAsync(payload);
    if (result.data.id) setDraftId(result.data.id);
    return result.data.id;
  }

  async function handleNext() {
    setError(null);
    try {
      const id = await upsertDraft();
      if (step < 3) setStep((prev) => (prev + 1) as BuilderStep);
      if (step === 2 && id) {
        await previewMutation.mutateAsync(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar rascunho.");
    }
  }

  async function handleLaunch() {
    setError(null);
    try {
      const id = await upsertDraft();
      if (!id) throw new Error("Rascunho inválido para lançamento.");
      const launched = await launchMutation.mutateAsync(id);
      router.push(`/campaigns/${launched.data.campaignId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao lançar campanha.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className={pageHeaderTitleClass}>Nova campanha (v2)</h1>
        <p className={pageHeaderDescriptionClass}>
          Fluxo em 4 passos com conformidade Meta e rollout progressivo.
        </p>
      </div>

      <div className="flex gap-1">
        {STEPS.map((label, idx) => (
          <div key={label} className="flex-1 space-y-1">
            <div className={cn("h-1 rounded-full", idx <= step ? "bg-primary" : "bg-muted")} />
            <p className={cn("text-[11px]", idx <= step ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 ? (
            <>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <SelectNative
                  className="h-10 text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                >
                  <option value="TEMPLATE">Template Meta</option>
                  <option value="TEXT">Texto livre</option>
                  <option value="AUTOMATION">Automação</option>
                </SelectNative>
              </div>
              <div className="space-y-2">
                <Label>Canal</Label>
                <SelectNative
                  className="h-10 text-sm"
                  value={useLastConversationChannel ? "__last__" : channelId}
                  onChange={(e) => {
                    if (e.target.value === "__last__") {
                      setUseLastConversationChannel(true);
                      setChannelId("");
                      return;
                    }
                    setUseLastConversationChannel(false);
                    setChannelId(e.target.value);
                  }}
                >
                  <option value="">Selecione</option>
                  <option value="__last__">Último canal conversado (por contato)</option>
                  {(channelsQuery.data ?? [])
                    .filter((c) => c.status === "CONNECTED")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </SelectNative>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <div className="space-y-2">
              <Label>Automação (obrigatória só no tipo automação)</Label>
              <SelectNative
                className="h-10 text-sm"
                value={automationId}
                onChange={(e) => setAutomationId(e.target.value)}
                disabled={type !== "AUTOMATION"}
              >
                <option value="">Sem automação</option>
                {(automationsQuery.data ?? [])
                  .filter((a) => a.active)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </SelectNative>
            </div>
          ) : null}

          {step === 2 ? (
            <>
              <div className="space-y-2">
                <Label>Segmento</Label>
                <SelectNative
                  className="h-10 text-sm"
                  value={segmentId}
                  onChange={(e) => setSegmentId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {(segmentsQuery.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectNative>
              </div>
              {previewMutation.data ? (
                <p className="rounded-md border border-emerald-300 bg-[var(--color-success-bg)] px-3 py-2 text-sm text-emerald-800">
                  Preview: {previewMutation.data.data.count} contatos elegíveis.
                </p>
              ) : null}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="space-y-2">
                <Label>Nome da campanha</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {type === "TEMPLATE" ? (
                <>
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Idioma</Label>
                    <Input value={templateLanguage} onChange={(e) => setTemplateLanguage(e.target.value)} />
                  </div>
                </>
              ) : null}
              {type === "TEXT" ? (
                <div className="space-y-2">
                  <Label>Mensagem</Label>
                  <Textarea
                    className="min-h-[120px] w-full"
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Taxa de envio (msgs/s)</Label>
                <Input
                  type="number"
                  min={1}
                  max={80}
                  value={sendRate}
                  onChange={(e) => setSendRate(Number(e.target.value || 1))}
                />
              </div>
              <div className="space-y-2">
                <Label>Agendar (opcional)</Label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            </>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1) as BuilderStep)} disabled={step === 0}>
          Voltar
        </Button>
        {step < 3 ? (
          <Button onClick={handleNext} disabled={!canContinue || saveMutation.isPending || previewMutation.isPending}>
            {saveMutation.isPending || previewMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Continuar
          </Button>
        ) : (
          <Button onClick={handleLaunch} disabled={!canContinue || launchMutation.isPending}>
            {launchMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Lançar campanha
          </Button>
        )}
      </div>
    </div>
  );
}
