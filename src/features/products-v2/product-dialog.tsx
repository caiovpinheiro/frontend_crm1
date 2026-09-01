"use client";

import * as React from "react";
import {
  IconBoxMultiple,
  IconBriefcase,
  IconBuildingStore,
  IconCash,
  IconCertificate,
  IconLoader2,
  IconPlus,
  IconSchool,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FormDialog,
  formDialogCancelClass,
  formDialogPrimaryClass,
} from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass, type DropdownOption } from "@/components/crm/dropdown-glass";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useCan } from "@/hooks/use-my-permissions";
import { useCatalogs } from "@/features/catalogs-v2/hooks";
import { capabilityMeta } from "@/features/catalogs-v2/constants";

import { InventoryPanel } from "./inventory-panel";
import { OffersSection } from "./offers-section";
import { StakeholdersSection } from "./stakeholders-section";
import {
  COURSE_LEVEL_LABEL,
  COURSE_MODE_LABEL,
  KIND_LABEL,
  PLAN_INTERVAL_LABEL,
  type CourseClass,
  type CourseLevel,
  type CourseMode,
  type PlanInterval,
  type ProductKind,
  type ProductPlan,
} from "./types";
import {
  usePipelinesLite,
  useProductDetail,
  useSaveProductBlocks,
} from "./hooks";

const KIND_ICON: Record<ProductKind, React.ReactNode> = {
  PHYSICAL: <IconBuildingStore size={16} />,
  SERVICE: <IconCash size={16} />,
  COURSE: <IconSchool size={16} />,
  JOB_OPENING: <IconBriefcase size={16} />,
};

/**
 * Tipos oferecidos na CRIAÇÃO. Curso é um "kind" primeira-classe (schema
 * já suporta `Product.kind = COURSE` + `CourseConfig`); mantemos a política
 * genérica multi-tipo — nenhuma vertical hardcoded, apenas o kind + as
 * capacidades do catálogo é que definem o comportamento.
 * `JOB_OPENING` fica só para edição de produtos legados (criação via a
 * tela Vagas).
 */
const CREATE_TYPES: { kind: ProductKind; label: string }[] = [
  { kind: "PHYSICAL", label: "Produto" },
  { kind: "SERVICE", label: "Serviço" },
  { kind: "COURSE", label: "Curso" },
];

/** Balão Graduação / Pós — só quando kind = COURSE (topo, abaixo do tipo). */
const COURSE_LEVEL_OPTIONS: {
  level: CourseLevel;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    level: "GRADUATION",
    label: COURSE_LEVEL_LABEL.GRADUATION,
    icon: <IconSchool size={16} />,
  },
  {
    level: "POSTGRADUATE",
    label: COURSE_LEVEL_LABEL.POSTGRADUATE,
    icon: <IconCertificate size={16} />,
  },
];

type PricingRow = {
  key: string;
  price: string;
  channel: string;
  discount: string;
  priceWithDiscount: string;
  /** Parcelas (pós-graduação). */
  installments: string;
  /** Meses da cota (pós-graduação). */
  months: string;
};

function newPricingRow(partial?: Partial<PricingRow>): PricingRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    price: "",
    channel: "",
    discount: "",
    priceWithDiscount: "",
    installments: "",
    months: "",
    ...partial,
  };
}

function discountedFrom(price: string, discount: string): string {
  const p = Number(price) || 0;
  const d = Number(discount);
  if (discount === "" || !Number.isFinite(d) || p <= 0) return "";
  return (p * (1 - d / 100)).toFixed(2);
}

function discountFrom(price: string, valor: string): string {
  const p = Number(price) || 0;
  const v = Number(valor);
  if (valor === "" || !Number.isFinite(v) || p <= 0) return "";
  return ((1 - v / p) * 100).toFixed(2);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = criação; string = edição. */
  productId: string | null;
  /** Pré-seleciona o catálogo ao criar (ex.: logo após criar o catálogo). */
  initialCatalogId?: string;
  onCreated?: (id: string) => void;
};

const sectionClass =
  "rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-4";
const sectionTitleClass =
  "mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]";

