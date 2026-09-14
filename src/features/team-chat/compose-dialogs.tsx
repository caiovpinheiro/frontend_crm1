"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Hash, MessagesSquare, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  FormDialog,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { uploadTeamChatAttachment } from "./api";
import { Avatar, GroupGlyph } from "./avatar";
import { useTeamChatColleagues, useTeamChatMutations } from "./hooks";
import { toPerson } from "./helpers";
import type { TeamChatPerson, TeamChatRoom } from "./types";

const GROUP_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const GROUP_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

function resetCompose(
  setPicked: (v: string[]) => void,
  setName: (v: string) => void,
  setQ: (v: string) => void,
) {
  setPicked([]);
  setName("");
  setQ("");
}

export function ComposeDialog({
  open,
  onOpenChange,
  meId,
  intent = "dm",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meId: string;
  intent?: "dm" | "group";
  onCreated: (roomId: string) => void;
}) {
  const { data, isLoading } = useTeamChatColleagues(open);
  const { createRoom } = useTeamChatMutations();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const isGroup = intent === "group";

  useEffect(() => {
    if (!open) return;
    resetCompose(setPicked, setName, setQ);
  }, [open, intent]);

  const people = (data?.colleagues ?? []).filter((p) => p.id !== meId);
  const visible = people.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const canSubmit = isGroup
    ? picked.length >= 1 && !!name.trim() && !createRoom.isPending
    : picked.length === 1 && !createRoom.isPending;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isGroup ? "Novo grupo" : "Nova conversa"}
      description={
        isGroup
          ? "Nomeie o grupo, escolha os colegas. A foto entra nos dados do grupo em seguida."
          : "Escolha um colega para conversa direta."
      }
      icon={isGroup ? <Hash className="h-5 w-5" /> : <MessagesSquare className="h-5 w-5" />}
      size="md"
      footer={
        <>
          <ButtonGlass type="button" variant="glass" onClick={() => onOpenChange(false)}>Cancelar</ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            disabled={!canSubmit}
            onClick={() => {
              createRoom.mutate(
                { memberIds: picked, name: isGroup ? name.trim() : undefined },
                {
                  onSuccess: (res) => {
                    resetCompose(setPicked, setName, setQ);
                    onCreated(res.room.id);
                  },
                  onError: (e: Error) => toast.error(e.message),
                },
              );
            }}
          >
            {isGroup ? "Criar grupo" : "Conversar"}
          </ButtonGlass>
        </>
      }
    >
      {isGroup && (
        <div className="mb-3 space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Nome do grupo *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: comercial, plantão, dev" />
        </div>
      )}
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar colega" className="mb-3" />
      {isLoading && visible.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-muted-foreground">Carregando o time…</p>
      ) : (
        <PeoplePicker
          people={visible}
          picked={picked}
          onToggle={(id) =>
            setPicked((cur) => {
              if (cur.includes(id)) return cur.filter((x) => x !== id);
              return isGroup ? [...cur, id] : [id];
            })
          }
        />
      )}
    </FormDialog>
  );
}

