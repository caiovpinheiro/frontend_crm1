/**
 * Contrato dos eventos de tempo real no frontend (espelho do backend).
 *
 * A lista de nomes abaixo é a MESMA de `REALTIME_EVENT_NAMES` em
 * `src/lib/realtime-events.ts` do backend (lá o teste
 * `realtime-contract.test.ts` exige um publisher por nome). Evento novo
 * entra nos dois repositórios.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  readBoardScope,
  REALTIME_EVENT_NAMES,
  realtimeHandlers,
  type RealtimeEvent,
  type RealtimePayload,
} from "@/lib/realtime-contract";

describe("contrato: nomes de evento", () => {
  it("espelha a lista do backend", () => {
    expect([...REALTIME_EVENT_NAMES]).toEqual([
      "new_message",
      "message_status",
      "message_updated",
      "message_deleted",
      "conversation_updated",
      "conversation_timeline_updated",
      "conversation_assigned",
      "conversation_unassigned",
      "typing",
      "scheduled_message_updated",
      "contact_updated",
      "whatsapp_call",
      "automation_state",
      "channel_updated",
      "presence_update",
      "system_presence_update",
      "entity_viewers",
      "support_ticket_new",
      "support_ticket_updated",
      "support_message",
      "team_chat_message",
      "team_chat_room_updated",
      "team_chat_typing",
      "team_chat_work_item_updated",
      "team_chat_forward_updated",
      "deal_moved",
    ]);
    expect(new Set(REALTIME_EVENT_NAMES).size).toBe(REALTIME_EVENT_NAMES.length);
  });

  it("a união é discriminada pelo nome do evento", () => {
    const sample: RealtimeEvent = {
      event: "new_message",
      data: {
        organizationId: "org-1",
        conversationId: "conv-1",
        direction: "in",
        pipelineIds: ["p1"],
        dealIds: ["d1"],
      },
    };
    if (sample.event === "new_message") {
      expectTypeOf(sample.data.pipelineIds).toEqualTypeOf<string[] | undefined>();
      expect(sample.data.dealIds).toEqual(["d1"]);
    }
    expectTypeOf<RealtimePayload<"message_status">["status"]>().toEqualTypeOf<
      string | undefined
    >();
  });

  it("realtimeHandlers devolve o mesmo mapa (só confere nomes e tipos)", () => {
    const handlers = {
      new_message: () => {},
      typing: () => {},
    };
    expect(realtimeHandlers(handlers)).toBe(handlers);
  });
});

describe("readBoardScope", () => {
  it("lê pipelineIds e dealIds do evento", () => {
    expect(
      readBoardScope({ contactId: "c1", pipelineIds: ["p1", "p2"], dealIds: ["d1"] }),
    ).toEqual({ pipelineIds: ["p1", "p2"], dealIds: ["d1"] });
  });

  it("pipelineIds vazio é escopo válido: nenhum board afetado", () => {
    expect(readBoardScope({ pipelineIds: [], dealIds: [] })).toEqual({
      pipelineIds: [],
      dealIds: [],
    });
  });

  it("sem dealIds (lista grande ou não informada): dealIds null", () => {
    expect(readBoardScope({ pipelineIds: ["p1"] })).toEqual({
      pipelineIds: ["p1"],
      dealIds: null,
    });
  });

  it("aceita pipelineId singular de publicador legado", () => {
    expect(readBoardScope({ pipelineId: "p7" })).toEqual({
      pipelineIds: ["p7"],
      dealIds: null,
    });
  });

  it("backend antigo (sem os campos) → null: o chamador usa o fallback", () => {
    expect(readBoardScope({ contactId: "c1", content: "oi" })).toBeNull();
    expect(readBoardScope({ dealIds: ["d1"] })).toBeNull();
    expect(readBoardScope(null)).toBeNull();
    expect(readBoardScope("x")).toBeNull();
    expect(readBoardScope({ pipelineIds: "p1" })).toBeNull();
  });

  it("descarta ids que não são string", () => {
    expect(readBoardScope({ pipelineIds: ["p1", 2, null, ""], dealIds: [1, "d1"] })).toEqual({
      pipelineIds: ["p1"],
      dealIds: ["d1"],
    });
  });
});
