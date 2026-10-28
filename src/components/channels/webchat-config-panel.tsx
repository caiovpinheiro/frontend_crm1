"use client";

/**
 * Painel de configuração do canal WEBCHAT (widget no site do cliente).
 *
 * Grava `Channel.config` (shape em `@/features/webchat-widget/types`) via
 * `PUT /api/channels/[id]` — o mesmo endpoint do `MetaConfigPanel`; mandamos
 * o objeto completo (com `publicKey`).
 *
 * Marca: por padrão o widget herda a cor e o logo da organização
 * (`channel.webchatDefaults`); `theme.primary` / `theme.avatarUrl` = `null`
 * no config significa "herdar".
 * Preview ao vivo: o próprio widget em `/webchat/{publicKey}?preview=1`
 * (mesma origem do CRM), recebendo a config não salva por `postMessage`.
 *
 * Webchat v2 (`config.v2` + chaves secretas): uma seção por frente em
 * `./webchat/{identity,context,s2s}-section.tsx`; este arquivo só guarda o
 * estado e manda `v2` no PUT. Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9.
 */
import {
  IconCheck as Check,
  IconCopy as Copy,
  IconExternalLink as ExternalLink,
  IconLoader2 as Loader2,
  IconPlus as Plus,
  IconX as X,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { WEBCHAT_NS, type PreviewView } from "@/features/webchat-widget/protocol";
import {
  WEBCHAT_DEFAULT_PRIMARY,
  WEBCHAT_WEEKDAYS,
  normalizeChannelConfig,
  safeAvatarUrl,
  safeHexColor,
  type WebchatBusinessHours,
  type WebchatChannelConfig,
  type WebchatIdentification,
  type WebchatWeekday,
} from "@/features/webchat-widget/types";
import { apiUrl } from "@/lib/api";
import { isSingleHostCrm } from "@/lib/tenant-host";
import { getTenantBaseDomain, getTenantProtocol } from "@/lib/tenant-url";
import { cn } from "@/lib/utils";
import { normalizeOrigin } from "@/lib/webchat-origin";

import { ChannelPipelineSelect } from "./channel-pipeline-select";
import type { ApiChannel } from "./types";
import { parseChannelConfigRecord } from "./types";
import { WebchatContextSection } from "./webchat/context-section";
import { WebchatIdentitySection } from "./webchat/identity-section";
import { WebchatS2SSection } from "./webchat/s2s-section";
import {
  prepareWebchatV2ForSave,
  readWebchatSecretsStatus,
  readWebchatV2Config,
  type WebchatSecretsStatus,
  type WebchatV2Config,
} from "./webchat/v2-config";

const IDENTIFICATION_OPTIONS: { value: WebchatIdentification; label: string }[] = [
  { value: "none", label: "Não pedir (visitante começa anônimo)" },
  { value: "name", label: "Nome" },
  { value: "name_email", label: "Nome e e-mail" },
  { value: "name_phone", label: "Nome e telefone" },
];

const WEEKDAY_LABEL: Record<WebchatWeekday, string> = {
  mon: "Seg",
  tue: "Ter",
  wed: "Qua",
  thu: "Qui",
  fri: "Sex",
  sat: "Sáb",
  sun: "Dom",
};

const DEFAULT_HOURS: WebchatBusinessHours = {
  tz: "America/Sao_Paulo",
  week: {
    mon: [["09:00", "18:00"]],
    tue: [["09:00", "18:00"]],
    wed: [["09:00", "18:00"]],
    thu: [["09:00", "18:00"]],
    fri: [["09:00", "18:00"]],
  },
};

/**
 * Origem pública do widget (`https://bwipo.com`). Em dev single-host
 * (localhost / easypanel) é a própria origem da página.
 */
export function webchatPublicOrigin(): string {
  if (typeof window !== "undefined" && isSingleHostCrm(window.location.hostname)) {
    return window.location.origin;
  }
  return `${getTenantProtocol()}://${getTenantBaseDomain()}`;
}

export function webchatSnippet(publicKey: string, origin = webchatPublicOrigin()): string {
  return `<script async src="${origin}/webchat/embed.js?v=1" data-key="${publicKey}"></script>`;
}

export function webchatHostedUrl(publicKey: string, origin = webchatPublicOrigin()): string {
  return `${origin}/webchat/${publicKey}`;
}

function channelPublicKey(channel: ApiChannel): string | null {
  if (channel.publicKey) return channel.publicKey;
  const cfg = parseChannelConfigRecord(channel.config);
  return typeof cfg.publicKey === "string" && cfg.publicKey ? cfg.publicKey : null;
}

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input
          readOnly
          value={value}
          className={cn("text-xs", mono && "font-mono")}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="px-3"
          aria-label={`Copiar ${label}`}
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? (
            <Check className="size-3.5 text-[var(--color-success)]" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

/** O config gravado define a cor/avatar próprios (senão herda da organização). */
function rawThemeOverrides(config: unknown): { primary: boolean; avatar: boolean } {
  const theme = parseChannelConfigRecord(parseChannelConfigRecord(config).theme);
  const has = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  return { primary: has(theme.primary), avatar: has(theme.avatarUrl) };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      {children}
    </p>
  );
}

export type WebchatConfigPanelProps = {
  channel: ApiChannel;
  onSaved?: () => void;
};

export function WebchatConfigPanel({ channel, onSaved }: WebchatConfigPanelProps) {
  const queryClient = useQueryClient();
  const initial = useMemo(() => normalizeChannelConfig(channel.config), [channel.config]);
  const publicKey = channelPublicKey(channel);

  const [name, setName] = useState(channel.name);
  const [defaultPipelineId, setDefaultPipelineId] = useState<string | null>(
    channel.defaultPipelineId ?? null,
  );
  const [cfg, setCfg] = useState<WebchatChannelConfig>(initial);
  const [v2, setV2] = useState<WebchatV2Config>(() => readWebchatV2Config(channel.config));
  const [secrets, setSecrets] = useState<WebchatSecretsStatus>(() =>
    readWebchatSecretsStatus(channel.webchatSecrets),
  );
  const orgPrimary = channel.webchatDefaults?.primary
    ? safeHexColor(channel.webchatDefaults.primary, "")
    : "";
  const orgAvatar = safeAvatarUrl(channel.webchatDefaults?.avatarUrl);
  const overrides = useMemo(() => rawThemeOverrides(channel.config), [channel.config]);
  const [inheritPrimary, setInheritPrimary] = useState(!overrides.primary);
  const [inheritAvatar, setInheritAvatar] = useState(!overrides.avatar);
  /** Tema que o visitante vê (herança resolvida) — alimenta a prévia. */
  const effectiveTheme = useMemo(
    () => ({
      ...cfg.theme,
      primary: inheritPrimary ? orgPrimary || WEBCHAT_DEFAULT_PRIMARY : cfg.theme.primary,
      avatarUrl: inheritAvatar ? orgAvatar : safeAvatarUrl(cfg.theme.avatarUrl),
    }),
    [cfg.theme, inheritPrimary, inheritAvatar, orgPrimary, orgAvatar],
  );
  const [originDraft, setOriginDraft] = useState("");
  const [originError, setOriginError] = useState<string | null>(null);
  const [previewView, setPreviewView] = useState<PreviewView>("chat");
  const [saved, setSaved] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const patchTheme = (p: Partial<WebchatChannelConfig["theme"]>) =>
    setCfg((c) => ({ ...c, theme: { ...c.theme, ...p } }));

  const addOrigin = () => {
    const o = normalizeOrigin(originDraft);
    if (!o) {
      setOriginError("Informe uma origem válida, ex.: https://www.seusite.com.br");
      return;
    }
    setOriginError(null);
    setOriginDraft("");
    setCfg((c) =>
      c.allowedOrigins.includes(o) ? c : { ...c, allowedOrigins: [...c.allowedOrigins, o] },
    );
  };

  const hoursEnabled = Boolean(cfg.businessHours);
  const setDay = (day: WebchatWeekday, range: [string, string] | null) =>
    setCfg((c) => {
      const bh = c.businessHours ?? DEFAULT_HOURS;
      const week = { ...bh.week };
      if (range) week[day] = [range];
      else delete week[day];
      return { ...c, businessHours: { ...bh, week } };
    });

  // ── Preview ao vivo ───────────────────────────────────────────────────────
  const postPreview = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      {
        ns: WEBCHAT_NS,
        type: "preview-config",
        view: previewView,
        config: {
          identification: cfg.identification,
          greeting: cfg.greeting,
          offlineMessage: cfg.offlineMessage,
          theme: effectiveTheme,
        },
      },
      window.location.origin,
    );
  }, [cfg, effectiveTheme, previewView]);

  useEffect(() => {
    postPreview();
  }, [postPreview]);

  // O iframe avisa quando montou (`hello`) — reenvia a config atual.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as { ns?: string; type?: string } | null;
      if (d?.ns === WEBCHAT_NS && d.type === "hello") postPreview();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [postPreview]);

  // ── Salvar ────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const current = parseChannelConfigRecord(channel.config);
      const nextConfig: Record<string, unknown> = {
        ...current,
        ...cfg,
        ...(publicKey ? { publicKey } : {}),
        greeting: cfg.greeting.trim(),
        offlineMessage: cfg.offlineMessage.trim(),
        theme: {
          ...cfg.theme,
          // `null` = herdar da organização (contrato do backend).
          primary: inheritPrimary ? null : safeHexColor(cfg.theme.primary),
          title: cfg.theme.title.trim() || "Atendimento",
          avatarUrl: inheritAvatar ? null : cfg.theme.avatarUrl?.trim() || null,
        },
        businessHours: cfg.businessHours ?? null,
        v2: prepareWebchatV2ForSave(v2),
      };
      const res = await fetch(apiUrl(`/api/channels/${channel.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          config: nextConfig,
          defaultPipelineId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Erro ao salvar.");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
      void queryClient.invalidateQueries({ queryKey: ["channel", channel.id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    },
  });

  const origin = webchatPublicOrigin();
  const v2Props = {
    channelId: channel.id,
    publicKey,
    value: v2,
    onChange: setV2,
    secrets,
    onSecretsChange: (next: WebchatSecretsStatus) => {
      setSecrets(next);
      // A lista de canais traz o status das chaves: recarrega em segundo plano.
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        {/* Instalação */}
        <section className="space-y-3">
          <SectionTitle>Instalação</SectionTitle>
          {publicKey ? (
            <>
              <CopyRow label="Código para o site (antes do &lt;/body&gt;)" value={webchatSnippet(publicKey, origin)} />
              <div className="space-y-1.5">
                <CopyRow label="Página hospedada" value={webchatHostedUrl(publicKey, origin)} />
                <a
                  href={webchatHostedUrl(publicKey, origin)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand-primary)] hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  Abrir página do chat
                </a>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              A chave pública do widget ainda não foi gerada para este canal. Salve
              a configuração ou recarregue a página em instantes.
            </p>
          )}
        </section>

        <Separator />

        {/* Identificação do canal */}
        <section className="space-y-3">
          <SectionTitle>Canal</SectionTitle>
          <div className="space-y-1.5">
            <Label htmlFor="wc-name" className="text-xs">
              Nome do canal
            </Label>
            <Input id="wc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <ChannelPipelineSelect
            id="wc-default-pipeline"
            value={defaultPipelineId}
            onChange={setDefaultPipelineId}
          />
        </section>

        <Separator />

        {/* Sites liberados */}
        <section className="space-y-3">
          <SectionTitle>Sites liberados</SectionTitle>
          <p className="text-xs text-[var(--text-muted)]">
            O widget só abre nos sites listados. Sem nenhum site, funciona apenas a
            página hospedada.
          </p>
          <div className="flex gap-2">
            <Input
              aria-label="Origem do site"
              value={originDraft}
              placeholder="https://www.seusite.com.br"
              onChange={(e) => setOriginDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOrigin();
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addOrigin}>
              <Plus className="size-3.5" />
              Adicionar
            </Button>
          </div>
          {originError ? (
            <p className="text-xs text-[var(--color-danger-text)]" role="alert">
              {originError}
            </p>
          ) : null}
          {cfg.allowedOrigins.length ? (
            <ul className="flex flex-wrap gap-2">
              {cfg.allowedOrigins.map((o) => (
                <li
                  key={o}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] py-1 ps-3 pe-1 font-mono text-xs text-[var(--text-secondary)]"
                >
                  {o}
                  <button
                    type="button"
                    className="inline-flex size-5 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)]"
                    aria-label={`Remover ${o}`}
                    onClick={() =>
                      setCfg((c) => ({
                        ...c,
                        allowedOrigins: c.allowedOrigins.filter((x) => x !== o),
                      }))
                    }
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <Separator />

        {/* Aparência */}
        <section className="space-y-3">
          <SectionTitle>Aparência</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wc-title" className="text-xs">
                Título
              </Label>
              <Input
                id="wc-title"
                value={cfg.theme.title}
                maxLength={80}
                onChange={(e) => patchTheme({ title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wc-color" className="text-xs">
                Cor principal
              </Label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  {orgPrimary ? (
                    <span
                      aria-hidden="true"
                      className="size-4 shrink-0 rounded-full border border-[var(--glass-border)]"
                      style={{ background: orgPrimary }}
                    />
                  ) : null}
                  <span className="truncate">
                    Usar cor da organização
                    {orgPrimary ? (
                      <span className="ms-1 font-mono text-xs text-[var(--text-muted)]">
                        {orgPrimary}
                      </span>
                    ) : null}
                  </span>
                </span>
                <SwitchGlass
                  size="sm"
                  checked={inheritPrimary}
                  aria-label="Usar cor da organização"
                  onChange={(on) => {
                    setInheritPrimary(on);
                    // Ao personalizar, o seletor parte da cor da organização.
                    if (!on && !overrides.primary && orgPrimary) patchTheme({ primary: orgPrimary });
                  }}
                />
              </label>
              {!inheritPrimary ? (
                <div className="flex items-center gap-2">
                  <input
                    id="wc-color"
                    type="color"
                    value={safeHexColor(cfg.theme.primary)}
                    onChange={(e) => patchTheme({ primary: e.target.value })}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-[var(--glass-border)] bg-transparent p-1"
                  />
                  <Input
                    aria-label="Cor principal (hex)"
                    value={cfg.theme.primary}
                    maxLength={7}
                    className="font-mono text-xs"
                    onChange={(e) => patchTheme({ primary: e.target.value })}
                  />
                </div>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wc-position" className="text-xs">
                Posição da bolha
              </Label>
              <SelectNative
                id="wc-position"
                value={cfg.theme.position}
                onChange={(e) =>
                  patchTheme({ position: e.target.value === "left" ? "left" : "right" })
                }
              >
                <option value="right">Canto inferior direito</option>
                <option value="left">Canto inferior esquerdo</option>
              </SelectNative>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wc-avatar" className="text-xs">
                Avatar
              </Label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  {orgAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={orgAvatar}
                      alt=""
                      className="size-5 shrink-0 rounded-full border border-[var(--glass-border)] object-cover"
                    />
                  ) : null}
                  <span className="truncate">Usar logo da organização</span>
                </span>
                <SwitchGlass
                  size="sm"
                  checked={inheritAvatar}
                  aria-label="Usar logo da organização"
                  onChange={setInheritAvatar}
                />
              </label>
              {!inheritAvatar ? (
                <>
                  <Input
                    id="wc-avatar"
                    aria-label="Avatar (URL https da imagem)"
                    value={cfg.theme.avatarUrl ?? ""}
                    placeholder="https://…/logo.png"
                    onChange={(e) => patchTheme({ avatarUrl: e.target.value })}
                  />
                  <p className="text-xs text-[var(--text-muted)]">
                    Vazio volta a usar o logo da organização.
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <Separator />

        {/* Mensagens */}
        <section className="space-y-3">
          <SectionTitle>Mensagens</SectionTitle>
          <div className="space-y-1.5">
            <Label htmlFor="wc-greeting" className="text-xs">
              Saudação
            </Label>
            <Textarea
              id="wc-greeting"
              rows={2}
              maxLength={500}
              value={cfg.greeting}
              onChange={(e) => setCfg((c) => ({ ...c, greeting: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wc-identification" className="text-xs">
              Pedir dados antes de conversar
            </Label>
            <SelectNative
              id="wc-identification"
              value={cfg.identification}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  identification: e.target.value as WebchatIdentification,
                }))
              }
            >
              {IDENTIFICATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectNative>
            <p className="text-xs text-[var(--text-muted)]">
              O visitante pode informar nome, e-mail e telefone a qualquer momento;
              se já for um contato, as conversas são unificadas.
            </p>
          </div>
        </section>

        <Separator />

        {/* Horário */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle>Horário de atendimento</SectionTitle>
            <SwitchGlass
              checked={hoursEnabled}
              onChange={(on) =>
                setCfg((c) => ({ ...c, businessHours: on ? (c.businessHours ?? DEFAULT_HOURS) : null }))
              }
              aria-label="Usar horário de atendimento"
            />
          </div>
          {hoursEnabled && cfg.businessHours ? (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="wc-tz" className="text-xs">
                  Fuso horário
                </Label>
                <Input
                  id="wc-tz"
                  value={cfg.businessHours.tz}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      businessHours: { ...(c.businessHours ?? DEFAULT_HOURS), tz: e.target.value },
                    }))
                  }
                />
              </div>
              {WEBCHAT_WEEKDAYS.map((day) => {
                const range = cfg.businessHours?.week[day]?.[0] ?? null;
                return (
                  <div key={day} className="flex flex-wrap items-center gap-2">
                    <label className="flex w-16 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(range)}
                        onChange={(e) => setDay(day, e.target.checked ? ["09:00", "18:00"] : null)}
                      />
                      {WEEKDAY_LABEL[day]}
                    </label>
                    {range ? (
                      <>
                        <Input
                          type="time"
                          aria-label={`${WEEKDAY_LABEL[day]} início`}
                          className="w-28"
                          value={range[0]}
                          onChange={(e) => setDay(day, [e.target.value, range[1]])}
                        />
                        <span className="text-xs text-[var(--text-muted)]">até</span>
                        <Input
                          type="time"
                          aria-label={`${WEEKDAY_LABEL[day]} fim`}
                          className="w-28"
                          value={range[1]}
                          onChange={(e) => setDay(day, [range[0], e.target.value])}
                        />
                      </>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">Fechado</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              Sem horário definido, o widget fica disponível enquanto houver
              atendentes com acesso ao canal.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="wc-offline" className="text-xs">
              Mensagem fora do horário
            </Label>
            <Textarea
              id="wc-offline"
              rows={2}
              maxLength={500}
              value={cfg.offlineMessage}
              onChange={(e) => setCfg((c) => ({ ...c, offlineMessage: e.target.value }))}
            />
          </div>
        </section>

        <Separator />
        <WebchatIdentitySection {...v2Props} />
        <Separator />
        <WebchatContextSection {...v2Props} />
        <Separator />
        <WebchatS2SSection {...v2Props} publicOrigin={origin} />

        {saveMutation.isError ? (
          <p className="text-sm text-[var(--color-danger-text)]" role="alert">
            {saveMutation.error instanceof Error ? saveMutation.error.message : "Erro ao salvar."}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={saveMutation.isPending || !name.trim()}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {saved ? "Salvo" : "Salvar"}
          </Button>
        </div>
      </div>

      {/* Preview ao vivo */}
      <aside className="space-y-2 lg:sticky lg:top-0 lg:self-start">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Prévia</SectionTitle>
          <SelectNative
            aria-label="Tela da prévia"
            className="h-8 w-36"
            value={previewView}
            onChange={(e) => setPreviewView(e.target.value as PreviewView)}
          >
            <option value="chat">Conversa</option>
            <option value="prechat">Pré-chat</option>
            <option value="offline">Fora do horário</option>
          </SelectNative>
        </div>
        {publicKey ? (
          <iframe
            ref={iframeRef}
            title="Prévia do widget"
            src={`/webchat/${encodeURIComponent(publicKey)}?preview=1`}
            onLoad={postPreview}
            className="h-[560px] w-full rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]"
          />
        ) : (
          <div className="flex h-[560px] items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] p-6 text-center text-xs text-[var(--text-muted)]">
            A prévia aparece quando o canal tiver a chave pública.
          </div>
        )}
      </aside>
    </div>
  );
}
