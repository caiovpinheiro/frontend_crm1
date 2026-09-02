import { apiUrl, parseApiResponse } from "@/lib/api";
import type {
  DemandBoardDetail,
  DemandBoardLite,
  DemandComment,
  DemandItem,
  DemandItemDetail,
  DemandItemKind,
  DemandPriority,
  DemandStage,
} from "./types";

async function json<T>(res: Promise<Response>, fallback: string): Promise<T> {
  return parseApiResponse<T>(await res, fallback);
}

export async function listDemandBoards(): Promise<{ boards: DemandBoardLite[] }> {
  return json(
    fetch(apiUrl("/api/demands/boards")),
    "Não foi possível carregar os boards.",
  );
}

export async function createDemandBoard(input: {
  name: string;
  description?: string;
}): Promise<DemandBoardLite> {
  return json(
    fetch(apiUrl("/api/demands/boards"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível criar o board.",
  );
}

export async function getDemandBoard(id: string): Promise<DemandBoardDetail> {
  return json(
    fetch(apiUrl(`/api/demands/boards/${id}`)),
    "Não foi possível carregar o board.",
  );
}

export async function addDemandStage(
  boardId: string,
  input: { name: string; color?: string },
): Promise<DemandStage> {
  return json(
    fetch(apiUrl(`/api/demands/boards/${boardId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível criar a fase.",
  );
}

export async function createDemandItem(input: {
  boardId: string;
  title: string;
  description?: string;
  kind?: DemandItemKind;
  priority?: DemandPriority;
  stageId?: string;
  assigneeId?: string | null;
}): Promise<DemandItem> {
  return json(
    fetch(apiUrl("/api/demands/items"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível criar a demanda.",
  );
}

export async function getDemandItem(id: string): Promise<DemandItemDetail> {
  return json(
    fetch(apiUrl(`/api/demands/items/${id}`)),
    "Não foi possível carregar a demanda.",
  );
}

export async function patchDemandItem(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    kind: DemandItemKind;
    priority: DemandPriority;
    assigneeId: string | null;
    tags: string[];
  }>,
): Promise<DemandItem> {
  return json(
    fetch(apiUrl(`/api/demands/items/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
    "Não foi possível atualizar a demanda.",
  );
}

export async function moveDemandItem(
  id: string,
  input: { stageId: string; beforeId?: string | null; afterId?: string | null },
): Promise<DemandItem> {
  return json(
    fetch(apiUrl(`/api/demands/items/${id}/move`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível mover a demanda.",
  );
}

export async function commentDemandItem(
  id: string,
  content: string,
): Promise<DemandComment> {
  return json(
    fetch(apiUrl(`/api/demands/items/${id}/comments`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
    "Não foi possível comentar.",
  );
}

export async function voteDemandItem(
  id: string,
): Promise<{ item: DemandItem; votedByMe: boolean }> {
  return json(
    fetch(apiUrl(`/api/demands/items/${id}/vote`), { method: "POST" }),
    "Não foi possível votar.",
  );
}

export async function deleteDemandBoard(id: string): Promise<void> {
  await json(
    fetch(apiUrl(`/api/demands/boards/${id}`), { method: "DELETE" }),
    "Não foi possível excluir o board.",
  );
}

export async function deleteDemandItem(id: string): Promise<void> {
  await json(
    fetch(apiUrl(`/api/demands/items/${id}`), { method: "DELETE" }),
    "Não foi possível excluir a solicitação.",
  );
}
