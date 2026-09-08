"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  Briefcase,
  ClipboardList,
  Database,
  LogOut,
  MessageSquare,
  ShoppingCart,
  Tag,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { ProductPolicyPanel } from "@/components/ai-agents/product-policy-panel";
import { ToolPolicyForm } from "@/components/ai-agents/tool-config-panel";
import {
  emptyToolPolicy,
  isEmptyToolPolicy,
  type ToolConfigMap,
  type ToolPolicy,
} from "@/lib/ai-agents/steering";
import { TOOLS_CATALOG } from "@/lib/ai-agents/tools-catalog";
import { cn } from "@/lib/utils";

import { SectionHeader } from "../section-header";

const TOOL_ICONS: Record<string, LucideIcon> = {
  add_tag: Tag,
  move_stage: ArrowRightLeft,
  execute_distribution: ArrowRightLeft,
  consultar_matricula: Database,
  send_whatsapp_template: MessageSquare,
  transfer_to_department: Users,
  transfer_to_human: Users,
  close_conversation: LogOut,
  search_products: ShoppingCart,
  create_deal: Briefcase,
  create_activity: ClipboardList,
};

export function ToolsSection({
  enabledTools,
  onToggleTool,
  toolConfig,
  onToolConfigChange,
  productPolicy,
  onProductPolicyChange,
}: {
  enabledTools: string[];
  onToggleTool: (toolId: string) => void;
  toolConfig: ToolConfigMap;
  onToolConfigChange: (next: ToolConfigMap) => void;
  productPolicy: string;
  onProductPolicyChange: (v: string) => void;
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(
    enabledTools[0] ?? TOOLS_CATALOG[0]?.id ?? null,
  );

  React.useEffect(() => {
    if (selectedId && !TOOLS_CATALOG.some((t) => t.id === selectedId)) {
      setSelectedId(TOOLS_CATALOG[0]?.id ?? null);
    }
  }, [selectedId]);

  const selected = TOOLS_CATALOG.find((t) => t.id === selectedId) ?? null;
  const policy = selectedId
    ? (toolConfig[selectedId] ?? emptyToolPolicy())
    : emptyToolPolicy();

  const patchPolicy = (partial: Partial<ToolPolicy>) => {
    if (!selectedId) return;
    const nextPolicy = { ...emptyToolPolicy(), ...policy, ...partial };
    const next: ToolConfigMap = { ...toolConfig };
    if (isEmptyToolPolicy(nextPolicy)) delete next[selectedId];
    else next[selectedId] = nextPolicy;
    onToolConfigChange(next);
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Ferramentas"
        description="Liga ou desliga cada tool e, na selecionada, trava argumentos, tags e departamentos."
      />

      <div className="grid gap-2 sm:grid-cols-2">
        {TOOLS_CATALOG.map((t) => {
          const Icon = TOOL_ICONS[t.id] ?? Wrench;
          const active = enabledTools.includes(t.id);
          const selectedTool = selectedId === t.id;
          const hasPolicy = Boolean(toolConfig[t.id]);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setSelectedId(t.id);
                if (!active) onToggleTool(t.id);
              }}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                selectedTool
                  ? "border-primary bg-primary/10"
                  : active
                    ? "border-border bg-card hover:bg-muted/40"
                    : "border-border bg-card hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                  selectedTool || active
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {t.label}
                  {hasPolicy && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-normal text-primary">
                      travas
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                  {t.description}
                </span>
              </span>
              <span
                role="checkbox"
                aria-checked={active}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTool(t.id);
                }}
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border",
                )}
              >
                {active && <span className="text-[10px]">✓</span>}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <ToolPolicyForm
          tool={selected}
          enabled={enabledTools.includes(selected.id)}
          policy={policy}
          onChange={patchPolicy}
        />
      )}

      <ProductPolicyPanel
        value={productPolicy}
        onChange={onProductPolicyChange}
        enabled={enabledTools.includes("search_products")}
        compact
      />
    </div>
  );
}
