"use client";

import { apiUrl } from "@/lib/api";
import * as React from "react";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { TagChipOptionsList } from "@/components/crm/tag-chip-options-list";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { IconCheck as Check, IconChevronDown as ChevronDown, IconPackage as Package, IconPencil as Pencil, IconPlus as Plus, IconSend as Send, IconX as X } from "@tabler/icons-react";
import { toast } from "sonner";

import { useConfirm } from "@/hooks/use-confirm";
import { CustomFieldsSection } from "@/components/contacts/custom-fields-section";
import { DealCustomFieldsSection } from "@/components/pipeline/deal-custom-fields-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { insertComposerSequence, insertComposerText } from "@/lib/composer-insert";
import { dt } from "@/lib/design-tokens";
import { AvailabilityBadge } from "@/features/products-v2/availability-badge";
import {
  COURSE_LEVEL_LABEL,
  COURSE_MODE_LABEL,
  type CourseLevel,
  type CourseMode,
} from "@/features/products-v2/types";
import { cn, formatCurrency, getInitials, tagPillStyle } from "@/lib/utils";

import {
  CatalogProduct,
  catalogProductSubtitle,
  ContactDetail,
  ContactInfoRows,
  DealDetailData,
  DealProductItem,
  SidebarSection,
} from "./shared";

type DealSidebarProps = {
  contact: ContactDetail;
  deal: DealDetailData;
  users: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    agentStatus?: { status: "ONLINE" | "OFFLINE" | "AWAY"; availableForVoiceCalls?: boolean; updatedAt?: string } | null;
  }[];
  stageOptions: { id: string; name: string; color?: string }[];
  onStageChange: (stageId: string) => void;
  stagePending: boolean;
  onOwnerChange: (ownerId: string | null) => void;
  ownerPending: boolean;
  onContactUpdate: (data: Record<string, unknown>) => void;
  isUpdating: boolean;
};

export function DealSidebar({
  contact,
  deal,
  users,
  stageOptions,
  onStageChange,
  stagePending,
  onOwnerChange,
  ownerPending,
  onContactUpdate,
  isUpdating,
}: DealSidebarProps) {
  const queryClient = useQueryClient();
  const _confirmDialog = useConfirm();
  const { data: sessionData } = useSession();
  const userRole = (sessionData?.user as { role?: string })?.role ?? "MEMBER";
  const canCreateTag = userRole === "ADMIN" || userRole === "MANAGER";

  const [editingBasic, setEditingBasic] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: "", email: "", phone: "", source: "" });
  const [tagInput, setTagInput] = React.useState("");
  const [tagColor, setTagColor] = React.useState("#6366f1");

  const addTagMutation = useMutation({
    mutationFn: async ({ tagId, tagName, color }: { tagId?: string; tagName?: string; color?: string }) => {
      const res = await fetch(apiUrl(`/api/deals/${deal.id}/tags`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tagId ? { tagId } : { tagName, color }),
      });
      if (!res.ok) throw new Error("Erro ao adicionar tag");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal", deal.id] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-board"] });
      setTagInput("");
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const res = await fetch(apiUrl(`/api/deals/${deal.id}/tags`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      if (!res.ok) throw new Error("Erro ao remover tag");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal", deal.id] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-board"] });
    },
  });

  const startEdit = () => {
    setDraft({
      name: contact.name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      source: contact.source ?? "",
    });
    setEditingBasic(true);
  };

  const saveBasic = () => {
    const payload: Record<string, unknown> = {};
    if (draft.name.trim() !== contact.name) payload.name = draft.name.trim();
    if (draft.email.trim() !== (contact.email ?? "")) payload.email = draft.email.trim() || null;
    if (draft.phone.trim() !== (contact.phone ?? "")) payload.phone = draft.phone.trim() || null;
    if (Object.keys(payload).length > 0) onContactUpdate(payload);
    setEditingBasic(false);
  };

  return (
    <div className="space-y-3">
      <SidebarDealSummaryCard
        deal={deal}
        contact={contact}
        users={users}
        stageOptions={stageOptions}
        onStageChange={onStageChange}
        stagePending={stagePending}
        onOwnerChange={onOwnerChange}
        ownerPending={ownerPending}
        tagInput={tagInput}
        setTagInput={setTagInput}
        tagColor={tagColor}
        setTagColor={setTagColor}
        canCreateTag={canCreateTag}
        onAddTag={() => {
          if (tagInput.trim()) addTagMutation.mutate({ tagName: tagInput.trim(), color: tagColor });
        }}
        onSelectExistingTag={(tagId: string) => {
          addTagMutation.mutate({ tagId });
        }}
        addTagPending={addTagMutation.isPending}
        onRemoveTag={(tagId) => removeTagMutation.mutate(tagId)}
        removeTagPending={removeTagMutation.isPending}
      />

      <DealOrgUnitSection dealId={deal.id} currentUnitId={deal.orgUnitId ?? null} />
      <DealProductsSection dealId={deal.id} compact />
      <DealQuotasSection dealId={deal.id} />
      <DealCustomFieldsSection dealId={deal.id} layoutContext="deal_panel_v2" />
      <CustomFieldsSection contactId={contact.id} layoutContext="inbox_lead_v2" />

      <SidebarSection
        title="Contato"
        action={
          !editingBasic ? (
            <Button type="button" variant="ghost" size="icon" className="size-7 rounded-xl" onClick={startEdit}>
              <Pencil className="size-3" />
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="size-7 rounded-xl" onClick={() => setEditingBasic(false)}>
                <X className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 rounded-xl text-success"
                onClick={saveBasic}
                disabled={isUpdating}
              >
                <Check className="size-3" />
              </Button>
            </div>
          )
        }
      >
        {editingBasic ? (
          <div className="grid gap-1.5">
            {(
              [
                ["Nome", "name", "text"],
                ["E-mail", "email", "email"],
                ["Telefone", "phone", "tel"],
              ] as const
            ).map(([label, key, type]) => (
              <div key={key} className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</Label>
                <Input
                  type={type}
                  value={draft[key]}
                  onChange={(e) => setDraft((p) => ({ ...p, [key]: e.target.value }))}
                  className="h-9 rounded-lg border-border bg-[var(--color-bg-subtle)] text-sm"
                />
              </div>
            ))}
            {contact.source && (
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">Fonte</Label>
                <div className="flex h-9 items-center rounded-lg border border-border bg-muted px-3 text-sm text-ink-muted">
                  {contact.source}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-2">
              {contact.company ? (
                <Badge variant="outline" className="rounded-full border-border bg-white px-3 py-1 text-xs font-semibold text-[var(--color-ink-soft)]">
                  {contact.company.name}
                </Badge>
              ) : null}
              {contact.source ? (
                <Badge variant="outline" className="rounded-full border-border bg-white px-3 py-1 text-xs font-semibold text-[var(--color-ink-soft)]">
                  {contact.source}
                </Badge>
              ) : null}
            </div>
            <div className="rounded-lg border border-border bg-[var(--color-bg-subtle)] px-4 py-3">
              <ContactInfoRows contact={contact} />
            </div>
          </div>
        )}
      </SidebarSection>

      {contact.deals.length > 1 && (
        <SidebarSection
          title={`Relacionamento (${contact.deals.length - 1})`}
          description="Outros negócios conectados a este mesmo contato."
        >
          <div className="grid gap-1.5">
            {contact.deals
              .filter((d) => d.id !== deal.id)
              .map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-[var(--color-bg-subtle)] px-3.5 py-2.5 text-sm"
                >
                  <span className="truncate font-medium">{d.title}</span>
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0.5 text-[10px]"
                    style={{ borderColor: `${d.stage.color}60`, color: d.stage.color }}
                  >
                    {d.stage.name}
                  </Badge>
                </div>
              ))}
          </div>
        </SidebarSection>
      )}
    </div>
  );
}

