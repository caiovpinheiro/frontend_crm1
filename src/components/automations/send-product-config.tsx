"use client";

/**
 * Seletor de produto (+ preço/canal de curso) para o passo send_product.
 * Usado na edição inline do canvas (via inline-editor).
 */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { apiUrl } from "@/lib/api";
import { useProductOptions } from "./editor-data";

type ProductOption = { id: string; name: string; sku?: string | null; price?: number };

type CoursePricingPick = {
  price: number;
  channel: string | null;
  discountPercent: number | null;
};

export type ProductSelection = {
  id: string;
  name: string;
  unitPrice?: number;
  discountPercent?: number | null;
  channel?: string | null;
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
    }> | null;
  } | null;
}): CoursePricingPick[] {
  const cc = product.courseConfig;
  if (!cc) return [];
  const raw = Array.isArray(cc.pricingOptions) ? cc.pricingOptions : [];
  if (raw.length > 0) {
    return raw.map((o) => ({
      price: Number(o.price) || 0,
      channel: typeof o.channel === "string" && o.channel.trim() ? o.channel.trim() : null,
      discountPercent:
        o.discountPercent === null || o.discountPercent === undefined || o.discountPercent === ""
          ? null
          : Number(o.discountPercent),
    }));
  }
  if (cc.channel != null || cc.discountPercent != null) {
    return [
      {
        price: Number(product.price) || 0,
        channel: typeof cc.channel === "string" && cc.channel.trim() ? cc.channel.trim() : null,
        discountPercent:
          cc.discountPercent === null ||
          cc.discountPercent === undefined ||
          cc.discountPercent === ""
            ? null
            : Number(cc.discountPercent),
      },
    ];
  }
  return [];
}

function pricingOptionFinal(option: CoursePricingPick): number {
  const disc = option.discountPercent ?? 0;
  return option.price * (1 - Math.min(100, Math.max(0, disc)) / 100);
}

function formatMoneyBr(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function ProductPicker({
  value,
  valueName,
  valueChannel,
  valueUnitPrice,
  valueDiscountPercent,
  onChange,
}: {
  value: string;
  valueName: string;
  valueChannel?: string;
  valueUnitPrice?: number;
  valueDiscountPercent?: number;
  onChange: (selection: ProductSelection) => void;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const products = useProductOptions();
  const [pendingPricing, setPendingPricing] = useState<{
    productId: string;
    productName: string;
    options: CoursePricingPick[];
  } | null>(null);

  const options: ProductOption[] = products.options.map((o) => ({
    id: o.value,
    name: o.label.split(" · ")[0] ?? o.label,
    sku: o.label.includes(" · ") ? o.label.split(" · ").slice(1).join(" · ") : null,
  }));

  async function handlePickProduct(p: ProductOption) {
    if (loadingId) return;
    setLoadingId(p.id);
    try {
      const res = await fetch(apiUrl(`/api/products/${p.id}`));
      if (!res.ok) {
        onChange({ id: p.id, name: p.name, unitPrice: p.price });
        return;
      }
      const data = (await res.json()) as {
        product?: Parameters<typeof normalizeCoursePricingOptions>[0] & { name?: string };
      };
      const product = data.product;
      const pricing = product ? normalizeCoursePricingOptions(product) : [];
      if (pricing.length > 1) {
        setPendingPricing({
          productId: p.id,
          productName: product?.name ?? p.name,
          options: pricing,
        });
        return;
      }
      if (pricing.length === 1) {
        const option = pricing[0];
        onChange({
          id: p.id,
          name: product?.name ?? p.name,
          unitPrice: option.price,
          discountPercent: option.discountPercent,
          channel: option.channel,
        });
        return;
      }
      onChange({ id: p.id, name: p.name, unitPrice: p.price });
    } catch {
      onChange({ id: p.id, name: p.name, unitPrice: p.price });
    } finally {
      setLoadingId(null);
    }
  }

  if (pendingPricing) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Escolha o preço / cota
            </p>
            <p className="truncate text-[13px] font-medium" title={pendingPricing.productName}>
              {pendingPricing.productName}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-[12px]"
            onClick={() => setPendingPricing(null)}
          >
            Voltar
          </Button>
        </div>
        <div className="max-h-56 overflow-auto rounded-md border border-border">
          {pendingPricing.options.map((option, idx) => {
            const disc = option.discountPercent ?? 0;
            const finalPrice = pricingOptionFinal(option);
            return (
              <button
                key={`${option.channel ?? "canal"}-${option.price}-${idx}`}
                type="button"
                onClick={() => {
                  onChange({
                    id: pendingPricing.productId,
                    name: pendingPricing.productName,
                    unitPrice: option.price,
                    discountPercent: option.discountPercent,
                    channel: option.channel,
                  });
                  setPendingPricing(null);
                }}
                className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left text-[13px] last:border-b-0 hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{option.channel || "Sem cota"}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Base {formatMoneyBr(option.price)}
                    {disc > 0 ? ` · -${disc}%` : ""}
                  </div>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-success">
                  {formatMoneyBr(finalPrice)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
          <div className="min-w-0">
            <span className="block truncate text-[13px] font-medium">
              {valueName || "Produto selecionado"}
            </span>
            {(valueChannel || valueUnitPrice !== undefined) && (
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {[
                  valueChannel || null,
                  valueUnitPrice !== undefined
                    ? formatMoneyBr(
                        valueUnitPrice *
                          (1 - Math.min(100, Math.max(0, valueDiscountPercent ?? 0)) / 100),
                      )
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[12px]"
            onClick={() => {
              setPendingPricing(null);
              onChange({ id: "", name: "" });
            }}
          >
            Trocar
          </Button>
        </div>
      ) : (
        <DropdownGlass
          triggerClassName="w-full"
          searchable
          searchPlaceholder="Buscar produto pelo nome ou SKU…"
          placeholder={
            products.isLoading
              ? "Carregando produtos…"
              : products.isError
                ? "Não foi possível carregar"
                : "Selecione um produto…"
          }
          value={value}
          options={products.options}
          onValueChange={(id) => {
            const p = options.find((o) => o.id === id)
            if (p) void handlePickProduct(p)
          }}
        />
      )}
    </div>
  );
}

/** Bloco completo para edição inline do canvas. */
export function SendProductInlineConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const unitPrice =
    typeof config.unitPrice === "number"
      ? config.unitPrice
      : config.unitPrice != null && String(config.unitPrice).trim() !== ""
        ? Number(config.unitPrice)
        : undefined;
  const discountPercent =
    typeof config.discountPercent === "number"
      ? config.discountPercent
      : config.discountPercent != null && String(config.discountPercent).trim() !== ""
        ? Number(config.discountPercent)
        : undefined;

  return (
    <div className="space-y-2">
      <p className="cfg-label">Produto</p>
      <ProductPicker
        value={String(config.productId ?? "")}
        valueName={String(config.productName ?? "")}
        valueChannel={typeof config.channel === "string" ? config.channel : undefined}
        valueUnitPrice={Number.isFinite(unitPrice) ? unitPrice : undefined}
        valueDiscountPercent={Number.isFinite(discountPercent) ? discountPercent : undefined}
        onChange={(sel) =>
          onChange({
            ...config,
            productId: sel.id,
            productName: sel.name,
            unitPrice: sel.unitPrice ?? "",
            discountPercent: sel.discountPercent ?? "",
            channel: sel.channel ?? "",
          })
        }
      />
    </div>
  );
}
