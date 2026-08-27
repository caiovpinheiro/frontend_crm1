"use client";

import { apiUrl } from "@/lib/api";
/**
 * Perfil do usuário logado.
 *
 * Layout inspirado na referência "Umbler Conta" (duas colunas num
 * fundo claro, cards brancos em `rounded-[var(--radius-xl)]` com `shadow-[var(--glass-shadow)]`)
 * adaptado ao **EduIT Premium Core**:
 *
 *  - ESQUERDA "Dados do seu perfil": avatar editável (upload), nome,
 *    assinatura, telefone, toggle de mensagem de finalização + textarea.
 *  - DIREITA "Trocar senha": senha atual + nova + confirmação. (Os Tokens
 *    de Acesso foram movidos para Segurança › API — fonte única.)
 *
 * O upload de avatar faz POST em `/api/profile/avatar` e apenas atualiza
 * o estado local com a URL retornada — a persistência efetiva em
 * `User.avatarUrl` só acontece ao clicar em "Salvar" (evita deixar o
 * registro em estado inconsistente caso o operador cancele o fluxo).
 */

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { IconAlertTriangle as AlertTriangle, IconCamera as Camera, IconCheck as Check, IconFingerprint as Fingerprint, IconInfoCircle as Info, IconKey as Key, IconLoader2 as Loader2, IconRefresh as RefreshCw, IconSparkles as Sparkles } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { GlassCard } from "@/components/crm/glass-card";
import { InputGlass } from "@/components/crm/input-glass";
import { Label } from "@/components/ui/label";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { Textarea } from "@/components/ui/textarea";
import { TooltipHost } from "@/components/ui/tooltip";
import type { ChatThemeKey } from "@/lib/chat-theme";
import {
  CHAT_THEME_OPTIONS,
  DEFAULT_CHAT_THEME,
  isChatThemeKey,
} from "@/lib/chat-theme";
import { cn } from "@/lib/utils";
import { AvatarCropDialog } from "@/components/profile/avatar-crop-dialog";
import { UserAvatar } from "@/components/crm/user-avatar";

/**
 * Avatares preset (estilo Kommo) — assets estáticos em
 * `public/avatars/presets/`. Selecionar um preset só troca o `avatarUrl`
 * (preview); a persistência acontece no "Salvar", igual ao upload de foto.
 */
const PRESET_AVATARS = Array.from(
  { length: 25 },
  (_, i) => `/avatars/presets/preset-${String(i + 1).padStart(2, "0")}.png`,
);
import { isNativePlatform } from "@/lib/native/capacitor";
import {
  isBiometricAvailable,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
  verifyBiometric,
} from "@/lib/native/biometric";

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  phone: string | null;
  signature: string | null;
  closingMessage: string | null;
  /** Ausente em builds antigos sem migration `add_user_chat_theme`. */
  chatTheme?: string | null;
};

/**
 * Toggle "Desbloquear com biometria" — só renderiza dentro do APK
 * (`isNativePlatform()`); em web/desktop este bloco nem monta.
 *
 * Ligar exige uma verificação biométrica bem-sucedida antes de gravar a
 * flag (evita ligar o cadeado sem confirmar que a biometria funciona no
 * aparelho). Desligar não exige nada (ver AGENT.md § Biometria no APK).
 */
