"use client";

/**
 * Resposta por áudio: o agente manda a própria resposta como mensagem de voz
 * (voz gerada pelo provedor). A chave é do agente e nunca volta para a tela;
 * a voz e as regras de uso ficam na configuração.
 */

import * as React from "react";
import { IconKey, IconLoader2, IconPlayerPlay, IconRefresh } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { SURFACE } from "./ui";

type VoiceOption = { id: string; name: string; language: string | null };

type VoiceSettings = { stability: number; similarityBoost: number; style: number; speakerBoost: boolean; speed: number };

/** Modelos de voz e o padrão de cada um (os mesmos do servidor). */
const VOICE_MODELS: Array<{ id: string; label: string; hint: string; defaults: VoiceSettings }> = [
  {
    id: "eleven_flash_v2_5",
    label: "Flash v2.5",
    hint: "O mais rápido. Bom para respostas curtas.",
    defaults: { stability: 0.4, similarityBoost: 0.75, style: 0, speakerBoost: true, speed: 1 },
  },
  {
    id: "eleven_multilingual_v2",
    label: "Multilingual v2",
    hint: "Mais natural e com mais entonação; demora um pouco mais.",
    defaults: { stability: 0.4, similarityBoost: 0.75, style: 0.3, speakerBoost: true, speed: 1 },
  },
  {
    id: "eleven_v3",
    label: "v3",
    hint: "O mais expressivo. O agente pode marcar o jeito de falar, como [animada] ou [confiante]; as marcações não aparecem no texto escrito.",
    defaults: { stability: 0.5, similarityBoost: 0.75, style: 0, speakerBoost: true, speed: 1 },
  },
];

export const VOICE_DEFAULTS = {
  enabled: false,
  provider: "elevenlabs",
  model: "eleven_flash_v2_5",
  mode: "mirror",
  maxChars: 450,
  maxPerConversation: 4,
  dailyCharCap: 20000,
} as const;

