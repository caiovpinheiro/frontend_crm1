"use client";

import { useMemo, useState } from "react";

import { PaginationGlass } from "@/components/crm/pagination-glass";
import { CampaignCards } from "@/features/campaigns/campaign-cards";
import { CampaignDetailDrawer } from "@/features/campaigns/campaign-detail-drawer";
import { mockCampaignsPage } from "@/features/campaigns/mock-campaigns";
import type { CampaignListItem } from "@/features/campaigns/types";
import { sortCampaigns } from "@/features/campaigns/viz";

const PAGE_SIZES = [6, 12, 24] as const;

export default function CampaignsCardsPreviewPage() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<(typeof PAGE_SIZES)[number]>(6);
  const [selected, setSelected] = useState<CampaignListItem | null>(null);

  const data = useMemo(
    () => mockCampaignsPage({ page, perPage }),
    [page, perPage],
  );
  const items = useMemo(() => sortCampaigns(data.items, "readRate"), [data.items]);
  const lastPage = Math.max(1, data.totalPages);
  const safePage = Math.min(page, lastPage);

  return (
    <main className="min-h-dvh bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
        <header className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Preview · sem mini-dash
          </p>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Conversão das campanhas
          </h1>
          <p className="text-sm text-muted-foreground">
            Clique em um card para abrir o detalhe. Paginação 6 / 12 / 24.
          </p>
        </header>

        <CampaignCards items={items} onSelect={setSelected} />

        <PaginationGlass
          total={data.total}
          entityLabel="campanhas"
          page={safePage}
          lastPage={lastPage}
          canPrev={safePage > 1}
          canNext={safePage < lastPage}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          perPage={perPage}
          perPageOptions={PAGE_SIZES}
          onPerPageChange={(value) => {
            setPerPage(value as (typeof PAGE_SIZES)[number]);
            setPage(1);
          }}
        />
      </div>

      <CampaignDetailDrawer campaign={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
