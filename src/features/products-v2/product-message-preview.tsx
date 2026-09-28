"use client";

import { useQuery } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";

export function ProductMessagePreview({ productId }: { productId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["product-message-preview", productId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/products/${productId}/message`));
      if (!res.ok) return { text: null as string | null, templateName: null as string | null };
      return (await res.json()) as { text: string | null; templateName: string | null };
    },
  });

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2.5">
      <p className="text-[12px] font-semibold text-[var(--text-primary)]">Mensagem enviada ao cliente</p>
      {isLoading ? (
        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Carregando…</p>
      ) : data?.text ? (
        <>
          {data.templateName ? (
            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{data.templateName}</p>
          ) : null}
          <p className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--text-primary)]">{data.text}</p>
        </>
      ) : (
        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
          Nenhuma mensagem padrão para este tipo. O encaminhamento usa o texto atual. Cadastre em Produtos → Mensagens.
        </p>
      )}
    </div>
  );
}
