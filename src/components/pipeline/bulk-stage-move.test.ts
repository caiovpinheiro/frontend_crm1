import { describe, expect, it } from "vitest";

import { bulkStageMoveSkipsPipelineRefresh } from "./bulk-actions-bar";

describe("movimentação em massa fica fora do refresh do Pipeline", () => {
  it("move, ganhar e perder em lote não invalidam o board", () => {
    expect(bulkStageMoveSkipsPipelineRefresh("move_stage")).toBe(true);
    expect(bulkStageMoveSkipsPipelineRefresh("mark_won")).toBe(true);
    expect(bulkStageMoveSkipsPipelineRefresh("mark_lost")).toBe(true);
  });

  it("as outras ações em massa continuam atualizando o board", () => {
    expect(bulkStageMoveSkipsPipelineRefresh("change_owner")).toBe(false);
    expect(bulkStageMoveSkipsPipelineRefresh("delete")).toBe(false);
    expect(bulkStageMoveSkipsPipelineRefresh("")).toBe(false);
  });
});
