"use client";

import {
  PageSearchBar,
  type PageSearchBarProps,
} from "@/components/crm/page-toolbar";

export type SearchInputProps = Omit<PageSearchBarProps, "variant">;

/**
 * Alias legado — busca compacta (`h-10`) no slot `center` do PageHeader
 * (renderizado à direita, largura canônica `w-[32rem] max-w-full`).
 * Novas telas com Filtrar na pílula devem usar `SearchFilterBar`.
 */
export function SearchInput(props: SearchInputProps) {
  return <PageSearchBar variant="compact" {...props} />;
}