type CoursePricingPick = {
  price: number;
  channel: string | null;
  discountPercent: number | null;
  installments: number | null;
  months: number | null;
};

function normalizeCoursePricingOptions(product: {
  price?: unknown;
  courseConfig?: {
    channel?: string | null;
    discountPercent?: unknown;
    pricingOptions?: Array<{
      price?: unknown;
      channel?: string | null;
      discountPercent?: unknown;
      installments?: unknown;
      months?: unknown;
    }> | null;
  } | null;
}): CoursePricingPick[] {
  const cc = product.courseConfig;
  if (!cc) return [];
  const raw = Array.isArray(cc.pricingOptions) ? cc.pricingOptions : [];
  const parsePositiveInt = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
  };
  if (raw.length > 0) {
    return raw.map((o) => ({
      price: Number(o.price) || 0,
      channel: typeof o.channel === "string" && o.channel.trim() ? o.channel.trim() : null,
      discountPercent:
        o.discountPercent === null || o.discountPercent === undefined || o.discountPercent === ""
          ? null
          : Number(o.discountPercent),
      installments: parsePositiveInt(o.installments),
      months: parsePositiveInt(o.months),
    }));
  }
  // Compat: campos legados espelham a 1ª opção
  if (cc.channel != null || cc.discountPercent != null) {
    return [
      {
        price: Number(product.price) || 0,
        channel: typeof cc.channel === "string" && cc.channel.trim() ? cc.channel.trim() : null,
        discountPercent:
          cc.discountPercent === null || cc.discountPercent === undefined || cc.discountPercent === ""
            ? null
            : Number(cc.discountPercent),
        installments: null,
        months: null,
      },
    ];
  }
  return [];
}

/** Encontra a cota do curso que bate com preço/desconto do item do negócio. */
function matchCoursePricingOption(
  options: CoursePricingPick[],
  unitPrice: number,
  discount: number,
): CoursePricingPick | null {
  if (options.length === 0) return null;
  const price = Number(unitPrice) || 0;
  const disc = Number(discount) || 0;
  const exact = options.find(
    (o) =>
      Math.abs(o.price - price) < 0.005 &&
      Math.abs((o.discountPercent ?? 0) - disc) < 0.005,
  );
  if (exact) return exact;
  const byPrice = options.find((o) => Math.abs(o.price - price) < 0.005);
  return byPrice ?? options[0] ?? null;
}

function pricingOptionFinal(option: CoursePricingPick): number {
  const disc = option.discountPercent ?? 0;
  return option.price * (1 - Math.min(100, Math.max(0, disc)) / 100);
}

