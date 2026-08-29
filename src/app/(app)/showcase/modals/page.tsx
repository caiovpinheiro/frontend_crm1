"use client";

/**
 * Catálogo unitário de modais em uso.
 * Abrir: /showcase/modals
 */

import * as React from "react";
import Link from "next/link";
import { Layers } from "lucide-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { PageHeader } from "@/components/crm/page-header";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { LIST_CARD_ROW_CLASS, LIST_CARD_STACK_CLASS } from "@/components/crm/sortable-header";
import { usePinDurationDialog } from "@/components/crm/pin-duration-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

import {
  FOUND_COUNT,
  GROUPS,
  LIVE_COUNT,
  NOTE_COUNT,
  UNITS,
  type ModalGroupId,
  type ModalUnit,
} from "./catalog";
import { LiveModalHost } from "./live-units";

export default function ModalsShowcasePage() {
  const [query, setQuery] = React.useState("");
  const [group, setGroup] = React.useState<ModalGroupId | "all">("all");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { requestDuration, dialog: pinDialog } = usePinDurationDialog();

  const q = query.trim().toLowerCase();
  const visible = UNITS.filter((u) => {
    if (group !== "all" && u.group !== group) return false;
    if (!q) return true;
    return (
      u.title.toLowerCase().includes(q) ||
      u.file.toLowerCase().includes(q) ||
      u.id.includes(q)
    );
  });

  const byGroup = GROUPS.map((g) => ({
    ...g,
    units: visible.filter((u) => u.group === g.id),
  })).filter((g) => g.units.length > 0);

  async function openUnit(unit: ModalUnit) {
    if (unit.kind === "confirm" && unit.confirm) {
      await confirm({
        title: unit.confirm.title,
        description: unit.confirm.description,
        confirmLabel: unit.confirm.confirmLabel,
        destructive: unit.confirm.destructive,
      });
      return;
    }
    if (unit.kind === "pin") {
      await requestDuration();
      return;
    }
    if (unit.kind === "live") {
      setOpenId(unit.id);
    }
  }

  return (
    <div className="min-h-screen bg-background p-6 lg:p-10">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-8">
        <PageHeader
          icon={<Layers size={22} />}
          title="Modais"
          center={
            <SearchFilterBar
              value={query}
              onChange={setQuery}
              placeholder="Filtrar por nome ou arquivo"
              withFilter={false}
            />
          }
          actions={
            <ButtonGlass variant="glass" size="sm" asChild>
              <Link href="/showcase">Design system</Link>
            </ButtonGlass>
          }
        />

        <p className="text-sm text-muted-foreground">
          {FOUND_COUNT} inventariadas · {LIVE_COUNT} abrem aqui com props mock · {NOTE_COUNT}{" "}
          acopladas à página de origem.
        </p>

        <nav className="flex flex-wrap gap-1.5" aria-label="Grupos">
          <GroupChip active={group === "all"} onClick={() => setGroup("all")} label="Todas" />
          {GROUPS.map((g) => (
            <GroupChip
              key={g.id}
              active={group === g.id}
              onClick={() => setGroup(g.id)}
              label={g.label}
            />
          ))}
        </nav>

        {byGroup.map((g) => (
          <section key={g.id} id={g.id} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">{g.label}</h2>
            <div className={LIST_CARD_STACK_CLASS}>
              {g.units.map((unit) => (
                <UnitRow key={unit.id} unit={unit} onOpen={() => void openUnit(unit)} />
              ))}
            </div>
          </section>
        ))}

        {visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nenhum modal com esse filtro.
          </p>
        ) : null}
      </div>

      {confirmDialog}
      {pinDialog}
      {openId ? <LiveModalHost id={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function GroupChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function UnitRow({ unit, onOpen }: { unit: ModalUnit; onOpen: () => void }) {
  const canOpen = unit.kind !== "note";
  return (
    <article className={cn(LIST_CARD_ROW_CLASS, "flex flex-wrap items-center gap-3")}>
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-tight text-foreground">{unit.title}</p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{unit.file}</p>
        {unit.note ? (
          <p className="mt-1 text-[12px] text-muted-foreground">
            {unit.note}
            {unit.href ? (
              <>
                {" "}
                <Link href={unit.href} className="text-primary underline-offset-2 hover:underline">
                  {unit.href}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      {canOpen ? (
        <ButtonGlass variant="primary" size="sm" type="button" onClick={onOpen}>
          Abrir
        </ButtonGlass>
      ) : (
        <span className="text-[11px] font-medium text-muted-foreground">Nota</span>
      )}
    </article>
  );
}