export function AddMembersDialog({
  open,
  onOpenChange,
  room,
  meId,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  room: TeamChatRoom;
  meId: string;
  onDeleted?: (roomId: string) => void;
}) {
  const { data } = useTeamChatColleagues(open);
  const { addMembers, updateRoom, removeRoom } = useTeamChatMutations();
  const { confirm, dialog } = useConfirm();
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState(room.name);
  const [topic, setTopic] = useState(room.topic ?? "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const inRoom = new Set(room.members.map((m) => m.id));
  const people = (data?.colleagues ?? []).filter(
    (p) => p.id !== meId && !inRoom.has(p.id),
  );
  const photoBusy = uploadingPhoto || updateRoom.isPending;
  const metaDirty = name.trim() !== room.name || (topic.trim() || "") !== (room.topic ?? "");

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setName(room.name);
    setTopic(room.topic ?? "");
  }, [open, room.id, room.name, room.topic]);

  async function applyGroupPhoto(file: File) {
    if (!GROUP_PHOTO_TYPES.has(file.type)) {
      toast.error("Use uma imagem JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > GROUP_PHOTO_MAX_BYTES) {
      toast.error("Imagem muito grande (máx. 4 MB).");
      return;
    }
    setUploadingPhoto(true);
    try {
      const attachment = await uploadTeamChatAttachment(room.id, file);
      await updateRoom.mutateAsync({ roomId: room.id, avatarUrl: attachment.url });
      toast.success("Foto do grupo atualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar a foto.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setPicked([]);
        onOpenChange(v);
      }}
      title="Editar grupo"
      description="Altere foto, nome, tópico e participantes, ou exclua o grupo."
      icon={<Hash className="h-5 w-5" />}
      size="md"
      footer={
        <>
          <ButtonGlass type="button" variant="glass" className={formDialogCancelClass} onClick={() => onOpenChange(false)}>
            Fechar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={picked.length === 0 || addMembers.isPending}
            onClick={() => {
              addMembers.mutate(
                { roomId: room.id, memberIds: picked },
                {
                  onSuccess: () => {
                    setPicked([]);
                    toast.success("Membros adicionados");
                  },
                  onError: (e: Error) => toast.error(e.message),
                },
              );
            }}
          >
            Adicionar
          </ButtonGlass>
        </>
      }
    >
      <div className="mb-4 flex flex-col items-center gap-2">
        <input
          ref={photoRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={photoBusy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void applyGroupPhoto(file);
          }}
        />
        <button
          type="button"
          disabled={photoBusy}
          onClick={() => photoRef.current?.click()}
          aria-label="Trocar foto do grupo"
          className="relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <GroupGlyph seed={room.id} size={88} imageUrl={room.avatarUrl} name={room.name} />
          <span className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border border-border bg-card text-foreground shadow-sm">
            <Camera className="size-4" />
          </span>
        </button>
        <p className="text-[12px] text-muted-foreground">Clique na foto para trocar</p>
        {room.avatarUrl ? (
          <button
            type="button"
            disabled={photoBusy}
            onClick={() => {
              updateRoom.mutate(
                { roomId: room.id, avatarUrl: null },
                {
                  onSuccess: () => toast.success("Foto do grupo removida"),
                  onError: (e: Error) => toast.error(e.message),
                },
              );
            }}
            className="text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-40"
          >
            Remover foto
          </button>
        ) : null}
      </div>

      <span className={formLabelClass}>Nome do grupo</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={formControlClass}
        maxLength={80}
      />
      <span className={cn(formLabelClass, "mt-3")}>Tópico</span>
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        className={formControlClass}
        maxLength={200}
        placeholder="Sobre o que é este grupo"
      />
      <ButtonGlass
        type="button"
        variant="primary"
        className={cn(formDialogPrimaryClass, "mt-2")}
        disabled={!metaDirty || !name.trim() || updateRoom.isPending}
        onClick={() => {
          updateRoom.mutate(
            { roomId: room.id, name: name.trim(), topic: topic.trim() || null },
            {
              onSuccess: () => toast.success("Dados do grupo salvos"),
              onError: (e: Error) => toast.error(e.message),
            },
          );
        }}
      >
        Salvar dados
      </ButtonGlass>

      <p className={cn(formLabelClass, "mt-5")}>
        {room.memberCount} participante{room.memberCount === 1 ? "" : "s"}
      </p>
      <ul className="mb-3 max-h-40 space-y-0.5 overflow-y-auto rounded-xl border border-border p-1">
        {room.members.map((member) => (
          <li key={member.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <Avatar person={toPerson(member)} size="xs" showPresence />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
              {member.name}
              {member.id === meId ? " (você)" : ""}
            </span>
          </li>
        ))}
      </ul>

      <p className={formLabelClass}>
        <UserPlus className="mr-1 inline size-3.5" />
        Adicionar participantes
      </p>
      <PeoplePicker people={people} picked={picked} onToggle={(id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))} />

      <div className="mt-5 border-t border-border pt-4">
        <ButtonGlass
          type="button"
          variant="danger"
          disabled={removeRoom.isPending}
          onClick={() => {
            void confirm({
              title: "Excluir grupo?",
              description: `“${room.name}” some para todos os participantes. Mensagens e notas deste grupo serão apagadas. Esta ação não pode ser desfeita.`,
              confirmLabel: "Excluir grupo",
              pendingLabel: "Excluindo…",
              destructive: true,
              action: async () => {
                try {
                  await removeRoom.mutateAsync(room.id);
                  toast.success("Grupo excluído");
                  onDeleted?.(room.id);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Não foi possível excluir o grupo.");
                  throw err;
                }
              },
            });
          }}
        >
          Excluir grupo
        </ButtonGlass>
      </div>
      {dialog}
    </FormDialog>
  );
}

function PeoplePicker({
  people,
  picked,
  onToggle,
}: {
  people: TeamChatPerson[];
  picked: string[];
  onToggle: (id: string) => void;
}) {
  if (people.length === 0) {
    return <p className="py-6 text-center text-[12px] text-muted-foreground">Nenhum colega nesta organização além de você.</p>;
  }
  return (
    <div className="max-h-72 space-y-0.5 overflow-y-auto">
      {people.map((p) => {
        const on = picked.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            className={cn("flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left", on ? "bg-primary/10" : "hover:bg-muted")}
          >
            <Avatar person={toPerson(p)} size="sm" showPresence />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{p.name}</span>
            {on && <span className="text-[11px] font-semibold text-primary">selecionado</span>}
          </button>
        );
      })}
    </div>
  );
}