function BiometricLockField() {
  const [native, setNative] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [available, setAvailable] = React.useState(true);
  const [checking, setChecking] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const isNative = isNativePlatform();
    setNative(isNative);
    if (!isNative) {
      setChecking(false);
      return;
    }
    setEnabled(isBiometricLockEnabled());
    void isBiometricAvailable().then((res) => {
      setAvailable(res.isAvailable);
      setChecking(false);
    });
  }, []);

  if (!native) return null;

  async function handleToggle(next: boolean) {
    if (!next) {
      setBiometricLockEnabled(false);
      setEnabled(false);
      return;
    }

    setBusy(true);
    try {
      const ok = await verifyBiometric("Confirme sua identidade para ativar o bloqueio");
      if (ok) {
        setBiometricLockEnabled(true);
        setEnabled(true);
        toast.success("Bloqueio por biometria ativado");
      } else {
        toast.error("Não foi possível confirmar sua identidade. Tente novamente.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-2xl">
      <label className="flex cursor-pointer items-center gap-3">
        <SwitchGlass
          checked={enabled}
          onChange={(next) => void handleToggle(next)}
          disabled={checking || busy || !available}
          aria-label="Desbloquear com biometria"
        />
        <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
          <Fingerprint className="size-4 text-[var(--text-muted)]" aria-hidden />
          Desbloquear com biometria
        </span>
      </label>
      <p className="pl-[52px] text-[11px] leading-snug text-[var(--color-ink-muted)]">
        Use a digital ou o Face Unlock do aparelho para abrir o app.
      </p>
      {!checking && !available ? (
        <div className="flex items-start gap-2 rounded-xl bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-3 py-2 text-[12px] leading-snug text-[var(--color-warning)]">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>Cadastre digital ou reconhecimento facial no aparelho para usar este recurso.</span>
        </div>
      ) : null}
    </div>
  );
}

function ChatThemeField({
  profile,
  queryClient,
}: {
  profile: Profile;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const current: ChatThemeKey = isChatThemeKey(profile.chatTheme)
    ? profile.chatTheme
    : DEFAULT_CHAT_THEME;

  const themeMutation = useMutation({
    mutationFn: async (key: ChatThemeKey) => {
      const r = await fetch(apiUrl("/api/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatTheme: key }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (
          r.status === 503 &&
          j &&
          typeof j === "object" &&
          "code" in j &&
          (j as { code?: unknown }).code === "CHAT_THEME_COLUMN_MISSING"
        ) {
          // Degradação graciosa: builds/dev sem migration aplicada não devem
          // quebrar o Settings. Mantém tema atual e informa o operador.
          return {
            ...profile,
            chatTheme: current,
            _chatThemeBlockedMessage:
              typeof (j as { message?: unknown }).message === "string"
                ? (j as { message: string }).message
                : "Tema indisponível até aplicar migrations.",
          } as Profile & { _chatThemeBlockedMessage: string };
        }

        throw new Error(
          typeof (j as { message?: string }).message === "string"
            ? (j as { message: string }).message
            : "Erro ao salvar tema",
        );
      }
      return j as Profile;
    },
    onSuccess: (data) => {
      const blockedMsg =
        data && typeof data === "object" && "_chatThemeBlockedMessage" in data
          ? String((data as unknown as { _chatThemeBlockedMessage?: unknown })._chatThemeBlockedMessage ?? "")
          : "";
      if (blockedMsg) {
        toast.warning(blockedMsg);
        queryClient.setQueryData(["profile"], profile);
        return;
      }
      toast.success("Tema do chat atualizado");
      queryClient.setQueryData(["profile"], data);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Tema das bolhas (inbox)
        </p>
        <p className="mt-1 text-[11px] leading-snug text-[var(--color-ink-muted)]">
          Cor das mensagens enviadas e do fundo do histórico. Recebidas permanecem brancas; notas internas em cinza.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {CHAT_THEME_OPTIONS.map((theme) => {
          const selected = current === theme.key;
          return (
            <button
              key={theme.key}
              type="button"
              disabled={themeMutation.isPending}
              onClick={() => themeMutation.mutate(theme.key)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 p-3 lumen-transition touch-target",
                selected
                  ? "border-primary bg-[var(--color-primary-soft)] shadow-[var(--shadow-sm)]"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] hover:border-primary/30 hover:shadow-[var(--shadow-sm)]",
              )}
              aria-pressed={selected}
              aria-label={`Tema ${theme.label}`}
            >
              <div
                className="h-14 w-20 overflow-hidden rounded-lg border border-[var(--glass-border)] shadow-[var(--shadow-sm)]"
                style={{ background: theme.preview.chatBg }}
              >
                <div className="flex justify-end p-1.5">
                  <div
                    className="rounded-md rounded-br-[1px] px-2 py-1"
                    style={{ background: theme.preview.bubbleBg }}
                  >
                    <p
                      className="text-[8px] font-medium"
                      style={{ color: theme.preview.bubbleText }}
                    >
                      Oi!
                    </p>
                  </div>
                </div>
                <div className="flex justify-start p-1.5">
                  <div className="rounded-md rounded-bl-[1px] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2 py-1 shadow-[var(--shadow-sm)]">
                    <p className="text-[8px] font-medium text-[color:var(--chat-bubble-received-text)]">
                      Olá!
                    </p>
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                {theme.label}
              </span>
              {selected ? (
                <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { update } = useSession();
  const queryClient = useQueryClient();

  const { data: profile, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const r = await fetch(apiUrl("/api/profile"));
      const text = await r.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Resposta inválida (${r.status}): ${text.slice(0, 120)}`);
      }
      if (!r.ok) {
        const msg =
          json && typeof json === "object" && "message" in json && typeof (json as { message?: unknown }).message === "string"
            ? (json as { message: string }).message
            : `Erro ao carregar perfil (HTTP ${r.status}).`;
        throw new Error(msg);
      }
      return json as Profile;
    },
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-16">
        <Loader2 className="size-8 animate-spin text-[var(--color-ink-muted)]" aria-hidden />
      </div>
    );
  }

  if (isError || !profile) {
    const msg =
      error instanceof Error ? error.message : "Não foi possível carregar o perfil.";
    return (
      <div className="w-full rounded-[var(--radius-xl)] border border-[var(--color-danger)]/30 bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] p-8 text-center shadow-[var(--glass-shadow)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_18%,transparent)] text-[var(--color-danger)]">
          <AlertTriangle className="size-6" />
        </div>
        <h2 className="mt-4 font-display text-lg font-bold text-[var(--text-primary)]">
          Não foi possível carregar seu perfil
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{msg}</p>
        <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
          Se o erro mencionar coluna inexistente, a migration{" "}
          <code className="rounded bg-[var(--glass-bg-overlay)] px-1.5 py-0.5">add_user_profile_fields</code>{" "}
          ainda não foi aplicada no servidor (ex.:{" "}
          <code className="rounded bg-[var(--glass-bg-overlay)] px-1.5 py-0.5">add_user_chat_theme</code>).
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white shadow-[var(--shadow-indigo-glow)] transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
        >
          {isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
        <ProfileCard profile={profile} queryClient={queryClient} update={update} />
        {/* Tokens de Acesso foram movidos para Segurança › API (fonte única).
            Aqui, no lugar, fica a troca de senha. */}
        <PasswordCard />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   CARD — Trocar senha
   ──────────────────────────────────────────────────────────── */

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(apiUrl("/api/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          typeof (j as { message?: string }).message === "string"
            ? (j as { message: string }).message
            : "Erro ao trocar a senha",
        );
      }
      return j;
    },
    onSuccess: () => {
      toast.success("Senha atualizada");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    !mutation.isPending;

  return (
    <GlassCard variant="overlay" className="min-w-0 p-5 sm:p-8">
      <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
        Trocar senha
      </h2>
      <p className="mt-1 max-w-md text-sm leading-snug text-[var(--text-muted)]">
        Informe sua senha atual e escolha uma nova com pelo menos 8 caracteres.
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
      >
        <Field id="current-password" label="Senha atual" required>
          <InputGlass
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <Field
          id="new-password"
          label="Nova senha"
          hint={tooShort ? "Use pelo menos 8 caracteres." : undefined}
          required
        >
          <InputGlass
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <Field
          id="confirm-password"
          label="Confirmar nova senha"
          hint={mismatch ? "As senhas não coincidem." : undefined}
          required
        >
          <InputGlass
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <ButtonGlass
          type="submit"
          variant="primary"
          disabled={!canSubmit}
          className="mt-2 h-11 w-full text-sm disabled:opacity-60"
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Key className="size-4" />
          )}
          Atualizar senha
        </ButtonGlass>
      </form>
    </GlassCard>
  );
}

/* ────────────────────────────────────────────────────────────────
   CARD ESQUERDO — Dados do seu perfil
   ──────────────────────────────────────────────────────────── */

function ProfileCard({
  profile,
  queryClient,
  update,
}: {
  profile: Profile;
  queryClient: ReturnType<typeof useQueryClient>;
  update: ReturnType<typeof useSession>["update"];
}) {
  const [name, setName] = React.useState(profile.name);
  const [signature, setSignature] = React.useState(profile.signature ?? "");
  const [phone, setPhone] = React.useState(profile.phone ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(profile.avatarUrl);
  const [closingEnabled, setClosingEnabled] = React.useState(
    Boolean(profile.closingMessage),
  );
  const [closingMessage, setClosingMessage] = React.useState(profile.closingMessage ?? "");

  // Sincroniza quando a query de perfil se atualiza (ex.: depois de salvar)
  React.useEffect(() => {
    setName(profile.name);
    setSignature(profile.signature ?? "");
    setPhone(profile.phone ?? "");
    setAvatarUrl(profile.avatarUrl);
    setClosingEnabled(Boolean(profile.closingMessage));
    setClosingMessage(profile.closingMessage ?? "");
  }, [profile]);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [showPresets, setShowPresets] = React.useState(false);

  // Arquivo aguardando crop. Quando o operador seleciona uma imagem,
  // ela vai pra esse estado em vez de subir direto — o
  // <AvatarCropDialog> abre automaticamente quando esse estado é
  // não-nulo, e só faz o upload depois que o operador enquadrou.
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const r = await fetch(apiUrl("/api/profile/avatar"), {
        method: "POST",
        body: formData,
      });
      const j = (await r.json().catch(() => ({}))) as {
        url?: string;
        message?: string;
      };
      if (!r.ok || !j.url) {
        throw new Error(j.message ?? "Erro ao enviar imagem.");
      }
      setAvatarUrl(j.url);
      setPendingFile(null);
      toast.success("Foto atualizada — clique em Salvar para aplicar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        avatarUrl: avatarUrl ?? "",
        phone: phone.trim(),
        signature: signature.trim(),
        closingMessage: closingEnabled ? closingMessage.trim() : "",
      };
      const r = await fetch(apiUrl("/api/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          typeof (j as { message?: string }).message === "string"
            ? (j as { message: string }).message
            : "Erro ao salvar",
        );
      }
      return j as Profile;
    },
    onSuccess: async (data) => {
      toast.success("Perfil atualizado");
      queryClient.setQueryData(["profile"], data);
      await update({ name: data.name });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <GlassCard variant="overlay" className="min-w-0 p-5 sm:p-8">
      <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
        Dados do seu perfil
      </h2>

      {/* ── Avatar + banner ── */}
      <div className="mt-6 flex min-w-0 items-start gap-5">
        {/*
          Avatar editável: clique no botão de camera dispara o <input type="file">
          escondido. Preview imediato via `avatarUrl` local — persistência
          real só ao clicar em "Salvar" abaixo (evita registro inconsistente).
        */}
        <div className="relative shrink-0">
          <UserAvatar
            size={96}
            name={name}
            imageUrl={avatarUrl}
            className="ring-4 ring-[var(--glass-bg-modal)] shadow-[var(--shadow-sm)]"
          />
          <TooltipHost
            label="Alterar foto"
            side="right"
            className="absolute -bottom-1 -right-1"
          >
            <ButtonGlass
              variant="icon"
              size="icon"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                "size-8 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] shadow-md hover:bg-[var(--glass-bg-subtle)] hover:text-[var(--text-primary)]",
                uploading && "cursor-wait opacity-80",
              )}
              aria-label="Alterar foto de perfil"
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Camera className="size-3.5" />
              )}
            </ButtonGlass>
          </TooltipHost>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Em vez de subir direto, joga pro <AvatarCropDialog>
              // pro operador escolher o enquadramento. O upload
              // efetivo acontece em `onApply` lá embaixo.
              if (f) setPendingFile(f);
              e.target.value = "";
            }}
          />
        </div>

        <div className="min-w-0 flex-1 text-right">
          <p className="truncate font-display text-sm font-bold text-[var(--text-primary)]">
            {name || profile.name}
          </p>
          <p className="text-xs text-[var(--text-muted)]">Português (Brasil)</p>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--color-ink-muted)]">
            Use a câmera para enviar sua foto ou escolha um avatar pronto abaixo.
          </p>
        </div>
      </div>

      {/*
        Galeria de avatares preset (estilo Kommo). Clicar aplica só no
        preview (`avatarUrl`); persiste ao Salvar — mesma regra do upload.
      */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowPresets((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--brand-primary)]/40 hover:text-[var(--text-primary)]"
        >
          <Sparkles className="size-3.5" />
          {showPresets ? "Ocultar avatares" : "Escolher um avatar"}
        </button>

        {showPresets && (
          <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-8">
            {PRESET_AVATARS.map((url) => {
              const selected = avatarUrl === url;
              return (
                <button
                  key={url}
                  type="button"
                  aria-label="Selecionar avatar"
                  aria-pressed={selected}
                  onClick={() => {
                    setAvatarUrl(url);
                    toast.success("Avatar selecionado — clique em Salvar para aplicar.");
                  }}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-full ring-2 transition-all hover:scale-105",
                    selected
                      ? "ring-[var(--brand-primary)]"
                      : "ring-transparent hover:ring-[var(--glass-border)]",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="size-full object-cover" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Formulário ── */}
      <form
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Field id="name" label="Nome" required>
          <InputGlass
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </Field>

        <Field
          id="signature"
          label="Assinatura"
          hint="Aparece no final das suas mensagens. Vazio = usa seu nome."
        >
          <InputGlass
            id="signature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Ex.: Marcelo · Bwipo"
          />
        </Field>

        <Field id="phone" label="Telefone">
          <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 focus-within:ring-2 focus-within:ring-[var(--color-primary)]/30">
            <span
              className="inline-flex items-center gap-1 rounded-md bg-[var(--glass-bg-subtle)] px-2 py-1 text-xs font-bold text-[var(--text-muted)]"
              aria-hidden
            >
              <span className="text-sm leading-none">🇧🇷</span>
            </span>
            <InputGlass
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 96123-4567"
              autoComplete="tel"
              className="h-full flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
        </Field>

        <ChatThemeField profile={profile} queryClient={queryClient} />

        {/* ── Toggle de mensagem de finalização ── */}
        <div className="space-y-3 rounded-2xl">
          <label className="flex cursor-pointer items-center gap-3">
            <SwitchGlass
              checked={closingEnabled}
              onChange={setClosingEnabled}
              aria-label="Mensagem de finalização de conversa"
            />
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Mensagem de finalização de conversa
            </span>
          </label>

          {closingEnabled && (
            <>
              <div className="flex items-start gap-2 rounded-xl bg-[var(--color-primary-soft)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-primary-dark)]">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Se definida, tem precedência sobre a mensagem de finalização
                  configurada na organização.
                </span>
              </div>

              <Field
                id="closing-message"
                label="Sua mensagem de encerramento"
              >
                <Textarea
                  id="closing-message"
                  value={closingMessage}
                  onChange={(e) => setClosingMessage(e.target.value)}
                  placeholder="Sua mensagem de encerramento"
                  rows={4}
                  className="w-full resize-y rounded-xl text-sm placeholder:text-[var(--color-ink-muted)]"
                />
              </Field>
            </>
          )}
        </div>

        <BiometricLockField />

        <ButtonGlass
          type="submit"
          variant="primary"
          disabled={saveMutation.isPending}
          className="mt-4 h-11 w-full text-sm disabled:opacity-60"
        >
          {saveMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Salvar
        </ButtonGlass>
      </form>

      {/*
        Modal de enquadramento — abre automaticamente quando uma
        imagem é selecionada (`pendingFile != null`). O upload real
        só acontece em `onApply`, recebendo o JPEG já recortado.
      */}
      <AvatarCropDialog
        file={pendingFile}
        isApplying={uploading}
        onCancel={() => setPendingFile(null)}
        onApply={(cropped) => uploadAvatar(cropped)}
      />
    </GlassCard>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
      >
        {label}
        {required ? <span className="ml-0.5 text-primary">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-[var(--color-ink-muted)]">{hint}</p> : null}
    </div>
  );
}
