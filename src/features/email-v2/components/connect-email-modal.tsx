"use client";

import * as React from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Server,
  User,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { connectEmailAccount } from "../api/accounts";
import type { ConnectEmailInput, EmailEncryption, EmailVisibility } from "../api/types";
import {
  CUSTOM_EMAIL_PROVIDER_ID,
  applyEmailProviderPreset,
  emailProviderChoices,
  getEmailProviderPreset,
  type EmailProviderChoice,
} from "../providers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (accountId: string) => void;
}

type Step = 1 | 2;

const DEFAULT_FORM: ConnectEmailInput = {
  email: "",
  password: "",
  imapHost: "",
  imapPort: 993,
  imapEncryption: "SSL_TLS",
  smtpHost: "",
  smtpPort: 587,
  smtpEncryption: "STARTTLS",
  visibility: "SHARED",
  groupInThreads: true,
  createContactsForReplies: false,
};

const FIELD_CLASS =
  "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/15 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/15";

export function ConnectEmailModal({ open, onOpenChange, onSuccess }: Props) {
  const [step, setStep] = React.useState<Step>(1);
  const [form, setForm] = React.useState<ConnectEmailInput>(DEFAULT_FORM);
  const [providerId, setProviderId] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const selectedPreset = getEmailProviderPreset(providerId);
  const selectedChoice = emailProviderChoices().find((c) => c.id === providerId);
  const isCustom = providerId === CUSTOM_EMAIL_PROVIDER_ID;

  function resetAndClose() {
    setStep(1);
    setForm(DEFAULT_FORM);
    setProviderId("");
    setErrors({});
    setShowPassword(false);
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (loading && !next) return;
    if (!next) resetAndClose();
    else onOpenChange(true);
  }

  function setField<K extends keyof ConnectEmailInput>(key: K, value: ConnectEmailInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  function handleProviderChange(id: string) {
    setProviderId(id);
    if (errors.provider) setErrors((prev) => { const n = { ...prev }; delete n.provider; return n; });
    const preset = getEmailProviderPreset(id);
    if (preset) setForm((prev) => applyEmailProviderPreset(prev, preset));
  }

  function handleStep1Continue() {
    const next: Record<string, string> = {};
    if (!providerId) next.provider = "Selecione o provedor de e-mail.";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = "Insira um endereço de e-mail válido.";
    }
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setErrors({});
    setStep(2);
  }

  async function handleConnect() {
    setLoading(true);
    setErrors({});
    try {
      const result = await connectEmailAccount(form);
      if (!result.ok) {
        setErrors({ [result.field]: result.message });
        return;
      }
      onSuccess(result.account.id);
      resetAndClose();
    } catch {
      setErrors({ email: "Erro inesperado. Tente novamente." });
    } finally {
      setLoading(false);
    }
  }

  const title = step === 1 ? "Conecte seu endereço de e-mail" : form.email;
  const subtitle =
    step === 1
      ? "Escolha o provedor e informe o e-mail. Os servidores IMAP/SMTP são preenchidos automaticamente."
      : "Mensagens enviadas desse endereço serão vinculadas automaticamente ao contato correspondente no CRM.";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="md"
        panelClassName="relative max-w-lg overflow-visible rounded-3xl border-border bg-card shadow-2xl shadow-black/20"
        bodyClassName="gap-0 overflow-visible p-0"
      >
        <header className="flex gap-3 px-6 pb-4 pt-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent-violet shadow-md shadow-brand/25">
            <Mail className="size-5 text-brand-foreground" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{title}</DialogTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            disabled={loading}
            aria-label="Fechar"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="relative px-6 pb-2">
          {step === 1 ? (
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="email-provider" className="mb-1.5 block text-sm font-medium text-foreground">
                  Provedor
                </label>
                <ProviderDropdown
                  id="email-provider"
                  value={providerId}
                  onChange={handleProviderChange}
                />
                {errors.provider && (
                  <p className="mt-1 text-xs text-destructive">{errors.provider}</p>
                )}
              </div>
              <div>
                <label htmlFor="email-input" className="mb-1.5 block text-sm font-medium text-foreground">
                  Endereço de e-mail
                </label>
                <input
                  id="email-input"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleStep1Continue();
                    }
                  }}
                  className={FIELD_CLASS}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-destructive">{errors.email}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="email-password" className="mb-1.5 block text-sm font-medium text-foreground">
                  Senha do e-mail
                </label>
                <div className="relative">
                  <input
                    id="email-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                    className={cn(FIELD_CLASS, "pe-11")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-destructive">{errors.password}</p>
                )}
              </div>

              {selectedPreset && !isCustom ? (
                <div className="rounded-xl border border-border bg-muted/30 p-3.5">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Server className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {selectedChoice?.label ?? selectedPreset.label}
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground/70">IMAP</span>{" "}
                      {selectedPreset.imapHost}:{selectedPreset.imapPort}
                    </p>
                    <p>
                      <span className="font-medium text-foreground/70">SMTP</span>{" "}
                      {selectedPreset.smtpHost}:{selectedPreset.smtpPort}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                    onClick={() => handleProviderChange(CUSTOM_EMAIL_PROVIDER_ID)}
                  >
                    Configurar servidores manualmente
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_100px_140px] gap-2">
                    <FieldRow label="Servidor IMAP" htmlFor="imap-host" error={errors.imap_host}>
                      <input
                        id="imap-host"
                        placeholder="imap.gmail.com"
                        value={form.imapHost}
                        onChange={(e) => setField("imapHost", e.target.value)}
                        className={FIELD_CLASS}
                      />
                    </FieldRow>
                    <FieldRow label="Porta" htmlFor="imap-port" error={errors.imap_port}>
                      <input
                        id="imap-port"
                        type="number"
                        placeholder="993"
                        value={form.imapPort}
                        onChange={(e) => setField("imapPort", Number(e.target.value))}
                        className={FIELD_CLASS}
                      />
                    </FieldRow>
                    <FieldRow label="Criptografia">
                      <DropdownGlass
                        value={form.imapEncryption}
                        onValueChange={(v) => setField("imapEncryption", v as EmailEncryption)}
                        options={[
                          { value: "SSL_TLS", label: "SSL/TLS" },
                          { value: "STARTTLS", label: "STARTTLS" },
                          { value: "NONE", label: "Nenhuma" },
                        ]}
                      />
                    </FieldRow>
                  </div>
                  <div className="grid grid-cols-[1fr_100px_140px] gap-2">
                    <FieldRow label="Servidor SMTP" htmlFor="smtp-host" error={errors.smtp_host}>
                      <input
                        id="smtp-host"
                        placeholder="smtp.gmail.com"
                        value={form.smtpHost}
                        onChange={(e) => setField("smtpHost", e.target.value)}
                        className={FIELD_CLASS}
                      />
                    </FieldRow>
                    <FieldRow label="Porta" htmlFor="smtp-port" error={errors.smtp_port}>
                      <input
                        id="smtp-port"
                        type="number"
                        placeholder="587"
                        value={form.smtpPort}
                        onChange={(e) => setField("smtpPort", Number(e.target.value))}
                        className={FIELD_CLASS}
                      />
                    </FieldRow>
                    <FieldRow label="Criptografia">
                      <DropdownGlass
                        value={form.smtpEncryption}
                        onValueChange={(v) => setField("smtpEncryption", v as EmailEncryption)}
                        options={[
                          { value: "STARTTLS", label: "STARTTLS" },
                          { value: "SSL_TLS", label: "SSL/TLS" },
                          { value: "NONE", label: "Nenhuma" },
                        ]}
                      />
                    </FieldRow>
                  </div>
                </>
              )}

              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}

              <div>
                <p id="email-visibility-label" className="mb-1.5 text-sm font-medium text-foreground">
                  Visibilidade
                </p>
                <div
                  role="group"
                  aria-labelledby="email-visibility-label"
                  className="grid grid-cols-2 rounded-xl bg-muted p-1"
                >
                  {([
                    { value: "SHARED" as const, label: "Compartilhado", Icon: Users },
                    { value: "PERSONAL" as const, label: "Pessoal", Icon: User },
                  ]).map(({ value, label, Icon }) => {
                    const active = form.visibility === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setField("visibility", value as EmailVisibility)}
                        className={cn(
                          "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                          active
                            ? "bg-brand text-brand-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {form.visibility === "SHARED"
                    ? "Visível para todos os usuários com permissão de acesso a caixas compartilhadas."
                    : "Visível apenas para você. Ninguém mais poderá ver esta caixa de e-mail."}
                </p>
              </div>

              <div className="space-y-3 pt-1">
                <BrandSwitch
                  id="email-threads"
                  checked={form.groupInThreads}
                  onCheckedChange={(v) => setField("groupInThreads", v)}
                  label="Agrupar mensagens em threads"
                />
                <BrandSwitch
                  id="email-create-contacts"
                  checked={form.createContactsForReplies}
                  onCheckedChange={(v) => setField("createContactsForReplies", v)}
                  label="Criar contatos para todos os endereços de e-mail aos quais você respondeu"
                />
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-border px-6 py-4">
          <p className="text-xs tabular-nums text-muted-foreground">
            Etapa {step} de 2
          </p>
          <div className="flex items-center gap-2">
            {step === 1 ? (
              <>
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleStep1Continue}
                  disabled={!providerId}
                  className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-foreground shadow-lg shadow-brand/30 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-40"
                >
                  Continuar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-40"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-accent-violet px-5 py-2 text-sm font-semibold text-brand-foreground shadow-lg shadow-brand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-70"
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Conectando…
                    </>
                  ) : (
                    <>
                      <Check className="size-4" aria-hidden />
                      Conectar
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function ProviderDropdown({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const listId = `${id}-listbox`;
  const choices = emailProviderChoices();
  const selected = choices.find((c) => c.id === value);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-sm transition-colors focus-visible:outline-none",
          open ? "border-brand ring-2 ring-brand/15" : "hover:border-brand/40",
          selected ? "text-foreground" : "text-brand",
        )}
      >
        <span className="min-w-0 truncate">
          {selected ? selected.label : "Selecione o provedor"}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={id}
          className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl animate-pop-in"
        >
          {choices.map((choice) => (
            <ProviderOption
              key={choice.id}
              choice={choice}
              selected={choice.id === value}
              onSelect={() => {
                onChange(choice.id);
                setOpen(false);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProviderOption({
  choice,
  selected,
  onSelect,
}: {
  choice: EmailProviderChoice;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5 outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-brand/15",
        selected && "bg-muted/60",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{choice.label}</p>
        {choice.imapLine && choice.smtpLine ? (
          <div className="mt-0.5 space-y-0.5">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/70">IMAP</span> {choice.imapLine}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/70">SMTP</span> {choice.smtpLine}
            </p>
          </div>
        ) : choice.hint ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{choice.hint}</p>
        ) : null}
      </div>
      {selected && <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />}
    </li>
  );
}

function BrandSwitch({
  id,
  checked,
  onCheckedChange,
  label,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  label: string;
}) {
  const labelId = `${id}-label`;
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          checked ? "bg-brand" : "bg-muted-foreground/25",
        )}
      >
        <span
          className={cn(
            "size-5 rounded-full bg-brand-foreground shadow-sm transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
      <span id={labelId} className="cursor-pointer text-sm text-foreground" onClick={() => onCheckedChange(!checked)}>
        {label}
      </span>
    </div>
  );
}

function FieldRow({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
