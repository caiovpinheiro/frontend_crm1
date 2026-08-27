"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useMemo, useRef, useState } from "react";
import { IconArrowLeft as ArrowLeft, IconArrowRight as ArrowRight, IconBuilding as Building2, IconCheck as Check, IconFlag as Flag, IconPhoto as ImageIcon, IconLayoutKanban as Kanban, IconLink as LinkIcon, IconLoader2 as Loader2, IconLogout as LogOut, IconPalette as Palette, IconRadio as Radio, IconPlayerSkipForward as SkipForward, IconTrash as Trash2, IconUpload as Upload, IconUsers as Users } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { SelectNative } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  PIPELINE_TEMPLATE_LIST,
  type PipelineTemplateId,
} from "@/lib/onboarding-templates";

type Props = {
  // Pode chegar `null`: a página SSR não consulta o banco e o wizard
  // hidrata os dados da org client-side. Sem aceitar null, ler
  // `initialOrganization.name` no SSR quebrava a página (500).
  initialOrganization: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    size: string | null;
    phone: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
  } | null;
};

type Step = {
  id: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const STEPS: Step[] = [
  { id: 1, label: "Empresa", icon: Building2 },
  { id: 2, label: "Branding", icon: Palette },
  { id: 3, label: "Pipeline", icon: Kanban },
  { id: 4, label: "Time", icon: Users },
  { id: 5, label: "Canal", icon: Radio },
];

type TeamInvite = { email: string; role: "MANAGER" | "MEMBER" };

export default function OnboardingWizard({ initialOrganization }: Props) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [orgName, setOrgName] = useState(initialOrganization?.name ?? "");
  const [industry, setIndustry] = useState(initialOrganization?.industry ?? "");
  const [size, setSize] = useState(initialOrganization?.size ?? "");
  const [phone, setPhone] = useState(initialOrganization?.phone ?? "");

  const [logoUrl, setLogoUrl] = useState(initialOrganization?.logoUrl ?? "");
  const [primaryColor, setPrimaryColor] = useState(
    initialOrganization?.primaryColor ?? "#1e3a8a",
  );

  const [templateId, setTemplateId] =
    useState<PipelineTemplateId>("educational");

  const [team, setTeam] = useState<TeamInvite[]>([]);

  const [channelName, setChannelName] = useState("");
  const [channelPhone, setChannelPhone] = useState("");
  const [skipChannel, setSkipChannel] = useState(false);

  const progress = useMemo(() => (step - 1) * (100 / (STEPS.length - 1)), [step]);

  async function callJson(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message ?? "Erro inesperado.");
    return data;
  }

  async function handleNext() {
    setError(null);
    setSaving(true);
    try {
      if (step === 1) {
        await callJson("/api/onboarding/organization", "PATCH", {
          name: orgName,
          industry,
          size,
          phone,
        });
        setStep(2);
      } else if (step === 2) {
        await callJson("/api/onboarding/branding", "PATCH", {
          logoUrl: logoUrl || null,
          primaryColor,
        });
        setStep(3);
      } else if (step === 3) {
        await callJson("/api/onboarding/pipeline", "POST", { templateId });
        setStep(4);
      } else if (step === 4) {
        if (team.length) {
          await callJson("/api/onboarding/invites", "POST", { members: team });
        }
        setStep(5);
      } else if (step === 5) {
        if (!skipChannel && channelName.trim()) {
          await callJson("/api/onboarding/channel", "POST", {
            name: channelName,
            type: "WHATSAPP",
            provider: "BAILEYS_MD",
            phoneNumber: channelPhone || null,
          });
        }
        await callJson("/api/onboarding/complete", "POST");
        router.push("/dashboard");
        router.refresh();
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    setError(null);
    if (step > 1) setStep(step - 1);
  }

  async function handleSkipAll() {
    const ok = await confirm({
      title: "Pular o onboarding?",
      description:
        "Você cai direto no CRM com as configurações básicas. Logo, pipeline, time e canal podem ser ajustados depois em Configurações.",
      confirmLabel: "Pular",
    });
    if (!ok) return;
    setError(null);
    setSaving(true);
    try {
      await callJson("/api/onboarding/complete", "POST");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao consegui pular.");
      setSaving(false);
    }
  }

  async function handleLogout() {
    const ok = await confirm({
      title: "Sair da conta?",
      description:
        "Você volta pra tela inicial. Os dados já preenchidos ficam salvos na sua organização.",
      confirmLabel: "Sair",
    });
    if (!ok) return;
    await signOut({ callbackUrl: "/" });
  }

  function addTeamMember() {
    setTeam((prev) => [...prev, { email: "", role: "MEMBER" }]);
  }
  function updateTeamMember(index: number, patch: Partial<TeamInvite>) {
    setTeam((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }
  function removeTeamMember(index: number) {
    setTeam((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="flex min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <aside className="hidden w-72 flex-col gap-6 border-r border-border bg-background p-8 md:flex">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Onboarding
          </div>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight">
            {orgName || initialOrganization?.name || "Sua empresa"}
          </h1>
        </div>

        <ol className="flex flex-col gap-1">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const completed = step > s.id;
            const active = step === s.id;
            return (
              <li key={s.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    active && "bg-primary/10 text-primary",
                    !active && completed && "text-foreground",
                    !active && !completed && "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      active && "border-primary bg-primary text-primary-foreground",
                      !active && completed && "border-success bg-success text-success-foreground",
                      !active && !completed && "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {completed ? <Check className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <div className="flex flex-col leading-tight">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Passo {s.id}
                    </span>
                    <span className="font-semibold">{s.label}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={handleSkipAll}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <SkipForward className="size-3.5" />
              Pular por enquanto
            </button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
            >
              <LogOut className="size-3.5" />
              Sair da conta
            </button>
          </div>
          <div className="text-[11px] leading-snug text-muted-foreground">
            Dúvidas? Fale com a equipe Bwipo em{" "}
            <a
              href="mailto:suporte@eduit.com.br"
              className="underline underline-offset-2 hover:text-foreground"
            >
              suporte@eduit.com.br
            </a>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <div className="md:hidden">
          <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
            <div className="text-xs font-medium text-muted-foreground">
              Passo {step} de {STEPS.length}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSkipAll}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <SkipForward className="size-3.5" />
                Pular
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                aria-label="Sair da conta"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="h-1.5 w-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
          {error ? (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex-1">
            {step === 1 ? (
              <StepEmpresa
                orgName={orgName}
                setOrgName={setOrgName}
                industry={industry}
                setIndustry={setIndustry}
                size={size}
                setSize={setSize}
                phone={phone}
                setPhone={setPhone}
              />
            ) : null}

            {step === 2 ? (
              <StepBranding
                logoUrl={logoUrl}
                setLogoUrl={setLogoUrl}
                primaryColor={primaryColor}
                setPrimaryColor={setPrimaryColor}
                orgName={orgName}
              />
            ) : null}

            {step === 3 ? (
              <StepPipeline templateId={templateId} setTemplateId={setTemplateId} />
            ) : null}

            {step === 4 ? (
              <StepTime
                team={team}
                addTeamMember={addTeamMember}
                updateTeamMember={updateTeamMember}
                removeTeamMember={removeTeamMember}
              />
            ) : null}

            {step === 5 ? (
              <StepCanal
                channelName={channelName}
                setChannelName={setChannelName}
                channelPhone={channelPhone}
                setChannelPhone={setChannelPhone}
                skipChannel={skipChannel}
                setSkipChannel={setSkipChannel}
              />
            ) : null}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={saving || step === 1}
            >
              <ArrowLeft className="mr-2 size-4" />
              Voltar
            </Button>
            <Button onClick={handleNext} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : step === 5 ? (
                <Flag className="mr-2 size-4" />
              ) : null}
              {step === 5 ? "Concluir onboarding" : "Próximo"}
              {step !== 5 && !saving ? <ArrowRight className="ml-2 size-4" /> : null}
            </Button>
          </div>
        </div>
      </main>
      {dialog}
    </div>
  );
}

/* ------------------- Steps ------------------- */

function StepEmpresa(props: {
  orgName: string;
  setOrgName: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  size: string;
  setSize: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-2xl font-bold">Conte sobre sua empresa</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Essas infos aparecem no CRM e ajudam a personalizar o atendimento.
        </p>
      </header>
      <div>
        <Label htmlFor="org-name">Nome da empresa *</Label>
        <Input
          id="org-name"
          required
          value={props.orgName}
          onChange={(e) => props.setOrgName(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="industry">Setor</Label>
        <Input
          id="industry"
          value={props.industry}
          onChange={(e) => props.setIndustry(e.target.value)}
          placeholder="Educação, SaaS, Saúde..."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="size">Tamanho</Label>
          <SelectNative
            id="size"
            value={props.size}
            onChange={(e) => props.setSize(e.target.value)}
            className="h-10 text-sm"
          >
            <option value="">Selecione...</option>
            <option value="1-10">1-10</option>
            <option value="11-50">11-50</option>
            <option value="51-200">51-200</option>
            <option value="201-500">201-500</option>
            <option value="500+">500+</option>
          </SelectNative>
        </div>
        <div>
          <Label htmlFor="phone">Telefone de contato</Label>
          <Input
            id="phone"
            value={props.phone}
            onChange={(e) => props.setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </div>
      </div>
    </div>
  );
}

// Tamanho maximo do logo em bytes quando armazenado como base64 na tabela
// Organization. Logos tipicos pesam 30-200KB; 1MB deixa folga confortavel
// sem inchar o DB.
// TODO(storage): migrar pra Vercel Blob / S3 quando tivermos infra — aqui
// o logo vai como data URL direto em Organization.logoUrl (coluna TEXT).
const MAX_LOGO_BYTES = 1024 * 1024; // 1MB
const ACCEPTED_LOGO_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
];

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizePastedUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Se o usuario colar uma URL de resultado do Google Images
  // (google.com/imgres?...&imgurl=ENCODED), extrai a URL original da
  // imagem pra nao quebrar o preview.
  try {
    const u = new URL(trimmed);
    if (u.hostname.endsWith("google.com") && u.pathname.startsWith("/imgres")) {
      const inner = u.searchParams.get("imgurl");
      if (inner) return decodeURIComponent(inner);
    }
  } catch {
    // URL invalida: devolve como veio pro usuario corrigir
  }
  return trimmed;
}

function StepBranding(props: {
  logoUrl: string;
  setLogoUrl: (v: string) => void;
  primaryColor: string;
  setPrimaryColor: (v: string) => void;
  orgName: string;
}) {
  const [mode, setMode] = useState<"upload" | "url">(() => {
    if (!props.logoUrl) return "upload";
    return props.logoUrl.startsWith("data:") ? "upload" : "url";
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasLogo = props.logoUrl.length > 0;
  const isDataUrl = props.logoUrl.startsWith("data:");

  function handleFiles(files: FileList | null) {
    setUploadError(null);
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!ACCEPTED_LOGO_MIME.includes(file.type)) {
      setUploadError(
        "Formato não suportado. Use PNG, JPG, WebP, SVG ou GIF.",
      );
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setUploadError(
        `Arquivo muito grande (${formatBytes(file.size)}). Limite: ${formatBytes(
          MAX_LOGO_BYTES,
        )}.`,
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        setUploadError("Não consegui ler o arquivo. Tenta de novo?");
        return;
      }
      setImgError(false);
      props.setLogoUrl(result);
    };
    reader.onerror = () => {
      setUploadError("Falha ao ler o arquivo.");
    };
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    props.setLogoUrl("");
    setUploadError(null);
    setImgError(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleUrlChange(raw: string) {
    const cleaned = sanitizePastedUrl(raw);
    setImgError(false);
    props.setLogoUrl(cleaned);
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-2xl font-bold">Dê uma cara pra sua marca</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Logo e cor aparecem no cabeçalho do CRM. Pode ajustar depois em
          Configurações.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>Logo</Label>
          <div className="inline-flex rounded-lg border border-input bg-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                mode === "upload"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Upload className="size-3.5" />
              Enviar imagem
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                mode === "url"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LinkIcon className="size-3.5" />
              Colar URL
            </button>
          </div>
        </div>

        {mode === "upload" ? (
          <div>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFiles(e.dataTransfer.files);
              }}
              className={cn(
                "group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-input hover:border-primary/50 hover:bg-muted/50",
              )}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              aria-label="Enviar logo"
            >
              {isDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={props.logoUrl}
                  alt="Logo enviado"
                  className="size-20 rounded-lg object-contain"
                />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <Upload className="size-5 text-muted-foreground" />
                </div>
              )}
              <div className="text-sm font-medium">
                {isDataUrl
                  ? "Logo pronto. Clique pra trocar."
                  : "Arraste uma imagem ou clique pra selecionar"}
              </div>
              <div className="text-xs text-muted-foreground">
                PNG, JPG, WebP, SVG ou GIF · até {formatBytes(MAX_LOGO_BYTES)}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_LOGO_MIME.join(",")}
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
            {uploadError && (
              <p className="mt-2 text-xs text-destructive">{uploadError}</p>
            )}
            {isDataUrl && (
              <button
                type="button"
                onClick={clearLogo}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Remover logo
              </button>
            )}
          </div>
        ) : (
          <div>
            <Input
              id="logo-url"
              value={isDataUrl ? "" : props.logoUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://dnawork.com.br/logo.png"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Cole o link direto do arquivo (termina em .png, .jpg, .svg…).
              Páginas de galeria ou Google Imagens não funcionam.
            </p>
            {imgError && !isDataUrl && hasLogo && (
              <p className="mt-1 text-xs text-destructive">
                Não consegui carregar essa imagem. Verifica se o link abre
                direto a imagem no navegador.
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="primary-color">Cor principal</Label>
        <div className="flex items-center gap-3">
          <input
            id="primary-color"
            type="color"
            value={props.primaryColor}
            onChange={(e) => props.setPrimaryColor(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded-lg border border-input bg-transparent"
          />
          <Input
            value={props.primaryColor}
            onChange={(e) => props.setPrimaryColor(e.target.value)}
            className="font-mono"
          />
        </div>
      </div>

      <div
        className="rounded-xl p-6 text-white shadow-sm"
        style={{ backgroundColor: props.primaryColor }}
      >
        <div className="text-xs uppercase tracking-wider opacity-80">
          Preview
        </div>
        <div className="mt-2 flex items-center gap-3">
          {hasLogo && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.logoUrl}
              alt=""
              className="h-10 w-10 rounded-lg bg-[var(--glass-bg-subtle)] object-contain p-1"
              onError={() => setImgError(true)}
              onLoad={() => setImgError(false)}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--glass-bg-subtle)]">
              <ImageIcon className="size-5 text-white/70" aria-hidden />
            </div>
          )}
          <span className="text-lg font-semibold">{props.orgName}</span>
        </div>
      </div>
    </div>
  );
}

function StepPipeline(props: {
  templateId: PipelineTemplateId;
  setTemplateId: (v: PipelineTemplateId) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-2xl font-bold">Escolha um modelo de pipeline</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Criamos o funil inicial, razões de perda, campos custom e respostas
          rápidas — tudo editável depois.
        </p>
      </header>
      <div className="grid gap-3">
        {PIPELINE_TEMPLATE_LIST.map((t) => {
          const active = props.templateId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => props.setTemplateId(t.id)}
              className={cn(
                "flex flex-col gap-2 rounded-xl border bg-background p-5 text-left transition-colors",
                active
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary/60",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">{t.label}</span>
                {active ? <Check className="size-5 text-primary" /> : null}
              </div>
              <p className="text-xs text-muted-foreground">{t.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.stages.map((s) => (
                  <span
                    key={s.name}
                    className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    style={{ borderLeftColor: s.color, borderLeftWidth: 3 }}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepTime(props: {
  team: TeamInvite[];
  addTeamMember: () => void;
  updateTeamMember: (i: number, patch: Partial<TeamInvite>) => void;
  removeTeamMember: (i: number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-2xl font-bold">Convide seu time</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Opcional. Cada convite vira um link que você pode copiar depois na
          lista de usuários — ou pular agora e adicionar depois em Configurações
          → Equipe.
        </p>
      </header>

      {props.team.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
          Nenhum membro adicionado. Você pode pular esse passo.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {props.team.map((m, i) => (
            <li key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor={`team-email-${i}`} className="text-xs">Email</Label>
                <Input
                  id={`team-email-${i}`}
                  type="email"
                  value={m.email}
                  onChange={(e) =>
                    props.updateTeamMember(i, { email: e.target.value })
                  }
                  placeholder="colega@empresa.com"
                />
              </div>
              <div className="w-40">
                <Label className="text-xs">Papel</Label>
                <SelectNative
                  value={m.role}
                  onChange={(e) =>
                    props.updateTeamMember(i, {
                      role: e.target.value as "MANAGER" | "MEMBER",
                    })
                  }
                  className="h-10 text-sm"
                >
                  <option value="MEMBER">Membro</option>
                  <option value="MANAGER">Gestor</option>
                </SelectNative>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => props.removeTeamMember(i)}
                aria-label="Remover"
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button type="button" variant="outline" onClick={props.addTeamMember}>
          + Adicionar membro
        </Button>
      </div>
    </div>
  );
}

function StepCanal(props: {
  channelName: string;
  setChannelName: (v: string) => void;
  channelPhone: string;
  setChannelPhone: (v: string) => void;
  skipChannel: boolean;
  setSkipChannel: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-2xl font-bold">Conecte um canal de atendimento</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Opcional. Criamos um canal placeholder agora; a conexão via QR code
          acontece na tela de Canais.
        </p>
      </header>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={props.skipChannel}
          onChange={(e) => props.setSkipChannel(e.target.checked)}
          className="size-4"
        />
        Pular — configuro canal depois
      </label>

      {!props.skipChannel ? (
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="ch-name">Nome do canal</Label>
            <Input
              id="ch-name"
              value={props.channelName}
              onChange={(e) => props.setChannelName(e.target.value)}
              placeholder="WhatsApp Vendas"
            />
          </div>
          <div>
            <Label htmlFor="ch-phone">Número (opcional)</Label>
            <Input
              id="ch-phone"
              value={props.channelPhone}
              onChange={(e) => props.setChannelPhone(e.target.value)}
              placeholder="+55 11 99999-9999"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Tipo: WhatsApp · Provedor: Baileys (padrão). Outros canais ficam
            disponíveis em Configurações → Canais.
          </p>
        </div>
      ) : null}
    </div>
  );
}
