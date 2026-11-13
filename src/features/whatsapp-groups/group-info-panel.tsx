"use client";

/**
 * Painel "Dados do grupo" (como no WhatsApp): nome, participantes e
 * "Mídia, links e docs" com prévia; dentro, abas Mídia / Documentos / Links.
 * Tudo sai das mensagens do grupo já gravadas no CRM.
 */
import { useState, type ReactNode } from "react";
import {
  IconArrowLeft as ArrowLeft,
  IconChevronRight as ChevronRight,
  IconDownload as Download,
  IconLink as LinkIcon,
  IconPhoto as Photo,
  IconPlayerPlayFilled as Play,
  IconUsers as Users,
  IconX as X,
} from "@tabler/icons-react";

import { ImageLightbox } from "@/components/crm/image-lightbox";
import { resolveMediaUrl } from "@/components/crm/message-bubble/media-helpers";
import { GroupGlyph } from "@/features/team-chat/avatar";
import { cn } from "@/lib/utils";

import { GroupCompany } from "./group-company";
import { docBadge, groupByMonth, mediaTotal, shortDate } from "./group-media";
import {
  useWhatsAppGroupLinks,
  useWhatsAppGroupMediaSummary,
  useWhatsAppGroupMediaTab,
} from "./hooks";
import type { GroupMediaItem, GroupMediaTab, WhatsAppGroupDetail } from "./types";

const ICON_BTN =
  "grid h-9 w-9 shrink-0 place-items-center rounded-[var(--orbita-radius-inner)] text-[var(--orbita-text-secondary)] transition-colors hover:bg-[var(--orbita-field)] hover:text-[var(--orbita-text)] disabled:opacity-50";

const SECTION = "border-b-[8px] border-[var(--orbita-field)]";

export function GroupInfoPanel({
  group,
  memberCount,
  members,
  onClose,
}: {
  group: WhatsAppGroupDetail;
  memberCount: number;
  /** Lista de participantes (a mesma de antes, com Inbox/Pipeline). */
  members: ReactNode;
  onClose: () => void;
}) {
  const [view, setView] = useState<"info" | GroupMediaTab>("info");

  return (
    <>
      <button
        type="button"
        aria-label="Fechar dados do grupo"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/30 md:hidden"
      />
      <aside className="orbita-block fixed inset-y-0 right-0 z-40 flex w-[min(100%,360px)] flex-col border-l border-[var(--orbita-divider)] md:static md:z-auto md:h-full md:w-[360px] md:shrink-0">
        {view === "info" ? (
          <InfoView
            group={group}
            memberCount={memberCount}
            members={members}
            onClose={onClose}
            onOpenMedia={() => setView("media")}
          />
        ) : (
          <MediaView group={group} tab={view} onTab={setView} onBack={() => setView("info")} onClose={onClose} />
        )}
      </aside>
    </>
  );
}