/** Chave completa o bastante para salvar (o salvamento automático não grava chave pela metade). */
export function looksLikeVoiceKey(raw: string): boolean {
  return raw.trim().length >= 16 && !/\s/.test(raw.trim());
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function VoiceStep({
  agentId,
  config,
  voiceKey,
  hasSavedKey,
  savedHint,
  onVoiceKeyChange,
  onChange,
}: {
  agentId: string;
  config: Record<string, unknown>;
  voiceKey: string;
  hasSavedKey: boolean;
  savedHint: string | null;
  onVoiceKeyChange: (v: string) => void;
  onChange: (path: string, value: unknown) => void;
}) {
  const voice = { ...VOICE_DEFAULTS, ...((config.voice as Record<string, unknown> | undefined) ?? {}) } as Record<string, unknown>;
  const set = (patch: Record<string, unknown>) => onChange("voice", { ...voice, ...patch });
  const enabled = voice.enabled === true;
  const mode = voice.mode === "agent" ? "agent" : "mirror";
  const voiceId = typeof voice.voiceId === "string" ? voice.voiceId : "";
  const model = VOICE_MODELS.find((m) => m.id === voice.model) ?? VOICE_MODELS[0];
  // Ajuste vazio = padrão do modelo escolhido.
  const own = (voice.settings as Partial<VoiceSettings> | undefined) ?? {};
  const setting = <K extends keyof VoiceSettings>(key: K): VoiceSettings[K] => (own[key] ?? model.defaults[key]) as VoiceSettings[K];
  const setSetting = (patch: Partial<VoiceSettings>) => set({ settings: { ...own, ...patch } });
  const hasOwnSettings = Object.keys(own).length > 0;
  // O v3 só tem três níveis de estabilidade.
  const stabilityStep = model.id === "eleven_v3" ? 0.5 : 0.05;

  const [editingKey, setEditingKey] = React.useState(false);
  const [voices, setVoices] = React.useState<VoiceOption[] | null>(null);
  const [loadingVoices, setLoadingVoices] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const loadVoices = async () => {
    setLoadingVoices(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/voice`);
      const data = await parseApiResponse<{ voices: VoiceOption[] }>(res, "Não foi possível carregar as vozes.");
      setVoices(data.voices ?? []);
      if ((data.voices ?? []).length === 0) setMessage("A conta do provedor não tem vozes disponíveis.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível carregar as vozes.");
    } finally {
      setLoadingVoices(false);
    }
  };

  const preview = async () => {
    if (!voiceId) return;
    setPreviewing(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, model: model.id, settings: own }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Não foi possível gerar a prévia.");
      }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível gerar a prévia.");
    } finally {
      setPreviewing(false);
    }
  };

  const showKeyInput = editingKey || !hasSavedKey;
  const options = voices ?? [];
  const knownVoice = options.some((o) => o.id === voiceId);

  return (
    <section className={cn(SURFACE, "space-y-5 p-5 sm:p-6")}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold leading-tight tracking-tight">Resposta por áudio</h3>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Ele manda a resposta como mensagem de voz, falada de um jeito mais coloquial, com uma linha escrita junto. Valor, data e link vão
            sempre também por escrito. Se o áudio não puder sair, a resposta vai em texto.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={(v) => set({ enabled: v })} aria-label="Ligar resposta por áudio" />
      </div>

      {enabled && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="ag-voice-key" className="flex items-center gap-1.5">
              <IconKey className="size-3.5" /> Chave do provedor de voz (ElevenLabs)
            </Label>
            {showKeyInput ? (
              <Input
                id="ag-voice-key"
                type="password"
                autoComplete="off"
                value={voiceKey}
                onChange={(e) => onVoiceKeyChange(e.target.value)}
                placeholder="Cole a chave da conta"
              />
            ) : (
              <div className="flex h-10 items-center justify-between rounded-lg border border-border bg-white px-3 text-sm v2-dark:bg-card">
                <span className="tabular-nums">•••• {savedHint}</span>
                <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setEditingKey(true)}>
                  Trocar
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Fica guardada cifrada e não aparece de novo. Sem ela não há áudio.</p>
          </div>

          <Row label="Voz" hint="Carregue as vozes da conta para escolher, ou cole o identificador da voz.">
            <div className="flex flex-wrap items-center gap-2">
              {options.length > 0 ? (
                <Select value={knownVoice ? voiceId : ""} onValueChange={(v) => set({ voiceId: v })}>
                  <SelectTrigger className="min-w-[220px] flex-1">
                    <SelectValue placeholder="Escolha a voz" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                        {o.language ? ` · ${o.language}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input className="min-w-[220px] flex-1" value={voiceId} onChange={(e) => set({ voiceId: e.target.value })} placeholder="Identificador da voz" />
              )}
              <Button type="button" variant="outline" size="sm" onClick={loadVoices} disabled={loadingVoices || !hasSavedKey} className="gap-1">
                {loadingVoices ? <IconLoader2 className="size-4 animate-spin" /> : <IconRefresh className="size-4" />}
                Carregar vozes
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={preview} disabled={previewing || !voiceId || !hasSavedKey} className="gap-1">
                {previewing ? <IconLoader2 className="size-4 animate-spin" /> : <IconPlayerPlay className="size-4" />}
                Ouvir
              </Button>
            </div>
            {!hasSavedKey && <p className="text-xs text-muted-foreground">Salve a chave para carregar as vozes e ouvir a prévia.</p>}
            {message && <p className="text-xs text-amber-600">{message}</p>}
          </Row>

          <Row label="Modelo de voz" hint={model.hint}>
            <Select value={model.id} onValueChange={(v) => set({ model: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <details className="rounded-xl border border-border/70 p-4">
            <summary className="cursor-pointer text-sm font-semibold">Opções avançadas da voz</summary>
            <div className="mt-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Sem mexer, vale o padrão do modelo escolhido. Use “Ouvir” para comparar antes de salvar.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Row label="Estabilidade" hint="Menor: mais variação e emoção. Maior: mais uniforme e monótona.">
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={stabilityStep}
                    value={setting("stability")}
                    onChange={(e) => setSetting({ stability: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
                  />
                </Row>
                <Row label="Semelhança com a voz" hint="Quanto a fala se prende ao timbre original da voz (0 a 1).">
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={setting("similarityBoost")}
                    onChange={(e) => setSetting({ similarityBoost: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
                  />
                </Row>
                <Row label="Estilo" hint="Exagero do estilo da voz (0 a 1). Acima de 0 a geração pode demorar mais.">
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={setting("style")}
                    onChange={(e) => setSetting({ style: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
                  />
                </Row>
                <Row label="Velocidade" hint="De 0,7 (mais devagar) a 1,2 (mais rápido). 1 é o normal.">
                  <Input
                    type="number"
                    min={0.7}
                    max={1.2}
                    step={0.05}
                    value={setting("speed")}
                    onChange={(e) => setSetting({ speed: Math.min(1.2, Math.max(0.7, Number(e.target.value) || 1)) })}
                  />
                </Row>
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Reforço do locutor</span>
                  <span className="block text-xs text-muted-foreground">Deixa a fala mais parecida com a voz original; a geração demora um pouco mais.</span>
                </span>
                <Switch checked={setting("speakerBoost")} onCheckedChange={(v) => setSetting({ speakerBoost: v })} aria-label="Reforço do locutor" />
              </label>
              {hasOwnSettings && (
                <Button type="button" variant="ghost" size="sm" onClick={() => set({ settings: undefined })}>
                  Voltar ao padrão do modelo
                </Button>
              )}
            </div>
          </details>

          <div className="space-y-2">
            <Label>Quando ele responde por áudio</Label>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Quando ele responde por áudio">
              {[
                { value: "mirror", title: "Só para quem mandou áudio", text: "Responde no mesmo formato do cliente. Não precisa pedir permissão." },
                { value: "agent", title: "O agente decide", text: "Além disso, usa áudio quando as orientações abaixo indicarem. Pede permissão antes do primeiro." },
              ].map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === o.value}
                  onClick={() => set({ mode: o.value })}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    mode === o.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}
                >
                  <span className="block text-sm font-semibold">{o.title}</span>
                  <span className="block text-xs text-muted-foreground">{o.text}</span>
                </button>
              ))}
            </div>
          </div>

          {mode === "agent" && (
            <>
              <Row label="Orientações de uso" hint="Em que situações usar áudio e em quais não usar. O agente lê isto a cada resposta.">
                <Textarea
                  rows={5}
                  value={(voice.guidance as string) ?? ""}
                  onChange={(e) => set({ guidance: e.target.value })}
                  placeholder="Ex.: use para explicar algo que pede mais de três frases; não use para cumprimentar nem para responder objeção."
                />
              </Row>
              <Row label="Pergunta de permissão" hint="Feita uma vez, antes do primeiro áudio, a quem não mandou áudio. Quem recusar segue só em texto.">
                <Input
                  value={(voice.permissionQuestion as string) ?? ""}
                  onChange={(e) => set({ permissionQuestion: e.target.value })}
                  placeholder="Posso te responder por áudio? É rapidinho."
                />
              </Row>
            </>
          )}

          <Row label="Linha escrita que acompanha o áudio" hint="Usada quando a resposta não tem valor, data nem link. Quando tem, vai só o dado por escrito, sem repetir a frase do áudio.">
            <Input
              value={(voice.companionText as string) ?? ""}
              onChange={(e) => set({ companionText: e.target.value })}
              placeholder="Te respondi por áudio."
            />
          </Row>

          <div className="grid gap-4 sm:grid-cols-3">
            <Row label="Tamanho máximo do áudio" hint="Em caracteres falados (cerca de 15 por segundo). Acima disso, vai em texto.">
              <Input
                type="number"
                min={80}
                max={1200}
                value={Number(voice.maxChars) || VOICE_DEFAULTS.maxChars}
                onChange={(e) => set({ maxChars: Math.min(1200, Math.max(80, Math.round(Number(e.target.value) || VOICE_DEFAULTS.maxChars))) })}
              />
            </Row>
            <Row label="Áudios por conversa" hint="Depois disso, só texto nessa conversa.">
              <Input
                type="number"
                min={1}
                max={30}
                value={Number(voice.maxPerConversation) || VOICE_DEFAULTS.maxPerConversation}
                onChange={(e) => set({ maxPerConversation: Math.min(30, Math.max(1, Math.round(Number(e.target.value) || VOICE_DEFAULTS.maxPerConversation))) })}
              />
            </Row>
            <Row label="Teto diário de voz" hint="Caracteres falados por dia neste agente. 0 = sem teto.">
              <Input
                type="number"
                min={0}
                value={Number.isFinite(Number(voice.dailyCharCap)) ? Number(voice.dailyCharCap) : VOICE_DEFAULTS.dailyCharCap}
                onChange={(e) => set({ dailyCharCap: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              />
            </Row>
          </div>
          <p className="text-xs text-muted-foreground">
            Só há áudio com o agente em “Responder sozinho”. No modo “Sugerir para a equipe” a resposta fica em texto.
          </p>
        </div>
      )}
    </section>
  );
}
