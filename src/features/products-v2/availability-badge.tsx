"use client";

import { useQuery } from "@tanstack/react-query";

import { useCan } from "@/hooks/use-my-permissions";
import { apiUrl } from "@/lib/api";
import type { InventoryPoolView } from "./types";

/**
 * Badge compacto de disponibilidade de alocação de um produto.
 * Soma o saldo de todos os pools. Não renderiza nada se o produto não usa
 * alocação consumível (sem pools) ou se o usuário não tem `inventory:view`.
 *
 * A rota `GET /api/products/:id/inventory` exige `inventory:view` e responde
 * 403 para quem não tem. Sem a permissão (já carregada pelo bootstrap /
 * `effective-permissions`) a query fica desligada: nada de uma chamada
 * negada por produto exibido, a cada remontagem.
 */
export function AvailabilityBadge({ productId }: { productId: string }) {
  const canViewInventory = useCan("inventory:view");
  const { data } = useQuery({
    queryKey: ["availability-badge", productId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/products/${productId}/inventory`));
      if (!res.ok) return null;
      return (await res.json()) as { pools: InventoryPoolView[] };
    },
    enabled: canViewInventory,
    staleTime: 30_000,
  });

  if (!data || !data.pools || data.pools.length === 0) return null;

  const balance = data.pools.reduce((sum, p) => sum + (p.stats?.balance ?? 0), 0);
  const empty = balance <= 0;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
      style={{
        borderColor: empty ? "var(--color-danger)" : "var(--color-success)",
        color: empty ? "var(--color-danger)" : "var(--color-success)",
        background: empty
          ? "color-mix(in srgb, var(--color-danger) 12%, transparent)"
          : "var(--color-success-soft)",
      }}
      title={empty ? "Sem saldo disponível" : `${balance} disponível(is)`}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: empty ? "var(--color-danger)" : "var(--color-success)" }}
      />
      {empty ? "Sem saldo" : `${balance} disp.`}
    </span>
  );
}