export function ProductDialog({ open, onOpenChange, productId, initialCatalogId, onCreated }: Props) {
  const isEdit = !!productId;
  const queryClient = useQueryClient();
  const { data: detail } = useProductDetail(productId);
  const { data: pipelines = [] } = usePipelinesLite();
  const { data: catalogs = [] } = useCatalogs();
  const saveBlocks = useSaveProductBlocks(productId);
  const canInventoryView = useCan("inventory:view");

  // Estado base
  const [kind, setKind] = React.useState<ProductKind>("PHYSICAL");
  const [name, setName] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [unit, setUnit] = React.useState("un");
  const [isActive, setIsActive] = React.useState(true);
  const [catalogId, setCatalogId] = React.useState("");

  // Físico
  const [weightGrams, setWeightGrams] = React.useState("");
  // Serviço
  const [plans, setPlans] = React.useState<ProductPlan[]>([]);
  // Curso
  const [courseLevel, setCourseLevel] = React.useState<CourseLevel | "">("");
  const [courseGrau, setCourseGrau] = React.useState("");
  const [courseSemester, setCourseSemester] = React.useState("");
  const [courseMode, setCourseMode] = React.useState<CourseMode>("EAD");
  const [postSalePipelineId, setPostSalePipelineId] = React.useState("");
  const [classes, setClasses] = React.useState<CourseClass[]>([]);
  const [pricingRows, setPricingRows] = React.useState<PricingRow[]>([newPricingRow()]);

  const [saving, setSaving] = React.useState(false);

  const updatePricingRow = React.useCallback(
    (key: string, patch: Partial<PricingRow>) => {
      setPricingRows((rows) =>
        rows.map((r) => {
          if (r.key !== key) return r;
          const next = { ...r, ...patch };
          if ("price" in patch || "discount" in patch) {
            next.priceWithDiscount = discountedFrom(next.price, next.discount);
          } else if ("priceWithDiscount" in patch) {
            next.discount = discountFrom(next.price, next.priceWithDiscount);
          }
          return next;
        }),
      );
    },
    [],
  );

  /** Pós: preço base é único — propaga pra todas as cotas. */
  const setCourseBasePrice = React.useCallback((nextPrice: string) => {
    setPrice(nextPrice);
    setPricingRows((rows) =>
      rows.map((r) => ({
        ...r,
        price: nextPrice,
        priceWithDiscount: discountedFrom(nextPrice, r.discount),
      })),
    );
  }, []);

  // Reset/seed ao abrir
  React.useEffect(() => {
    if (!open) return;
    if (!isEdit) {
      setKind("PHYSICAL");
      setName("");
      setSku("");
      setDescription("");
      setPrice("");
      setUnit("un");
      setIsActive(true);
      setCatalogId(initialCatalogId ?? "");
      setWeightGrams("");
      setPlans([]);
      setCourseLevel("");
      setCourseGrau("");
      setCourseSemester("");
      setCourseMode("EAD");
      setPostSalePipelineId("");
      setClasses([]);
      setPricingRows([newPricingRow()]);
    }
  }, [open, isEdit, initialCatalogId]);

  React.useEffect(() => {
    if (!detail) return;
    setKind(detail.kind);
    setName(detail.name);
    setSku(detail.sku ?? "");
    setDescription(detail.description ?? "");
    setPrice(String(Number(detail.price)));
    setUnit(detail.unit);
    setIsActive(detail.isActive);
    setCatalogId(detail.catalogId ?? "");
    setWeightGrams(detail.shipping?.weightGrams != null ? String(detail.shipping.weightGrams) : "");
    setPlans(detail.plans ?? []);
    setCourseLevel(detail.courseConfig?.level ?? "");
    setCourseGrau(detail.courseConfig?.grau ?? "");
    setCourseSemester(
      detail.courseConfig?.semester != null ? String(detail.courseConfig.semester) : "",
    );
    setCourseMode(detail.courseConfig?.mode ?? "EAD");
    setPostSalePipelineId(detail.courseConfig?.postSalePipelineId ?? "");
    setClasses(detail.courseConfig?.classes ?? []);
    const opts = Array.isArray(detail.courseConfig?.pricingOptions)
      ? detail.courseConfig!.pricingOptions!
      : [];
    const semesterFallback =
      detail.courseConfig?.semester != null
        ? String(detail.courseConfig.semester)
        : "";
    if (opts.length > 0) {
      setPricingRows(
        opts.map((o, i) => {
          const p = String(Number(o.price) || 0);
          const d = o.discountPercent != null ? String(Number(o.discountPercent)) : "";
          const monthsFromOpt =
            o.months != null && Number.isFinite(Number(o.months))
              ? String(Number(o.months))
              : "";
          return newPricingRow({
            price: p,
            channel: o.channel ?? "",
            discount: d,
            priceWithDiscount: discountedFrom(p, d),
            installments:
              o.installments != null && Number.isFinite(Number(o.installments))
                ? String(Number(o.installments))
                : "",
            months: monthsFromOpt || (i === 0 ? semesterFallback : ""),
          });
        }),
      );
      setPrice(String(Number(opts[0].price) || 0));
    } else {
      const basePrice = String(Number(detail.price) || 0);
      const discount =
        detail.courseConfig?.discountPercent != null
          ? String(Number(detail.courseConfig.discountPercent))
          : "";
      setPricingRows([
        newPricingRow({
          price: basePrice,
          channel: detail.courseConfig?.channel ?? "",
          discount,
          priceWithDiscount: discountedFrom(basePrice, discount),
          months: semesterFallback,
        }),
      ]);
    }
  }, [detail]);

  const buildBlocks = (): Record<string, unknown> => {
    const coursePrice = Number(pricingRows[0]?.price) || Number(price) || 0;
    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      sku: sku.trim() || null,
      price: kind === "COURSE" ? coursePrice : Number(price) || 0,
      unit: kind === "SERVICE" ? "serviço" : unit.trim() || "un",
      type: kind === "SERVICE" ? "SERVICE" : "PRODUCT",
      kind,
      catalogId: catalogId || null,
      isActive,
    };
    if (kind === "PHYSICAL") {
      body.shipping = { weightGrams: weightGrams ? Number(weightGrams) : null };
    }
    if (kind === "SERVICE") {
      body.plans = plans.map((p) => ({
        name: p.name,
        interval: p.interval,
        amount: Number(p.amount) || 0,
        active: p.active,
      }));
    }
    if (kind === "COURSE") {
      const isPostgrad = courseLevel === "POSTGRADUATE";
      const pricingOptions = pricingRows.map((r) => {
        const inst = r.installments === "" ? null : Number(r.installments);
        const monthsNum = r.months === "" ? null : Number(r.months);
        return {
          price: Number(r.price) || 0,
          channel: r.channel.trim() || null,
          discountPercent: r.discount === "" ? null : Number(r.discount),
          installments:
            isPostgrad &&
            inst != null &&
            Number.isFinite(inst) &&
            Number.isInteger(inst) &&
            inst > 0
              ? inst
              : null,
          months:
            isPostgrad &&
            monthsNum != null &&
            Number.isFinite(monthsNum) &&
            Number.isInteger(monthsNum) &&
            monthsNum > 0
              ? monthsNum
              : null,
        };
      });
      const first = pricingOptions[0];
      const semesterFromRows =
        first?.months != null ? first.months : null;
      body.course = {
        level: courseLevel || null,
        grau: courseGrau.trim() || null,
        semester: isPostgrad
          ? semesterFromRows
          : courseSemester === ""
            ? null
            : Number(courseSemester),
        mode: courseMode,
        postSalePipelineId: postSalePipelineId || null,
        classes: classes.map((c) => ({
          name: c.name,
          startsAt: c.startsAt || null,
          endsAt: c.endsAt || null,
          location: c.location || null,
        })),
        pricingOptions,
        channel: first?.channel ?? null,
        discountPercent: first?.discountPercent ?? null,
      };
    }
    return body;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await saveBlocks.mutateAsync(buildBlocks());
        toast.success("Produto atualizado.");
        onOpenChange(false);
      } else {
        // Cria base, depois aplica kind + blocos via PUT.
        const created = await parseApiResponse<{ product?: { id?: string } }>(
          await apiFetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: name.trim(),
              kind,
              type: kind === "SERVICE" ? "SERVICE" : "PRODUCT",
              price:
                kind === "COURSE"
                  ? Number(pricingRows[0]?.price) || 0
                  : Number(price) || 0,
              unit:
                kind === "SERVICE"
                  ? "serviço"
                  : kind === "COURSE"
                    ? "matrícula"
                    : unit,
              sku: sku.trim() || null,
              description: description.trim() || null,
              catalogId: catalogId || null,
              ...(kind === "COURSE" ? { courseMode } : {}),
            }),
          }),
          "Erro ao criar produto.",
        );
        const newId: string | undefined = created.product?.id;
        if (!newId) throw new Error("Erro ao criar: resposta sem id do produto.");
        await parseApiResponse(
          await apiFetch(`/api/products/${newId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildBlocks()),
          }),
          "Produto criado, mas falhou ao salvar detalhes.",
        );
        await queryClient.invalidateQueries({ queryKey: ["products"] });
        toast.success("Produto criado. Configure ofertas e alocação.");
        onCreated?.(newId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const catalogOptions: DropdownOption[] = React.useMemo(
    () => [
      { value: "", label: "Sem catálogo" },
      ...catalogs.map((c) => ({
        value: c.id,
        label: c.name,
        description: c.isDefault ? "Padrão" : undefined,
      })),
    ],
    [catalogs],
  );

  const inheritedCaps = React.useMemo(() => {
    const cat = catalogs.find((c) => c.id === catalogId);
    return (cat?.capabilities ?? []).filter((c) => c.enabled);
  }, [catalogs, catalogId]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={isEdit ? "Editar produto" : "Novo produto"}
      description="Escolha Produto ou Serviço. As especializações (vaga, curso…) vêm das capacidades do catálogo."
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            onClick={() => onOpenChange(false)}
          >
            {isEdit ? "Fechar" : "Cancelar"}
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving && <IconLoader2 size={14} className="mr-1.5 animate-spin" />}
            {isEdit ? "Salvar" : "Criar"}
          </ButtonGlass>
        </>
      }
    >
      <div className="space-y-4">
          {/* Seletor de tipo */}
          <div className={sectionClass}>
            <p className={sectionTitleClass}>Tipo de produto</p>
            {isEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)]">
                  {KIND_ICON[kind]}
                  {KIND_LABEL[kind]}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  O tipo não pode ser alterado após a criação.
                </span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {CREATE_TYPES.map(({ kind: k, label }) => {
                    const selected = kind === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setKind(k);
                          // Ao escolher Curso, já destaca Graduação (pode trocar no balão).
                          if (k === "COURSE") {
                            setCourseLevel((prev) => prev || "GRADUATION");
                          }
                        }}
                        className={[
                          "flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm font-medium transition-colors",
                          selected
                            ? "border-[var(--brand-primary)] bg-[var(--glass-bg-strong)] text-[var(--brand-primary)]"
                            : "border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                        ].join(" ")}
                      >
                        {KIND_ICON[k]}
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                  Vaga, curso e outras especializações vêm das{" "}
                  <span className="font-medium text-[var(--text-primary)]">
                    capacidades do catálogo
                  </span>{" "}
                  selecionado abaixo.
                </p>
              </>
            )}
          </div>

          {/* Nível do curso — balão só com kind = COURSE, logo abaixo do tipo */}
          {kind === "COURSE" && (
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Nível do curso</p>
              <div
                className="grid grid-cols-2 gap-2"
                role="radiogroup"
                aria-label="Nível do curso"
              >
                {COURSE_LEVEL_OPTIONS.map(({ level, label, icon }) => {
                  const selected = courseLevel === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setCourseLevel(level)}
                      className={[
                        "flex items-center justify-center gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm font-medium transition-colors",
                        selected
                          ? "border-[var(--brand-primary)] bg-[var(--glass-bg-strong)] text-[var(--brand-primary)] shadow-[0_0_0_1px_var(--brand-primary)]"
                          : "border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                      ].join(" ")}
                    >
                      {icon}
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                Graduação e pós-graduação usam campos e regras de cadastro
                diferentes.
              </p>
            </div>
          )}

          {/* Campos base */}
          <div className={sectionClass}>
            <p className={sectionTitleClass}>Dados gerais</p>
            <div
              className={[
                "grid gap-3",
                kind === "COURSE" && courseLevel === "POSTGRADUATE"
                  ? "sm:grid-cols-2 lg:grid-cols-4"
                  : kind === "COURSE"
                    ? "sm:grid-cols-3"
                    : "sm:grid-cols-2",
              ].join(" ")}
            >
              <div>
                <Label>Nome *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
              {kind === "COURSE" && (
                <div>
                  <Label>Grau</Label>
                  <Input
                    value={courseGrau}
                    onChange={(e) => setCourseGrau(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
              {kind === "COURSE" && courseLevel === "POSTGRADUATE" && (
                <div>
                  <Label>Preço base (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={pricingRows[0]?.price ?? price}
                    onChange={(e) => setCourseBasePrice(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label>SKU / código</Label>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="mt-3">
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>
            {kind === "COURSE" ? (
              <div className="mt-3 space-y-3">
                {pricingRows.map((row, idx) => (
                  <div key={row.key} className="space-y-2">
                    <div
                      className={[
                        "grid grid-cols-1 gap-3 sm:grid-cols-2",
                        courseLevel === "POSTGRADUATE"
                          ? "lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
                          : "lg:grid-cols-[1fr_1fr_1fr_1fr_auto]",
                      ].join(" ")}
                    >
                      {courseLevel === "POSTGRADUATE" ? (
                        <div className="min-w-0">
                          {idx === 0 && <Label>Meses</Label>}
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={row.months}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^\d+$/.test(v)) {
                                updatePricingRow(row.key, { months: v });
                              }
                            }}
                            className={idx === 0 ? "mt-1" : undefined}
                            placeholder="ex.: 18"
                            aria-label={`Meses linha ${idx + 1}`}
                          />
                        </div>
                      ) : (
                        <div className="min-w-0">
                          {idx === 0 && <Label>Preço base (R$)</Label>}
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.price}
                            onChange={(e) => updatePricingRow(row.key, { price: e.target.value })}
                            className={idx === 0 ? "mt-1" : undefined}
                            aria-label={`Preço base linha ${idx + 1}`}
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        {idx === 0 && <Label>Cota</Label>}
                        <Input
                          value={row.channel}
                          onChange={(e) => updatePricingRow(row.key, { channel: e.target.value })}
                          className={idx === 0 ? "mt-1" : undefined}
                          placeholder="ex.: WhatsApp"
                          aria-label={`Cota linha ${idx + 1}`}
                        />
                      </div>
                      <div className="min-w-0">
                        {idx === 0 && <Label>Desconto (%)</Label>}
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={row.discount}
                          onChange={(e) => updatePricingRow(row.key, { discount: e.target.value })}
                          className={idx === 0 ? "mt-1" : undefined}
                          aria-label={`Desconto linha ${idx + 1}`}
                        />
                      </div>
                      <div className="min-w-0">
                        {idx === 0 && <Label>Valor com desconto (R$)</Label>}
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.priceWithDiscount}
                          onChange={(e) =>
                            updatePricingRow(row.key, { priceWithDiscount: e.target.value })
                          }
                          className={idx === 0 ? "mt-1" : undefined}
                          aria-label={`Valor com desconto linha ${idx + 1}`}
                        />
                      </div>
                      {courseLevel === "POSTGRADUATE" && (
                        <div className="min-w-0">
                          {idx === 0 && <Label>Parcelas</Label>}
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={row.installments}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^\d+$/.test(v)) {
                                updatePricingRow(row.key, { installments: v });
                              }
                            }}
                            className={idx === 0 ? "mt-1" : undefined}
                            placeholder="ex.: 12"
                            aria-label={`Parcelas linha ${idx + 1}`}
                          />
                        </div>
                      )}
                      <div className={idx === 0 ? "flex items-end" : "flex items-center"}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={pricingRows.length <= 1}
                          onClick={() =>
                            setPricingRows((rows) => rows.filter((r) => r.key !== row.key))
                          }
                          aria-label={`Remover opção de preço ${idx + 1}`}
                          className="size-9 shrink-0 text-[var(--text-muted)] hover:text-[var(--color-danger)]"
                        >
                          <IconTrash size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      setPricingRows((rows) => [
                        ...rows,
                        courseLevel === "POSTGRADUATE"
                          ? newPricingRow({
                              // Pós: nova cota herda o preço base único
                              price: rows[0]?.price ?? "",
                              priceWithDiscount: discountedFrom(
                                rows[0]?.price ?? "",
                                "",
                              ),
                            })
                          : newPricingRow(),
                      ])
                    }
                  >
                    <IconPlus size={14} />
                    Adicionar preço / cota
                  </Button>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="size-4 rounded accent-[var(--brand-primary)]"
                    />
                    Ativo
                  </label>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>{kind === "SERVICE" ? "Valor base (R$)" : "Preço base (R$)"}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="mt-1"
                  />
                </div>
                {kind === "PHYSICAL" && (
                  <div>
                    <Label>Unidade</Label>
                    <Input value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1" />
                  </div>
                )}
                <div className="flex items-end justify-end sm:col-start-3">
                  <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="size-4 rounded accent-[var(--brand-primary)]"
                    />
                    Ativo
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Catálogo (capacidades herdadas) */}
          <div className={sectionClass}>
            <p className={sectionTitleClass}>
              <IconBoxMultiple size={14} /> Catálogo
            </p>
            <DropdownGlass
              options={catalogOptions}
              value={catalogId}
              onValueChange={setCatalogId}
              triggerClassName="h-10 w-full text-[13px]"
              placeholder="Sem catálogo"
            />
            {inheritedCaps.length > 0 ? (
              <div className="mt-3 flex flex-col gap-1.5">
                <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                  Capacidades herdadas deste catálogo
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {inheritedCaps.map((c) => {
                    const meta = capabilityMeta(c.capabilityKey);
                    const Icon = meta.icon;
                    return (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--glass-bg-strong)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)]"
                        title={c.overridePolicy === "LOCKED" ? "Travada — herdada e não editável no produto" : undefined}
                      >
                        <Icon size={11} className="text-[var(--brand-primary)]" />
                        {meta.short}
                        {c.overridePolicy === "LOCKED" && (
                          <span className="text-[var(--text-muted)]">· travada</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                {catalogId
                  ? "Este catálogo não tem capacidades ativas."
                  : "Vincule a um catálogo para herdar capacidades (preços, alocação, etc.)."}
              </p>
            )}
          </div>

          {/* PHYSICAL: envio */}
          {kind === "PHYSICAL" && (
            <div className={sectionClass}>
              <p className={sectionTitleClass}>
                <IconBuildingStore size={14} /> Envio e logística
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Peso (g)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={weightGrams}
                    onChange={(e) => setWeightGrams(e.target.value)}
                    className="mt-1"
                    placeholder="ex.: 500"
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                O saldo de estoque é gerido no painel de Alocação (abaixo, ao editar).
              </p>
            </div>
          )}

          {/* SERVICE: planos */}
          {kind === "SERVICE" && (
            <div className={sectionClass}>
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  <IconCash size={14} /> Planos
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPlans((p) => [
                      ...p,
                      { name: "", interval: "MONTHLY", amount: "", active: true },
                    ])
                  }
                >
                  <IconPlus size={14} /> Plano
                </Button>
              </div>
              {plans.length === 0 ? (
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Sem planos. Adicione um plano de precificação (MRR — sem cobrança automática).
                </p>
              ) : (
                <div className="space-y-2">
                  {plans.map((p, i) => (
                    <div key={i} className="grid grid-cols-12 items-end gap-2">
                      <div className="col-span-5">
                        <Label className="text-[11px]">Nome</Label>
                        <Input
                          value={p.name}
                          onChange={(e) =>
                            setPlans((arr) =>
                              arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            )
                          }
                          className="mt-1 h-9"
                        />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-[11px]">Intervalo</Label>
                        <DropdownGlass
                          options={(Object.keys(PLAN_INTERVAL_LABEL) as PlanInterval[]).map(
                            (iv) => ({ value: iv, label: PLAN_INTERVAL_LABEL[iv] }),
                          )}
                          value={p.interval}
                          onValueChange={(v) =>
                            setPlans((arr) =>
                              arr.map((x, j) =>
                                j === i ? { ...x, interval: v as PlanInterval } : x,
                              ),
                            )
                          }
                          triggerClassName="mt-1 h-9 w-full"
                        />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-[11px]">Valor (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={p.amount}
                          onChange={(e) =>
                            setPlans((arr) =>
                              arr.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                            )
                          }
                          className="mt-1 h-9"
                        />
                      </div>
                      <div className="col-span-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9"
                          onClick={() => setPlans((arr) => arr.filter((_, j) => j !== i))}
                        >
                          <IconTrash size={14} className="text-[var(--color-danger)]" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* COURSE */}
          {kind === "COURSE" && (
            <div className={sectionClass}>
              <p className={sectionTitleClass}>
                <IconSchool size={14} /> Curso
              </p>
              <div
                className={[
                  "grid gap-3 sm:grid-cols-2",
                  courseLevel !== "POSTGRADUATE" ? "lg:grid-cols-3" : "",
                ].join(" ")}
              >
                <div>
                  <Label>Modalidade</Label>
                  <DropdownGlass
                    options={(Object.keys(COURSE_MODE_LABEL) as CourseMode[]).map((m) => ({
                      value: m,
                      label: COURSE_MODE_LABEL[m],
                    }))}
                    value={courseMode}
                    onValueChange={(v) => setCourseMode(v as CourseMode)}
                    triggerClassName="mt-1 h-9 w-full"
                  />
                </div>
                {courseLevel !== "POSTGRADUATE" && (
                  <div>
                    <Label>Semestre</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={courseSemester}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^\d+$/.test(v)) setCourseSemester(v);
                      }}
                      className="mt-1"
                      placeholder="ex.: 1"
                    />
                  </div>
                )}
                <div>
                  <Label>Funil pós-venda</Label>
                  <DropdownGlass
                    options={[
                      { value: "", label: "— Nenhum —" } as DropdownOption,
                      ...pipelines.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                    value={postSalePipelineId}
                    onValueChange={(v) => setPostSalePipelineId(v)}
                    triggerClassName="mt-1 h-9 w-full"
                  />
                </div>
              </div>

              <p className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                Duração, Público-Alvo e Observações (ex.: 5 estrelas MEC) são
                Campos Personalizados. Cadastre em{" "}
                <span className="font-medium text-[var(--text-primary)]">
                  Ajustes → Campos personalizados
                </span>{" "}
                (entidade: Produto) e edite os valores em cada curso.
              </p>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Turmas
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setClasses((c) => [...c, { name: "", startsAt: "", endsAt: "", location: "" }])
                  }
                >
                  <IconPlus size={14} /> Turma
                </Button>
              </div>
              {classes.length === 0 ? (
                <p className="mt-2 text-[11px] text-[var(--text-secondary)]">Sem turmas cadastradas.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {classes.map((c, i) => (
                    <div key={i} className="grid grid-cols-12 items-end gap-2">
                      <div className="col-span-4">
                        <Label className="text-[11px]">Nome</Label>
                        <Input
                          value={c.name}
                          onChange={(e) =>
                            setClasses((arr) =>
                              arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            )
                          }
                          className="mt-1 h-9"
                        />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-[11px]">Início</Label>
                        <Input
                          type="date"
                          value={(c.startsAt ?? "").slice(0, 10)}
                          onChange={(e) =>
                            setClasses((arr) =>
                              arr.map((x, j) => (j === i ? { ...x, startsAt: e.target.value } : x)),
                            )
                          }
                          className="mt-1 h-9"
                        />
                      </div>
                      <div className="col-span-4">
                        <Label className="text-[11px]">Local</Label>
                        <Input
                          value={c.location ?? ""}
                          onChange={(e) =>
                            setClasses((arr) =>
                              arr.map((x, j) => (j === i ? { ...x, location: e.target.value } : x)),
                            )
                          }
                          className="mt-1 h-9"
                        />
                      </div>
                      <div className="col-span-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9"
                          onClick={() => setClasses((arr) => arr.filter((_, j) => j !== i))}
                        >
                          <IconTrash size={14} className="text-[var(--color-danger)]" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* JOB_OPENING */}
          {kind === "JOB_OPENING" && (
            <div className={sectionClass}>
              <p className={sectionTitleClass}>
                <IconBriefcase size={14} /> Vaga
              </p>
              <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                Produtos do tipo Vaga geram processos seletivos. As vagas (com nº de posições,
                empresa cliente e funil de candidatos) são criadas automaticamente ao ganhar um
                negócio B2B com este produto, ou manualmente na tela{" "}
                <span className="font-semibold text-[var(--text-primary)]">Vagas</span>.
              </p>
            </div>
          )}

          {/* Seções que exigem produto salvo */}
          {isEdit && productId && (
            <>
              <OffersSection productId={productId} basePrice={Number(price) || 0} />
              <div className={sectionClass}>
                <p className={sectionTitleClass}>
                  <IconUsers size={14} /> Stakeholders
                </p>
                <StakeholdersSection productId={productId} />
              </div>
              {canInventoryView && <InventoryPanel productId={productId} />}
            </>
          )}

          {detail?.jobOpenings && detail.jobOpenings.length > 0 && (
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Vagas vinculadas</p>
              <div className="flex flex-wrap gap-2">
                {detail.jobOpenings.map((j) => (
                  <Badge key={j.id} variant="outline">
                    {j.title}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
    </FormDialog>
  );
}
