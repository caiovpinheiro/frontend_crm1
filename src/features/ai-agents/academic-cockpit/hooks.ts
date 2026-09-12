"use client";

import { useQuery } from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";

import { fetchAcademicCockpit } from "./api";
import type { AcademicCockpit } from "./types";

/**
 * Uma única query serve as 4 abas (mesma `queryKey`), então trocar de aba não
 * refaz a chamada. `enabled` é o lazy loading: enquanto o usuário está na aba
 * "Agentes" nada é buscado.
 */
export function useAcademicCockpit(enabled: boolean) {
  const visible = useDocumentVisible();
  return useQuery<AcademicCockpit>({
    queryKey: ["academic-cockpit"],
    queryFn: fetchAcademicCockpit,
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: enabled && visible ? 60 * 1000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
