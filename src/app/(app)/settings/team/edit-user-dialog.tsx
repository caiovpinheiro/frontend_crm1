"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconCamera,
  IconLoader2 as Loader2,
  IconPencil,
  IconSparkles,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import * as React from "react";
import { toast } from "sonner";

import { AvatarCropDialog } from "@/components/profile/avatar-crop-dialog";
import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { InputGlass } from "@/components/crm/input-glass";
import { UserAvatar } from "@/components/crm/user-avatar";
import { FormDialog } from "@/components/ui/form-dialog";
import { TEAM_USERS_QUERY_PREFIX } from "@/features/shared/queries/team-users";
import { cn } from "@/lib/utils";

import { RevokeUserSessionsButton } from "./revoke-user-sessions-button";

const PRESET_AVATARS = Array.from(
  { length: 25 },
  (_, i) => `/avatars/presets/preset-${String(i + 1).padStart(2, "0")}.png`,
);

export type EditUserTarget = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  phone?: string | null;
};

type RoleOption = { value: string; label: string };

async function parseJsonError(res: Response, fallback: string): Promise<never> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  throw new Error(typeof data.message === "string" ? data.message : fallback);
}

export function EditUserDialog({
  user,
  roleOptions,
  roleId,
  onOpenChange,
}: {
  user: EditUserTarget | null;
  roleOptions: RoleOption[];
  roleId?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: session, update } = useSession();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [editRoleId, setEditRoleId] = React.useState<string | undefined>(undefined);
  const [showPresets, setShowPresets] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setPhone(user.phone ?? "");
    setAvatarUrl(user.avatarUrl ?? null);
    setEditRoleId(roleId);
    setShowPresets(false);
    setPendingFile(null);
  }, [user, roleId]);

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

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuário inválido.");
      const trimmedName = name.trim();
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedName) throw new Error("Nome inválido.");
      if (!trimmedEmail) throw new Error("E-mail inválido.");

      const res = await fetch(apiUrl(`/api/users/${user.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          phone: phone.trim(),
          avatarUrl: avatarUrl ?? "",
        }),
      });
      if (!res.ok) await parseJsonError(res, "Erro ao atualizar usuário.");

      if (editRoleId && editRoleId !== roleId) {
        const roleRes = await fetch(apiUrl(`/api/users/${user.id}/primary-role`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId: editRoleId }),
        });
        if (!roleRes.ok) await parseJsonError(roleRes, "Erro ao atualizar função.");
      }
    },
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: TEAM_USERS_QUERY_PREFIX });
      void qc.invalidateQueries({ queryKey: ["my-permissions"] });
      if (user && user.id === session?.user?.id) {
        await update({ name: name.trim() });
      }
      toast.success("Usuário atualizado.");
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar usuário."),
  });

  const canSave = name.trim().length > 0 && email.trim().length > 0 && !save.isPending && !uploading;

  return (
    <>
      <FormDialog
        open={user != null}
        onOpenChange={(open) => {
          if (!open && !save.isPending) onOpenChange(false);
        }}
        busy={save.isPending}
        size="md"
        icon={<IconPencil size={20} className="text-[var(--brand-primary)]" />}
        title="Editar usuário"
        description={
          user ? (
            <>
              Altere os dados de{" "}
              <span className="font-medium text-[var(--text-primary)]">{user.name}</span>.
            </>
          ) : null
        }
        footer={
          <>
            <ButtonGlass
              type="button"
              variant="glass"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Cancelar
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              disabled={!canSave}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <IconPencil size={16} />}
              Salvar
            </ButtonGlass>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <UserAvatar
                size={72}
                name={name || user?.name}
                imageUrl={avatarUrl}
                className="ring-4 ring-[var(--glass-bg-modal)] shadow-[var(--shadow-sm)]"
              />
              <ButtonGlass
                variant="icon"
                size="icon"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cn(
                  "absolute -bottom-1 -right-1 size-8 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] shadow-md hover:bg-[var(--glass-bg-subtle)] hover:text-[var(--text-primary)]",
                  uploading && "cursor-wait opacity-80",
                )}
                aria-label="Alterar foto de perfil"
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <IconCamera className="size-3.5" />
                )}
              </ButtonGlass>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setPendingFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-[var(--text-primary)]">
                Foto de perfil
              </p>
              <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
                Use a câmera para enviar uma foto ou escolha um avatar pronto.
              </p>
              <button
                type="button"
                onClick={() => setShowPresets((v) => !v)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--brand-primary)]/40 hover:text-[var(--text-primary)]"
              >
                <IconSparkles className="size-3.5" />
                {showPresets ? "Ocultar avatares" : "Escolher um avatar"}
              </button>
            </div>
          </div>

          {showPresets ? (
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
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
          ) : null}

          <div className="grid gap-1.5">
            <label htmlFor="edit-user-name" className="text-sm font-medium">
              Nome
            </label>
            <InputGlass
              id="edit-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              autoComplete="name"
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="edit-user-email" className="text-sm font-medium">
              E-mail
            </label>
            <InputGlass
              id="edit-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@empresa.com"
              autoComplete="email"
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="edit-user-phone" className="text-sm font-medium">
              Telefone
            </label>
            <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 focus-within:ring-2 focus-within:ring-[var(--color-primary)]/30">
              <span
                className="inline-flex items-center gap-1 rounded-md bg-[var(--glass-bg-subtle)] px-2 py-1 text-xs font-bold text-[var(--text-muted)]"
                aria-hidden
              >
                <span className="text-sm leading-none">🇧🇷</span>
              </span>
              <InputGlass
                id="edit-user-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 96123-4567"
                autoComplete="tel"
                className="h-full flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Função</span>
            <DropdownGlass
              options={roleOptions}
              value={editRoleId}
              placeholder="Definir função"
              onValueChange={(next) => setEditRoleId(next)}
              matchTriggerWidth
              triggerClassName="w-full"
            />
          </div>

          {user ? <RevokeUserSessionsButton userId={user.id} userName={user.name} /> : null}
        </div>
      </FormDialog>

      <AvatarCropDialog
        file={pendingFile}
        isApplying={uploading}
        onCancel={() => setPendingFile(null)}
        onApply={(cropped) => uploadAvatar(cropped)}
      />
    </>
  );
}