function PanelHeader({
  title,
  onBack,
  onClose,
}: {
  title: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border px-3">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="Voltar" className={ICON_BTN}>
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : null}
      <h3 className={cn("min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--orbita-text)]", !onBack && "pl-1")}>
        {title}
      </h3>
      <button type="button" onClick={onClose} aria-label="Fechar" className={ICON_BTN}>
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function InfoView({
  group,
  memberCount,
  members,
  onClose,
  onOpenMedia,
}: {
  group: WhatsAppGroupDetail;
  memberCount: number;
  members: ReactNode;
  onClose: () => void;
  onOpenMedia: () => void;
}) {
  const summary = useWhatsAppGroupMediaSummary(group.id);
  const total = mediaTotal(summary.data?.counts);
  const recent = summary.data?.recent ?? [];
  const extra = Math.max((summary.data?.counts.media ?? 0) - recent.length, 0);

  return (
    <>
      <PanelHeader title="Dados do grupo" onClose={onClose} />
      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
        <div className={cn("flex flex-col items-center px-5 pb-5 pt-6 text-center", SECTION)}>
          <GroupGlyph seed={group.id} size={96} name={group.name} />
          <h4 className="mt-3 text-[19px] font-semibold text-[var(--orbita-text)]">
            {group.name || "Grupo sem nome"}
          </h4>
          <p className="mt-1 text-[13.5px] text-[var(--orbita-text-secondary)]">
            Grupo ·{" "}
            <span className="font-semibold text-[var(--orbita-selected)]">
              {memberCount} participante{memberCount === 1 ? "" : "s"}
            </span>
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--orbita-text-tertiary)]">
            {group.description?.trim() || "Sem descrição"}
          </p>
          <GroupCompany group={group} />
        </div>

        <div className={cn("px-4 py-3.5", SECTION)}>
          <button
            type="button"
            onClick={onOpenMedia}
            className="flex w-full items-center gap-2.5 rounded-lg text-left text-[14.5px] font-semibold text-[var(--orbita-text)]"
          >
            <Photo className="h-5 w-5 text-[var(--orbita-text-secondary)]" />
            <span className="flex-1">Mídia, links e docs</span>
            <span className="text-[13px] font-medium text-[var(--orbita-text-tertiary)]">
              {summary.isLoading ? "…" : total}
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--orbita-text-tertiary)]" />
          </button>
          {recent.length > 0 ? (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {recent.map((item) => (
                <MediaTile key={item.id} item={item} className="aspect-square" />
              ))}
              {extra > 0 ? (
                <button
                  type="button"
                  onClick={onOpenMedia}
                  className="grid aspect-square place-items-center rounded-[10px] bg-[var(--orbita-field)] text-[15px] font-bold text-[var(--orbita-selected)]"
                >
                  +{extra}
                </button>
              ) : null}
            </div>
          ) : !summary.isLoading && total === 0 ? (
            <p className="mt-2 text-[12.5px] text-[var(--orbita-text-tertiary)]">
              Fotos, vídeos, documentos e links enviados no grupo aparecem aqui.
            </p>
          ) : null}
        </div>

        <div className="px-4 pb-2 pt-3.5">
          <p className="flex items-center gap-2.5 text-[14.5px] font-semibold text-[var(--orbita-text)]">
            <Users className="h-5 w-5 text-[var(--orbita-text-secondary)]" />
            <span className="flex-1">Participantes</span>
            <span className="text-[13px] font-medium text-[var(--orbita-text-tertiary)]">{memberCount}</span>
          </p>
        </div>
        <ul className="pb-2">{members}</ul>
      </div>
    </>
  );
}

const TABS: Array<{ id: GroupMediaTab; label: string }> = [
  { id: "media", label: "Mídia" },
  { id: "docs", label: "Documentos" },
  { id: "links", label: "Links" },
];

function MediaView({
  group,
  tab,
  onTab,
  onBack,
  onClose,
}: {
  group: WhatsAppGroupDetail;
  tab: GroupMediaTab;
  onTab: (t: GroupMediaTab) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const summary = useWhatsAppGroupMediaSummary(group.id);
  const counts = summary.data?.counts;

  return (
    <>
      <PanelHeader title="Mídia, links e docs" onBack={onBack} onClose={onClose} />
      <div role="tablist" className="flex shrink-0 gap-1.5 border-b border-border px-4 py-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              tab === t.id
                ? "bg-[var(--orbita-selected)] text-white"
                : "bg-[var(--orbita-field)] text-[var(--orbita-text-secondary)] hover:text-[var(--orbita-text)]",
            )}
          >
            {t.label}
            {counts ? <span className="ml-1 opacity-80">{counts[t.id]}</span> : null}
          </button>
        ))}
      </div>
      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto pb-4">
        {tab === "links" ? <LinksTab groupId={group.id} /> : <FilesTab groupId={group.id} kind={tab} />}
      </div>
    </>
  );
}

function EmptyTab({ text }: { text: string }) {
  return <p className="px-6 py-10 text-center text-[13px] text-[var(--orbita-text-tertiary)]">{text}</p>;
}

function LoadMore({ show, loading, onClick }: { show: boolean; loading: boolean; onClick: () => void }) {
  if (!show) return null;
  return (
    <div className="flex justify-center pt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-full border border-border bg-[var(--orbita-block)] px-4 py-1.5 text-[13px] font-medium text-[var(--orbita-text)] hover:bg-[var(--orbita-field)] disabled:opacity-60"
      >
        {loading ? "Carregando…" : "Carregar mais"}
      </button>
    </div>
  );
}

