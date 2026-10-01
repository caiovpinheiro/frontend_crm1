import { describe, expect, it } from "vitest";

import { resolvePipelineEntry } from "./pipeline-view-preference";

describe("resolvePipelineEntry", () => {
  it("abre no kanban quando a preferência é kanban", () => {
    expect(resolvePipelineEntry({ search: "", preferred: "kanban" })).toEqual({
      kind: "kanban",
    });
  });

  it("redireciona para a lista preservando a query", () => {
    expect(
      resolvePipelineEntry({ search: "?pipeline=8&q=ana", preferred: "list" }),
    ).toEqual({ kind: "redirect", view: "list", href: "/pipeline/list?pipeline=8&q=ana" });
  });

  it("redireciona para o flow sem query quando não há parâmetros", () => {
    expect(resolvePipelineEntry({ search: "", preferred: "flow" })).toEqual({
      kind: "redirect",
      view: "flow",
      href: "/pipeline/flow",
    });
  });

  it("deep-link ?deal= sempre fica no kanban, mesmo com preferência lista", () => {
    expect(
      resolvePipelineEntry({ search: "?deal=102", preferred: "list" }),
    ).toEqual({ kind: "kanban" });
  });

  it("aceita a query sem o '?' inicial", () => {
    expect(resolvePipelineEntry({ search: "pipeline=3", preferred: "list" })).toEqual({
      kind: "redirect",
      view: "list",
      href: "/pipeline/list?pipeline=3",
    });
  });
});