function formatMoneyPlain(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function buildCourseOfferMessage(input: {
  name: string;
  levelLabel: string;
  grau: string;
  modeLabel: string;
  semesterLabel: string;
  basePrice: number;
  promoPrice: number;
  /** Pós-graduação: parcelas da cota selecionada. */
  installments?: number | null;
}): string {
  const lines = [
    `🎓 Conheça o curso de ${input.name}!`,
    "",
    "Confira as principais informações:",
    "",
    `📚 Nível: ${input.levelLabel}`,
    `🎓 Grau: ${input.grau}`,
    `💻 Modalidade: ${input.modeLabel}`,
    `⏳ Duração: ${input.semesterLabel}`,
  ];
  if (
    input.installments != null &&
    Number.isFinite(input.installments) &&
    input.installments > 0
  ) {
    lines.push(`💳 Parcelas: ${input.installments}x`);
  }
  lines.push(
    "",
    `💰 Valor original: ~R$ ${formatMoneyPlain(input.basePrice)}~`,
    `🔥 Valor promocional: R$ ${formatMoneyPlain(input.promoPrice)}`,
    "",
    "Essa é uma condição especial disponível para sua inscrição. 😊",
    "",
    "Se tiver interesse, me avise por aqui que te explico os próximos passos para garantir sua vaga e aproveitar o desconto! 🎓",
  );
  return lines.join("\n");
}

function buildSimpleProductMessage(item: DealProductItem): string {
  const base = Number(item.unitPrice) || 0;
  const promo =
    base * (1 - Math.min(100, Math.max(0, Number(item.discount) || 0)) / 100);
  const qty = Number(item.quantity) || 1;
  const unit = item.unit?.trim() || "un.";
  const lines = [`📦 ${item.productName}`, "", `Quantidade: ${qty} ${unit}`];
  if (item.discount > 0) {
    lines.push(
      `Valor original: ~R$ ${formatMoneyPlain(base)}~`,
      `Valor promocional: R$ ${formatMoneyPlain(promo)}`,
    );
  } else {
    lines.push(`Valor: R$ ${formatMoneyPlain(Number(item.total) || promo)}`);
  }
  return lines.join("\n");
}

type ProductCustomFieldValue = { fieldId: string; label: string; value: string };

export function DealProductsSection({
  dealId,
  compact: _compact = false,
  hideTitle = false,
}: {
  dealId: string;
  /** @deprecated sem efeito — layout unificado. */
  compact?: boolean;
  /**
   * Quando true (ContactAside): omite o título "Produtos" e o card chrome
   * pesado — o SectionHeader do pai já fornece ambos. Mantém badge + Adicionar.
   */
  hideTitle?: boolean;
}) {
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();
  const [showAdd, setShowAdd] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [editingItem, setEditingItem] = React.useState<string | null>(null);
  const [editQty, setEditQty] = React.useState("");
  const [editDiscount, setEditDiscount] = React.useState("");
  const [pendingPricing, setPendingPricing] = React.useState<{
    productId: string;
    productName: string;
    options: CoursePricingPick[];
  } | null>(null);
  const [editPricing, setEditPricing] = React.useState<{
    itemId: string;
    productId: string;
    productName: string;
    options: CoursePricingPick[];
  } | null>(null);
  const [loadingCatalogId, setLoadingCatalogId] = React.useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = React.useState<string | null>(null);
  /** id do line-item cujo "enviar mensagem" está em andamento (null = idle). */
  const [sendingCourseOfferId, setSendingCourseOfferId] = React.useState<string | null>(null);
  const [selectedCourseIds, setSelectedCourseIds] = React.useState<string[]>([]);

  const itemsKey = ["deal-products", dealId] as const;

  const { data: items = [] } = useQuery({
    queryKey: itemsKey,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/products`));
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items ?? []) as DealProductItem[];
    },
  });

  // P2-11: uma única request para os custom fields de TODOS os produtos do
  // deal (antes era 1 por produto renderizado).
  const productIds = React.useMemo(
    () => Array.from(new Set(items.map((i) => i.productId).filter(Boolean))).sort(),
    [items],
  );

  const { data: customFieldsByProduct = {} } = useQuery({
    queryKey: ["product-cf-values-batch", productIds],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/products/custom-fields?ids=${productIds.join(",")}`));
      if (!res.ok) return {};
      return res.json() as Promise<Record<string, ProductCustomFieldValue[]>>;
    },
    enabled: productIds.length > 0,
    staleTime: 60_000,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["products-catalog", search],
    queryFn: async () => {
      const params = new URLSearchParams({ perPage: "20" });
      if (search) params.set("search", search);
      const res = await fetch(apiUrl(`/api/products?${params}`));
      if (!res.ok) return [];
      const data = await res.json();
      return (data.products ?? []) as CatalogProduct[];
    },
    enabled: showAdd && !pendingPricing,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: itemsKey });
    queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
    queryClient.invalidateQueries({ queryKey: ["pipeline-board"] });
  };

  async function readErrorMessage(res: Response, fallback: string): Promise<string> {
    try {
      const data = await res.json();
      const msg = (data as { message?: unknown })?.message;
      if (typeof msg === "string" && msg.trim()) return msg;
    } catch { /* ignore */ }
    return fallback;
  }

  type AddProductPayload = {
    productId: string;
    unitPrice?: number;
    discount?: number;
    channel?: string | null;
  };

  const addMutation = useMutation({
    mutationFn: async (payload: AddProductPayload) => {
      const body: Record<string, unknown> = { productId: payload.productId };
      if (payload.unitPrice !== undefined) body.unitPrice = payload.unitPrice;
      if (payload.discount !== undefined) body.discount = payload.discount;
      if (payload.channel !== undefined) body.channel = payload.channel;
      const res = await fetch(apiUrl(`/api/deals/${dealId}/products`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Falha ao adicionar produto."));
    },
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      setSearch("");
      setPendingPricing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleCatalogProductClick(p: CatalogProduct) {
    if (addMutation.isPending || loadingCatalogId) return;
    setLoadingCatalogId(p.id);
    try {
      const res = await fetch(apiUrl(`/api/products/${p.id}`));
      if (!res.ok) {
        addMutation.mutate({ productId: p.id });
        return;
      }
      const data = (await res.json()) as { product?: Parameters<typeof normalizeCoursePricingOptions>[0] & { kind?: string; name?: string } };
      const product = data.product;
      if (!product) {
        addMutation.mutate({ productId: p.id });
        return;
      }
      const options = normalizeCoursePricingOptions(product);
      if (options.length > 1) {
        setPendingPricing({
          productId: p.id,
          productName: product.name ?? p.name,
          options,
        });
        return;
      }
      if (options.length === 1) {
        const option = options[0];
        addMutation.mutate({
          productId: p.id,
          unitPrice: option.price,
          discount: option.discountPercent ?? 0,
          channel: option.channel,
        });
        return;
      }
      addMutation.mutate({ productId: p.id });
    } catch {
      addMutation.mutate({ productId: p.id });
    } finally {
      setLoadingCatalogId(null);
    }
  }

  const updateMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Record<string, unknown> }) => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/products/${itemId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Falha ao atualizar item."));
    },
    onSuccess: () => {
      invalidate();
      setEditingItem(null);
      setEditPricing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/products/${itemId}`), { method: "DELETE" });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Falha ao remover produto."));
    },
    onSuccess: () => { invalidate(); toast.success("Produto removido."); },
    onError: (err: Error) => toast.error(err.message),
  });

  const totalValue = items.reduce((s, i) => s + i.total, 0);
  const showTotal =
    items.length > 1 || items.some((i) => i.quantity !== 1 || i.discount > 0);

  const startQtyDiscountEdit = (item: DealProductItem) => {
    setEditPricing(null);
    setEditingItem(item.id);
    setEditQty(String(item.quantity));
    setEditDiscount(String(item.discount));
  };

  async function startEdit(item: DealProductItem) {
    if (item.productType === "SERVICE" || loadingEditId || updateMutation.isPending) return;
    setLoadingEditId(item.id);
    try {
      const res = await fetch(apiUrl(`/api/products/${item.productId}`));
      if (res.ok) {
        const data = (await res.json()) as {
          product?: Parameters<typeof normalizeCoursePricingOptions>[0] & { name?: string };
        };
        const options = data.product ? normalizeCoursePricingOptions(data.product) : [];
        if (options.length > 1) {
          setEditingItem(null);
          setEditPricing({
            itemId: item.id,
            productId: item.productId,
            productName: data.product?.name ?? item.productName,
            options,
          });
          return;
        }
      }
      startQtyDiscountEdit(item);
    } catch {
      startQtyDiscountEdit(item);
    } finally {
      setLoadingEditId(null);
    }
  }

  const saveEdit = (itemId: string) => {
    updateMutation.mutate({
      itemId,
      data: { quantity: parseFloat(editQty) || 1, discount: parseFloat(editDiscount) || 0 },
    });
  };

  const applyEditPricingOption = (option: CoursePricingPick) => {
    if (!editPricing) return;
    updateMutation.mutate({
      itemId: editPricing.itemId,
      data: {
        quantity: 1,
        unitPrice: option.price,
        discount: option.discountPercent ?? 0,
      },
    });
  };

  const courseItems = items.filter((i) => i.productKind === "COURSE");
  const canSelectProducts = items.length >= 2;
  const selectedItems = items.filter((i) => selectedCourseIds.includes(i.id));

  React.useEffect(() => {
    const live = new Set(items.map((i) => i.id));
    setSelectedCourseIds((prev) => {
      const next = prev.filter((id) => live.has(id));
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });
  }, [items]);

  function toggleCourseSelect(item: DealProductItem) {
    if (!canSelectProducts) return;
    setSelectedCourseIds((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id],
    );
  }

  async function loadCourseOfferMessage(item: DealProductItem): Promise<string | null> {
    const res = await fetch(apiUrl(`/api/products/${item.productId}`));
    if (!res.ok) {
      return buildSimpleProductMessage(item);
    }
    const data = (await res.json()) as {
      product?: Parameters<typeof normalizeCoursePricingOptions>[0] & {
        name?: string;
        courseConfig?: {
          level?: CourseLevel | null;
          grau?: string | null;
          mode?: CourseMode | null;
          semester?: number | null;
        } | null;
      };
    };
    const product = data.product;
    if (!product?.courseConfig) {
      return buildSimpleProductMessage(item);
    }
    const cc = product.courseConfig;
    const level = cc.level ? COURSE_LEVEL_LABEL[cc.level] : "—";
    const mode = cc.mode ? COURSE_MODE_LABEL[cc.mode] : "—";
    const grau = cc.grau?.trim() || "—";
    const matched =
      cc.level === "POSTGRADUATE"
        ? matchCoursePricingOption(
            normalizeCoursePricingOptions(product),
            Number(item.unitPrice) || 0,
            Number(item.discount) || 0,
          )
        : null;
    const semesterLabel =
      cc.level === "POSTGRADUATE" && matched?.months != null
        ? `${matched.months} meses`
        : cc.semester != null && Number.isFinite(Number(cc.semester))
          ? cc.level === "POSTGRADUATE"
            ? `${cc.semester} meses`
            : `${cc.semester}º semestre`
          : "—";
    const basePrice = Number(item.unitPrice) || 0;
    const promoPrice =
      basePrice * (1 - Math.min(100, Math.max(0, Number(item.discount) || 0)) / 100);

    return buildCourseOfferMessage({
      name: product.name ?? item.productName,
      levelLabel: level,
      grau,
      modeLabel: mode,
      semesterLabel,
      basePrice,
      promoPrice,
      installments: cc.level === "POSTGRADUATE" ? matched?.installments ?? null : null,
    });
  }

  function usesCourseOfferCopy(item: DealProductItem) {
    return item.productKind === "COURSE" && item.productType !== "SERVICE";
  }

  async function messageForProductItem(item: DealProductItem): Promise<string> {
    if (usesCourseOfferCopy(item)) {
      try {
        const message = await loadCourseOfferMessage(item);
        if (message?.trim()) return message;
      } catch {
        // cai no bloco simples abaixo
      }
    }
    return buildSimpleProductMessage(item);
  }

  async function handleSendCourseOffers(targets: DealProductItem[]) {
    const list = targets;
    if (list.length === 0 || sendingCourseOfferId) return;
    setSendingCourseOfferId(list[0].id);
    try {
      const steps: { text: string; media: { url: string; name: string | null; mimeType: string | null; sendBeforeText: true }[] }[] =
        [];
      for (const item of list) {
        const text = (await messageForProductItem(item)).trim();
        if (!text) continue;
        const imageUrl =
          typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
        steps.push({
          text,
          media: imageUrl
            ? [
                {
                  url: imageUrl,
                  name: item.imageName ?? null,
                  mimeType: item.imageMime ?? null,
                  sendBeforeText: true,
                },
              ]
            : [],
          productId: item.productId,
        });
      }
      if (steps.length === 0) return;
      if (steps.length === 1 && !steps[0].productId) {
        insertComposerText(steps[0].text, steps[0].media);
        toast.success("Mensagem do produto pronta no chat — confira e envie.");
      } else {
        insertComposerSequence(steps);
      }
    } catch {
      toast.error("Falha ao preparar a mensagem dos produtos.");
    } finally {
      setSendingCourseOfferId(null);
    }
  }

  function handleSendCourseOffer(item: DealProductItem) {
    void handleSendCourseOffers([item]);
  }

  return (
    <div
      className={
        hideTitle
          ? "min-w-0"
          : "overflow-hidden rounded-2xl border border-border bg-white shadow-sm"
      }
    >
      {/* ── Cabeçalho ──
          hideTitle: só badge + Adicionar (SectionHeader já mostra "Produtos"). */}
      <div
        className={cn(
          "flex items-center gap-2",
          hideTitle ? "py-1" : "px-4 py-3",
        )}
      >
        {!hideTitle && (
          <span className="text-sm font-bold text-foreground">Produtos</span>
        )}
        {items.length > 0 && (
          <span className="rounded-full bg-[var(--color-enterprise-bg)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--brand-primary)]">
            {items.length}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setShowAdd((v) => !v);
            setPendingPricing(null);
          }}
          aria-label={showAdd ? "Fechar busca de produto" : "Adicionar produto"}
          className="flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-3 py-1 text-[12px] font-semibold text-white transition-all hover:brightness-110 active:scale-95"
        >
          <Plus className="size-3" strokeWidth={2.5} />
          Adicionar
        </button>
      </div>

      {/* ── Painel de busca / adicionar ── */}
      {showAdd && (
        <div className="space-y-2 border-t border-border px-4 pb-3 pt-2">
          {pendingPricing ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
                    Escolha o preço / cota
                  </p>
                  <p className="truncate text-sm font-semibold text-foreground" title={pendingPricing.productName}>
                    {pendingPricing.productName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingPricing(null)}
                  className="shrink-0 text-xs font-medium text-[var(--brand-primary)] hover:underline"
                >
                  Voltar
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-white shadow-sm">
                {pendingPricing.options.map((option, idx) => {
                  const disc = option.discountPercent ?? 0;
                  const finalPrice = pricingOptionFinal(option);
                  return (
                    <button
                      key={`${option.channel ?? "canal"}-${option.price}-${idx}`}
                      type="button"
                      disabled={addMutation.isPending}
                      onClick={() =>
                        addMutation.mutate({
                          productId: pendingPricing.productId,
                          unitPrice: option.price,
                          discount: disc,
                          channel: option.channel,
                        })
                      }
                      className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5 text-left text-sm last:border-b-0 transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">
                          {option.channel || "Sem cota"}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-[var(--color-ink-soft)]">
                          Base {formatCurrency(option.price)}
                          {disc > 0 ? ` · -${disc}%` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-success">
                        {formatCurrency(finalPrice)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto…"
                className="h-9 rounded-xl border-border bg-[var(--color-bg-subtle)] text-sm"
                autoFocus
              />
              <div className="max-h-44 overflow-y-auto rounded-xl border border-border bg-white shadow-sm">
                {catalog.length === 0 ? (
                  <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                    Nenhum produto encontrado
                  </p>
                ) : (
                  catalog.map((p) => {
                    const subtitle = catalogProductSubtitle(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleCatalogProductClick(p)}
                        disabled={addMutation.isPending || loadingCatalogId === p.id}
                        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-60"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{p.name}</span>
                          {subtitle ? (
                            <span className="ml-1 text-muted-foreground">({subtitle})</span>
                          ) : null}
                          {p.type === "SERVICE" && (
                            <span className="ml-1.5 rounded bg-lavender-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                              Serviço
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-success">
                          {loadingCatalogId === p.id ? "…" : formatCurrency(Number(p.price))}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Lista de itens ── */}
      {items.length === 0 ? (
        <div className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
          Nenhum produto vinculado.
        </div>
      ) : (
        <>
          {items.map((item, idx) => (
            <div
              key={item.id}
              className={cn(
                "px-4 py-3",
                idx === 0 && "border-t border-border",
                idx < items.length - 1 && "border-b border-border/60",
              )}
            >
              {/* Modo edição: picker de preço/canal (curso com 2+ opções) */}
              {editPricing?.itemId === item.id ? (
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
                        Escolha o preço / cota
                      </p>
                      <p className="truncate text-sm font-semibold text-foreground" title={editPricing.productName}>
                        {editPricing.productName}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 rounded-lg"
                      aria-label="Cancelar edição"
                      onClick={() => setEditPricing(null)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-white shadow-sm">
                    {editPricing.options.map((option, optIdx) => {
                      const disc = option.discountPercent ?? 0;
                      const finalPrice = pricingOptionFinal(option);
                      const isCurrent =
                        Number(item.unitPrice) === option.price &&
                        Number(item.discount) === disc;
                      return (
                        <button
                          key={`edit-${option.channel ?? "canal"}-${option.price}-${optIdx}`}
                          type="button"
                          disabled={updateMutation.isPending}
                          onClick={() => applyEditPricingOption(option)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5 text-left text-sm last:border-b-0 transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-60",
                            isCurrent && "bg-[var(--color-enterprise-bg)]",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-foreground">
                              {option.channel || "Sem cota"}
                              {isCurrent ? (
                                <span className="ml-1.5 text-[11px] font-semibold text-[var(--brand-primary)]">
                                  atual
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 text-[11.5px] text-[var(--color-ink-soft)]">
                              Base {formatCurrency(option.price)}
                              {disc > 0 ? ` · -${disc}%` : ""}
                            </div>
                          </div>
                          <span className="shrink-0 font-semibold tabular-nums text-success">
                            {formatCurrency(finalPrice)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : editingItem === item.id && item.productType !== "SERVICE" ? (
                /* Modo edição inline (qtd / desc) */
                <div className="space-y-2.5">
                  <div className="text-sm font-semibold text-foreground">{item.productName}</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
                        Qtd
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        className="mt-1 h-8 rounded-lg border-border bg-white text-sm"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
                        Desc %
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={editDiscount}
                        onChange={(e) => setEditDiscount(e.target.value)}
                        className="mt-1 h-8 rounded-lg border-border bg-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-lg"
                      onClick={() => setEditingItem(null)}
                    >
                      <X className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-lg text-success"
                      onClick={() => saveEdit(item.id)}
                      disabled={updateMutation.isPending}
                    >
                      <Check className="size-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                /* Modo visualização */
                <div className="flex items-center gap-3">
                  {/* Ícone tile */}
                  {canSelectProducts ? (
                    <button
                      type="button"
                      onClick={() => toggleCourseSelect(item)}
                      aria-pressed={selectedCourseIds.includes(item.id)}
                      aria-label={
                        selectedCourseIds.includes(item.id)
                          ? `Desmarcar ${item.productName}`
                          : `Selecionar ${item.productName}`
                      }
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl transition-colors",
                        selectedCourseIds.includes(item.id)
                          ? "bg-primary/15 text-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                          : "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)] hover:brightness-95",
                      )}
                    >
                      <Package className="size-[18px]" strokeWidth={1.8} />
                    </button>
                  ) : (
                    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
                      <Package className="size-[18px]" strokeWidth={1.8} />
                    </div>
                  )}

                  {/* Nome + subtítulo */}
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-sm font-semibold leading-tight text-foreground"
                      title={item.productName}
                    >
                      {item.productName}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[var(--color-ink-soft)]">
                      <span>{item.quantity} un.</span>
                      {item.productType === "SERVICE" && (
                        <>
                          <span className="opacity-40">·</span>
                          <span>Serviço</span>
                        </>
                      )}
                      {item.discount > 0 && (
                        <>
                          <span className="opacity-40">·</span>
                          <span className="text-warning">-{item.discount}%</span>
                        </>
                      )}
                      <AvailabilityBadge productId={item.productId} />
                    </div>
                    <ProductCustomFieldsInline values={customFieldsByProduct[item.productId]} />
                  </div>

                  {/* Preço + ações inline (sem popup — evita clip em overflow) */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(item.total)}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {item.productKind === "COURSE" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-lg text-ink-muted hover:text-[var(--brand-primary)]"
                          aria-label={`Enviar mensagem de ${item.productName}`}
                          title="Enviar mensagem deste curso"
                          disabled={sendingCourseOfferId != null}
                          onClick={() => void handleSendCourseOffer(item)}
                        >
                          <Send
                            className={cn(
                              "size-3.5",
                              sendingCourseOfferId === item.id && "animate-pulse",
                            )}
                          />
                        </Button>
                      )}
                      {item.productType !== "SERVICE" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-lg text-ink-muted hover:text-foreground"
                          aria-label="Editar item"
                          disabled={loadingEditId === item.id || updateMutation.isPending}
                          onClick={() => void startEdit(item)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-lg text-ink-muted hover:text-destructive"
                        aria-label="Remover item"
                        onClick={async () => {
                          const ok = await confirmDialog({
                            title: "Remover produto",
                            description: "Remover este produto do negócio?",
                            confirmLabel: "Remover",
                            variant: "destructive",
                          });
                          if (ok) removeMutation.mutate(item.id);
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* ── Rodapé Total ── */}
          {showTotal && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <span className="text-sm text-[var(--color-ink-soft)]">Total</span>
              <span className="text-sm font-bold tabular-nums text-foreground">
                {formatCurrency(totalValue)}
              </span>
            </div>
          )}

          {/* Enviar oferta do curso → preenche o composer (só kind=COURSE) */}
          {(courseItems.length > 0 || canSelectProducts) && (
            <div className="border-t border-border px-4 py-3">
              <button
                type="button"
                disabled={sendingCourseOfferId != null || items.length === 0}
                onClick={() => {
                  if (canSelectProducts && selectedItems.length === 0) {
                    toast.error("Selecione pelo menos um produto pelo ícone ao lado do nome.");
                    return;
                  }
                  const targets =
                    selectedItems.length > 0
                      ? selectedItems
                      : courseItems[0]
                        ? [courseItems[0]]
                        : items.slice(0, 1);
                  void handleSendCourseOffers(targets);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] px-3 py-2.5 text-[13px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
              >
                <Send className="size-3.5" strokeWidth={2.4} />
                {sendingCourseOfferId != null
                  ? "Preparando…"
                  : selectedItems.length > 1
                    ? "Enviar produtos"
                    : "Enviar produto"}
              </button>
              {canSelectProducts ? (
                <p className="mt-1.5 text-center text-xs font-semibold text-foreground">
                  Toque no ícone do produto para selecionar vários — cada um vai em uma mensagem, com a própria imagem.
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SidebarDealSummaryCard({
  deal,
  users,
  stageOptions,
  onStageChange,
  stagePending,
  onOwnerChange,
  ownerPending,
  tagInput,
  setTagInput,
  tagColor,
  setTagColor,
  canCreateTag,
  onAddTag,
  onSelectExistingTag,
  addTagPending,
  onRemoveTag,
  removeTagPending,
}: {
  deal: DealDetailData;
  contact: ContactDetail;
  users: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    agentStatus?: { status: "ONLINE" | "OFFLINE" | "AWAY"; availableForVoiceCalls?: boolean; updatedAt?: string } | null;
  }[];
  stageOptions: { id: string; name: string; color?: string }[];
  onStageChange: (stageId: string) => void;
  stagePending: boolean;
  onOwnerChange: (ownerId: string | null) => void;
  ownerPending: boolean;
  tagInput: string;
  setTagInput: (value: string) => void;
  tagColor: string;
  setTagColor: (value: string) => void;
  canCreateTag: boolean;
  onAddTag: () => void;
  onSelectExistingTag: (tagId: string) => void;
  addTagPending: boolean;
  onRemoveTag: (tagId: string) => void;
  removeTagPending: boolean;
}) {
  const [showTagComposer, setShowTagComposer] = React.useState(false);
  const dealTags = deal.tags ?? [];

  return (
    <section className="border-b border-border/90 pb-4">
      <StageDropdown
        stages={stageOptions}
        currentStageId={deal.stage.id}
        pipelineName={deal.stage.pipeline.name}
        onChange={onStageChange}
        isPending={stagePending}
      />

      <div className="mt-3 border-t border-border/90 pt-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">Responsável</div>
        <CompactOwnerSelector
          currentOwner={deal.owner}
          users={users}
          onChange={onOwnerChange}
          isPending={ownerPending}
        />
      </div>

      <div className="mt-3 border-t border-border/90 pt-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">Tags</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {dealTags.length > 0 ? (
            dealTags.map(({ tag }) => (
              <TagPillSmall
                key={tag.id}
                tag={tag}
                onRemove={() => onRemoveTag(tag.id)}
                isPending={removeTagPending}
              />
            ))
          ) : (
            <span className="text-sm text-[var(--color-ink-muted)]">Sem tags</span>
          )}
          {!showTagComposer ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 rounded-full border border-border bg-white text-[var(--color-ink-soft)] shadow-none hover:bg-[var(--color-bg-subtle)]"
              onClick={() => setShowTagComposer(true)}
              disabled={addTagPending}
              aria-label="Adicionar tag"
            >
              <Plus className="size-3.5" />
            </Button>
          ) : null}
        </div>
        <TagComposerInline
          draft={tagInput}
          setDraft={setTagInput}
          color={tagColor}
          setColor={setTagColor}
          isOpen={showTagComposer}
          onOpenChange={setShowTagComposer}
          canCreateTag={canCreateTag}
          dealId={deal.id}
          existingTagIds={new Set(dealTags.map((t) => t.tag.id))}
          onSubmit={() => {
            onAddTag();
            if (tagInput.trim()) setShowTagComposer(false);
          }}
          onSelectExisting={(tag: { id: string; name: string; color: string }) => {
            onSelectExistingTag(tag.id);
            setShowTagComposer(false);
          }}
          isPending={addTagPending}
        />
      </div>

    </section>
  );
}

function StageDropdown({
  stages,
  currentStageId,
  pipelineName,
  onChange,
  isPending,
}: {
  stages: { id: string; name: string; color?: string }[];
  currentStageId: string;
  pipelineName: string;
  onChange: (stageId: string) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const currentIdx = stages.findIndex((s) => s.id === currentStageId);
  const current = stages[currentIdx];

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {pipelineName}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={cn(
          "flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left transition-colors",
          "border border-border bg-white hover:border-black/15",
          isPending && "cursor-wait opacity-70",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: current?.color ?? "var(--glass-border)" }}
            aria-hidden
          />
          <span className="truncate text-sm font-semibold text-foreground">
            {current?.name ?? "—"}
          </span>
          <span className="text-xs text-[var(--color-ink-muted)]">
            {currentIdx + 1}/{stages.length}
          </span>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-[var(--color-ink-muted)] transition-transform", open && "rotate-180")} />
      </button>

      <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {stages.map((stage, i) => {
          const isPast = i <= currentIdx;
          return (
            <div
              key={stage.id}
              className="h-full transition-all"
              style={{
                flex: 1,
                backgroundColor: isPast ? (stage.color ?? "var(--glass-border)") : "transparent",
                marginRight: i < stages.length - 1 ? 1 : 0,
              }}
            />
          );
        })}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%-4px)] z-50 mt-1 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
          <div className="border-b border-black/5 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {pipelineName}
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {stages.map((stage) => {
              const isActive = stage.id === currentStageId;
              const color = stage.color ?? "var(--glass-border)";
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => {
                    onChange(stage.id);
                    setOpen(false);
                  }}
                  disabled={isPending}
                  className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-sm font-medium transition-colors hover:brightness-95"
                  style={{
                    backgroundColor: `${color}30`,
                    borderLeft: isActive ? `3px solid ${color}` : "3px solid transparent",
                  }}
                >
                  {isActive ? (
                    <Check className="size-4 shrink-0 text-foreground" strokeWidth={2.5} />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span
                    className="truncate"
                    style={{
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                  >
                    {stage.name}
                  </span>
                  <span
                    className="ml-auto size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TagPillSmall({
  tag,
  onRemove,
  isPending,
}: {
  tag: { id: string; name: string; color: string };
  onRemove: () => void;
  isPending: boolean;
}) {
  return (
    <TooltipGlass label={tag.name} side="top">
    <span
      className={cn(dt.pill.base, "max-w-full gap-1")}
      style={tagPillStyle(tag.name, tag.color)}
    >
      <span className="whitespace-nowrap">{tag.name}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={isPending}
        className="rounded p-0.5 opacity-70 transition hover:opacity-100 disabled:pointer-events-none"
        aria-label={`Remover tag ${tag.name}`}
      >
        <X className="size-2.5" />
      </button>
    </span>
    </TooltipGlass>
  );
}
function TagComposerInline({
  draft,
  setDraft,
  color,
  setColor,
  isOpen,
  onOpenChange,
  canCreateTag,
  existingTagIds,
  onSubmit,
  onSelectExisting,
  isPending,
}: {
  draft: string;
  setDraft: (value: string) => void;
  color: string;
  setColor: (value: string) => void;
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
  canCreateTag: boolean;
  dealId: string;
  existingTagIds: Set<string>;
  onSubmit: () => void;
  onSelectExisting: (tag: { id: string; name: string; color: string }) => void;
  isPending: boolean;
}) {
  const { data: allTags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: async () => { const r = await fetch(apiUrl("/api/tags")); return r.ok ? r.json() : []; },
    staleTime: 60_000,
    enabled: isOpen,
  });
  const suggestions = (allTags as { id: string; name: string; color: string }[]).filter(
    (t) => !existingTagIds.has(t.id) && t.name.toLowerCase().includes(draft.toLowerCase()),
  );

  return (
    <div className={cn("mt-1.5", !isOpen && "hidden")}>
      {isOpen ? (
        <div className="min-w-0 rounded-xl border border-border bg-white px-2.5 py-2">
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreateTag) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder={canCreateTag ? "Buscar ou criar tag" : "Buscar tag"}
              className="h-7 border-0 bg-transparent px-0 text-sm text-foreground shadow-none focus-visible:ring-0"
            />
            {canCreateTag && (
              <Button
                type="button"
                variant="ghost"
                className="h-7 rounded-md px-2.5 text-xs font-medium text-[var(--color-ink-soft)] hover:bg-muted"
                onClick={onSubmit}
                disabled={!draft.trim() || isPending}
              >
                Criar
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 rounded-md text-ink-muted hover:bg-muted"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar"
            >
              <X className="size-3" />
            </Button>
          </div>
          {draft && suggestions.length > 0 && (
            <div className="mt-1.5 rounded-md border border-border bg-white p-1.5">
              <TagChipOptionsList
                tags={suggestions.slice(0, 8)}
                selectedIds={[]}
                onToggle={(tagId) => {
                  const tag = suggestions.find((t) => t.id === tagId);
                  if (tag) onSelectExisting(tag);
                }}
                className="max-h-28"
              />
            </div>
          )}
          {canCreateTag && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {TAG_COLORS.map((paletteColor) => (
                <button
                  key={paletteColor}
                  type="button"
                  onClick={() => setColor(paletteColor)}
                  className={cn(
                    "size-3.5 rounded-full border transition",
                    color === paletteColor ? "scale-110 border-[var(--text-muted)] ring-2 ring-black/10" : "border-white",
                  )}
                  style={{ backgroundColor: paletteColor }}
                  aria-label={`Selecionar cor ${paletteColor}`}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const TAG_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#f97316", "#16a34a", "#0891b2", "#dc2626", "#475569"];

function CompactOwnerSelector({
  currentOwner,
  users,
  onChange,
  isPending,
}: {
  currentOwner: DealDetailData["owner"];
  users: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    agentStatus?: { status: "ONLINE" | "OFFLINE" | "AWAY"; availableForVoiceCalls?: boolean; updatedAt?: string } | null;
  }[];
  onChange: (ownerId: string | null) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const currentOwnerStatus = users.find((user) => user.id === currentOwner?.id)?.agentStatus?.status ?? "OFFLINE";

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-white px-3.5 py-3 text-left shadow-none transition-colors hover:border-black/15 hover:bg-[var(--color-bg-subtle)]"
      >
        <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
          {currentOwner?.name ? getInitials(currentOwner.name) : "?"}
          {currentOwner?.name ? <PresenceDot status={currentOwnerStatus} className="absolute -bottom-0.5 -right-0.5" /> : null}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{currentOwner?.name ?? "Sem responsável"}</span>
          {currentOwner?.name ? (
            <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">· {presenceLabel(currentOwnerStatus)}</span>
          ) : null}
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-border bg-white p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-left text-sm hover:bg-[var(--color-bg-subtle)]"
          >
            <span className="text-ink-muted">Sem responsável</span>
          </button>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onChange(u.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm hover:bg-[var(--color-bg-subtle)]",
                currentOwner?.id === u.id && "bg-[var(--color-bg-subtle)]",
              )}
            >
              <div className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-dark">
                {getInitials(u.name)}
              </div>
              <div className="min-w-0">
                <span className="block truncate font-medium text-foreground">{u.name}</span>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                  <PresenceDot status={u.agentStatus?.status ?? "OFFLINE"} />
                  <span>{presenceLabel(u.agentStatus?.status ?? "OFFLINE")}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PresenceDot({
  status,
  className,
}: {
  status: "ONLINE" | "OFFLINE" | "AWAY";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-2.5 rounded-full ring-2 ring-white",
        status === "ONLINE" && "bg-success",
        status === "AWAY" && "bg-warning",
        status === "OFFLINE" && "bg-[var(--text-muted)]",
        className,
      )}
      aria-hidden
    />
  );
}

function presenceLabel(status: "ONLINE" | "OFFLINE" | "AWAY") {
  if (status === "ONLINE") return "Online";
  if (status === "AWAY") return "Ausente";
  return "Offline";
}

function ProductCustomFieldsInline({ values }: { values?: ProductCustomFieldValue[] }) {
  const filled = (values ?? []).filter((v) => v.value?.trim());
  if (filled.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
      {filled.map((v) => (
        <span key={v.fieldId}>
          <span className="font-medium text-[var(--color-ink-soft)]">{v.label}:</span> {v.value}
        </span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Cotas de Desconto (PRD Cotas — Fase 1). Painel visual espelha o
   DealProductsSection: header + lista + painel "Adicionar" colapsável.
   Consome os endpoints:
     GET /api/deals/[id]/cotas-disponiveis
     GET/POST /api/deals/[id]/quotas
     DELETE /api/deals/[id]/quotas/[quotaId]
   Cumulatividade e reserva são resolvidas no backend; a UI apenas
   destaca o estado (SELECTED/RESERVED/CONSUMED) e mostra o preço
   final calculado (snapshot vindo do backend).
   ═══════════════════════════════════════════════════════════════════ */

type AvailableQuota = {
  id: string;
  name: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  qtyTotal: number | null;
  qtyConsumed: number;
  balance: number | null;
  validTo: string | null;
  exclusionGroup: string | null;
  maxStacks: number;
  calcMode: "CASCADE" | "SUM_SIMPLE";
  categoryId: string | null;
  categoryName: string | null;
  linked: boolean;
};

type LinkedQuota = {
  id: string;
  quotaId: string;
  status: "SELECTED" | "RESERVED" | "CONSUMED" | "RETURNED" | "EXPIRED";
  valueSnapshot: number;
  typeSnapshot: "PERCENT" | "FIXED";
  reservedAt: string | null;
  expiresAt: string | null;
  quota: {
    id: string;
    name: string;
    discountType: "PERCENT" | "FIXED";
    discountValue: number;
    calcMode: "CASCADE" | "SUM_SIMPLE";
    validTo: string | null;
    balance: number | null;
  };
};

type QuotasResponse = {
  items: LinkedQuota[];
  priceFullSnapshot: number | null;
  priceFinalSnapshot: number | null;
};

function formatDiscount(type: "PERCENT" | "FIXED", value: number): string {
  return type === "PERCENT" ? `${value}%` : formatCurrency(value);
}

function formatValidity(validTo: string | null): string {
  if (!validTo) return "Sem prazo";
  const date = new Date(validTo);
  return `até ${date.toLocaleDateString("pt-BR")}`;
}

const STATUS_LABEL_QUOTA: Record<LinkedQuota["status"], { label: string; className: string }> = {
  SELECTED: {
    label: "Selecionada",
    className: "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]",
  },
  RESERVED: {
    label: "Reservada",
    className: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  },
  CONSUMED: {
    label: "Consumida",
    className: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  },
  RETURNED: {
    label: "Devolvida",
    className: "bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]",
  },
  EXPIRED: {
    label: "Expirada",
    className: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
  },
};

export function DealQuotasSection({ dealId }: { dealId: string }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = React.useState(false);

  const linkedKey = ["deal-quotas", dealId] as const;
  const availableKey = ["deal-quotas-available", dealId] as const;

  const { data: linkedData } = useQuery({
    queryKey: linkedKey,
    queryFn: async (): Promise<QuotasResponse> => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/quotas`));
      if (!res.ok) return { items: [], priceFullSnapshot: null, priceFinalSnapshot: null };
      return (await res.json()) as QuotasResponse;
    },
  });
  const linked = linkedData?.items ?? [];

  const { data: available = [] } = useQuery({
    queryKey: availableKey,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/cotas-disponiveis`));
      if (!res.ok) return [] as AvailableQuota[];
      const data = (await res.json()) as { quotas: AvailableQuota[] };
      return data.quotas;
    },
    enabled: showAdd,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: linkedKey });
    queryClient.invalidateQueries({ queryKey: availableKey });
    queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
  };

  const selectMutation = useMutation({
    mutationFn: async (quotaId: string) => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/quotas`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotaId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
        throw new Error(data.message || "Falha ao vincular cota.");
      }
    },
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      toast.success("Cota vinculada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (quotaId: string) => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/quotas/${quotaId}`), {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Falha ao remover cota.");
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Cota removida.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const priceFull = linkedData?.priceFullSnapshot ?? null;
  const priceFinal = linkedData?.priceFinalSnapshot ?? null;
  const hasDiscount =
    priceFull !== null &&
    priceFinal !== null &&
    priceFinal < priceFull;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-sm font-bold text-foreground">Cotas / Descontos</span>
        {linked.length > 0 && (
          <span className="rounded-full bg-[var(--color-enterprise-bg)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--brand-primary)]">
            {linked.length}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          aria-label={showAdd ? "Fechar busca de cota" : "Adicionar cota"}
          className="flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-3 py-1 text-[12px] font-semibold text-white transition-all hover:brightness-110 active:scale-95"
        >
          <Plus className="size-3" strokeWidth={2.5} />
          Adicionar
        </button>
      </div>

      {showAdd && (
        <div className="space-y-2 border-t border-border px-4 pb-3 pt-2">
          <div className="max-h-52 overflow-y-auto rounded-xl border border-border bg-white shadow-sm">
            {available.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                Nenhuma cota disponível.
              </p>
            ) : (
              available.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  disabled={q.linked || selectMutation.isPending}
                  onClick={() => selectMutation.mutate(q.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors",
                    q.linked
                      ? "cursor-not-allowed bg-[var(--color-bg-subtle)] opacity-60"
                      : "hover:bg-[var(--color-bg-subtle)]",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="truncate font-semibold text-foreground">
                        {q.categoryName ?? q.name}
                      </span>
                      {q.balance !== null && q.balance <= 3 && q.balance > 0 && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          {q.balance} restante{q.balance === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {q.balance === null ? "Ilimitada" : `Saldo ${q.balance}`}
                      {" • "}
                      {formatValidity(q.validTo)}
                      {q.exclusionGroup ? ` • grupo ${q.exclusionGroup}` : ""}
                      {q.maxStacks > 1 ? ` • combina até ${q.maxStacks}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-success">
                    − {formatDiscount(q.discountType, q.discountValue)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {linked.length === 0 ? (
        <div className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
          Nenhuma cota vinculada.
        </div>
      ) : (
        <div>
          {linked.map((dq, idx) => {
            const status = STATUS_LABEL_QUOTA[dq.status];
            return (
              <div
                key={dq.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  idx === 0 && "border-t border-border",
                  idx < linked.length - 1 && "border-b border-border/60",
                )}
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
                  <Package className="size-[18px]" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {dq.quota.name}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-success">
                      − {formatDiscount(dq.typeSnapshot, dq.valueSnapshot)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        status.className,
                      )}
                    >
                      {status.label}
                    </span>
                    {dq.expiresAt && dq.status === "RESERVED" && (
                      <span>Reserva até {new Date(dq.expiresAt).toLocaleString("pt-BR")}</span>
                    )}
                  </div>
                </div>
                {dq.status !== "RETURNED" && dq.status !== "EXPIRED" && (
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(dq.quotaId)}
                    disabled={removeMutation.isPending}
                    aria-label={`Remover cota ${dq.quota.name}`}
                    className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)]"
                  >
                    <X className="size-3.5" strokeWidth={2.2} />
                  </button>
                )}
              </div>
            );
          })}
          {hasDiscount && (
            <div className="border-t border-border bg-[var(--color-bg-subtle)]/60 px-4 py-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Preço cheio</span>
                <span className="tabular-nums text-muted-foreground line-through">
                  {formatCurrency(priceFull!)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">Preço final</span>
                <span className="font-bold tabular-nums text-success">
                  {formatCurrency(priceFinal!)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Seletor da Unidade (filial) do negócio. Alterar a unidade dispara:
 *   - relist de cotas disponíveis (`cotas-disponiveis`)
 *   - relist de produtos do deal (o preço aplicado ao ADICIONAR produtos
 *     passa a considerar a ProductOffer da nova unidade — itens já
 *     adicionados mantêm o preço original)
 *
 * Compacto: 1 linha, exibe unidade atual + dropdown. Sem unidade, o
 * matching de cotas cai em "somente cotas globais" (categoria sem unidade).
 */
function DealOrgUnitSection({
  dealId,
  currentUnitId,
}: {
  dealId: string;
  currentUnitId: string | null;
}) {
  const queryClient = useQueryClient();
  type UnitOption = { id: string; name: string };

  const { data: units = [] } = useQuery({
    queryKey: ["quotas-org-units"],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/org-units`));
      if (!res.ok) return [] as UnitOption[];
      const data = (await res.json()) as {
        items?: UnitOption[];
        orgUnits?: UnitOption[];
      };
      return data.items ?? data.orgUnits ?? [];
    },
  });

  const updateMut = useMutation({
    mutationFn: async (orgUnitId: string | null) => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgUnitId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Falha ao atualizar unidade.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
      queryClient.invalidateQueries({ queryKey: ["deal-quotas-available", dealId] });
      queryClient.invalidateQueries({ queryKey: ["deal-quotas", dealId] });
      queryClient.invalidateQueries({ queryKey: ["deal-products", dealId] });
      toast.success("Unidade atualizada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-sm font-bold text-foreground">Unidade</span>
        <div className="flex-1" />
        <select
          value={currentUnitId ?? ""}
          disabled={updateMut.isPending}
          onChange={(e) => updateMut.mutate(e.target.value || null)}
          className="h-8 max-w-[220px] rounded-lg border border-border bg-[var(--color-bg-subtle)] px-2 text-[13px] font-medium text-foreground"
        >
          <option value="">— Sem unidade —</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      {!currentUnitId && (
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Defina a unidade para aplicar o preço da oferta e ver as cotas
          alocadas para essa filial.
        </div>
      )}
    </div>
  );
}