function FilesTab({ groupId, kind }: { groupId: string; kind: "media" | "docs" }) {
  const q = useWhatsAppGroupMediaTab(groupId, kind);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isLoading) return <EmptyTab text="Carregando…" />;
  if (q.isError) return <EmptyTab text="Não foi possível carregar. Tente de novo." />;
  if (items.length === 0) {
    return <EmptyTab text={kind === "media" ? "Nenhuma foto ou vídeo neste grupo ainda." : "Nenhum documento neste grupo ainda."} />;
  }
  const sections = groupByMonth(items);
  return (
    <>
      {sections.map((s) => (
        <section key={s.key}>
          <p className="px-4 pb-2 pt-4 text-[11.5px] font-bold uppercase tracking-wide text-[var(--orbita-text-tertiary)]">
            {s.label}
          </p>
          {kind === "media" ? (
            <div className="grid grid-cols-3 gap-1.5 px-4">
              {s.items.map((item) => (
                <MediaTile key={item.id} item={item} className="aspect-square" />
              ))}
            </div>
          ) : (
            <ul>
              {s.items.map((item) => (
                <DocRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </section>
      ))}
      <LoadMore show={Boolean(q.hasNextPage)} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}

/** Miniatura: foto carrega na grade (como no WhatsApp); clique abre grande. */
function MediaTile({ item, className }: { item: GroupMediaItem; className?: string }) {
  const [open, setOpen] = useState(false);
  const url = resolveMediaUrl(item.mediaUrl);
  if (!url) return null;
  const isVideo = item.messageType === "video";
  const title = `${item.author} · ${shortDate(item.createdAt)}`;

  if (isVideo) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className={cn("relative block overflow-hidden rounded-[10px] bg-slate-900", className)}
      >
        {/* Só os metadados: mostra o primeiro quadro sem baixar o vídeo. */}
        <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white">
            <Play className="h-4 w-4" />
          </span>
        </span>
      </a>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={title}
        className={cn("block overflow-hidden rounded-[10px] bg-[var(--orbita-field)]", className)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arquivo autenticado do storage do CRM */}
        <img src={url} alt={item.fileName ?? "Foto do grupo"} loading="lazy" className="h-full w-full object-cover" />
      </button>
      <ImageLightbox src={url} alt={item.fileName ?? "Foto do grupo"} open={open} onOpenChange={setOpen} />
    </>
  );
}

function DocRow({ item }: { item: GroupMediaItem }) {
  const url = resolveMediaUrl(item.mediaUrl);
  const name = item.fileName || "Arquivo";
  const badge = docBadge(item.fileName, item.mimeType);
  return (
    <li>
      <a
        href={url ?? undefined}
        download={name}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 border-b border-[var(--orbita-divider)] px-4 py-2.5 hover:bg-[var(--orbita-field)]"
      >
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-[10.5px] font-bold text-white"
          style={{ background: badge.color }}
        >
          {badge.label}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-[var(--orbita-text)]">{name}</span>
          <span className="block truncate text-[12px] text-[var(--orbita-text-tertiary)]">
            {item.author} · {shortDate(item.createdAt)}
          </span>
        </span>
        <Download className="h-4 w-4 shrink-0 text-[var(--orbita-text-tertiary)]" aria-label="Baixar" />
      </a>
    </li>
  );
}

function LinksTab({ groupId }: { groupId: string }) {
  const q = useWhatsAppGroupLinks(groupId);
  const links = q.data?.pages.flatMap((p) => p.links) ?? [];
  if (q.isLoading) return <EmptyTab text="Carregando…" />;
  if (q.isError) return <EmptyTab text="Não foi possível carregar. Tente de novo." />;
  if (links.length === 0) return <EmptyTab text="Nenhum link neste grupo ainda." />;
  return (
    <>
      {groupByMonth(links).map((s) => (
        <section key={s.key}>
          <p className="px-4 pb-2 pt-4 text-[11.5px] font-bold uppercase tracking-wide text-[var(--orbita-text-tertiary)]">
            {s.label}
          </p>
          <ul>
            {s.items.map((l) => (
              <li key={l.id}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 border-b border-[var(--orbita-divider)] px-4 py-2.5 hover:bg-[var(--orbita-field)]"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--orbita-field)] text-[var(--orbita-selected)]">
                    <LinkIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-[var(--orbita-selected)]">
                      {l.domain}
                    </span>
                    <span className="block truncate text-[12px] text-[var(--orbita-text-tertiary)]">
                      {l.author} · {shortDate(l.createdAt)} — {l.snippet}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <LoadMore show={Boolean(q.hasNextPage)} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}
