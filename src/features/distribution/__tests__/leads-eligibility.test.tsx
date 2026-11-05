/** @vitest-environment jsdom */
/**
 * Coluna "Elegível" da Distribuição por Leads e o diálogo de liberar/pausar
 * até um horário (temporário; "Encerrar agora" volta à regra do departamento).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("../leads-hooks", () => ({
  useLeadsEligibilityOverride: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));

import {
  describeEligibilityBadge,
  EligibilityCell,
  EligibilityOverrideDialog,
  endsTomorrow,
  untilLabel,
} from "../leads-eligibility";
import type { LeadsEligibilityDto, LeadsParticipantDto } from "../leads-types";

/** Instante em São Paulo (UTC-3). */
const sp = (iso: string) => new Date(`${iso}-03:00`);

function participant(eligibility: LeadsEligibilityDto): LeadsParticipantDto {
  return {
    userId: "u1",
    name: "Fran",
    email: "fran@x.com",
    avatarUrl: null,
    status: "ACTIVE",
    weight: 3,
    note: "",
    slots: [],
    totalReceived: 0,
    departments: [{ id: "d1", name: "Consultores - Dia" }],
    eligibility,
    createdAt: "",
    updatedAt: "",
  };
}

const foraDoHorario: LeadsEligibilityDto = { eligibleNow: false, reason: "OUT_OF_HOURS", override: null };
const noHorario: LeadsEligibilityDto = { eligibleNow: true, reason: "DEPARTMENT_ACTIVE", override: null };
const liberada: LeadsEligibilityDto = {
  eligibleNow: true,
  reason: "OVERRIDE_ELIGIBLE",
  override: { eligible: true, startsAt: sp("2026-11-05T17:00:00").toISOString(), endsAt: sp("2026-11-05T22:00:00").toISOString() },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.mutateAsync.mockResolvedValue({});
});
afterEach(() => cleanup());

describe("rótulos", () => {
  it("até hoje / amanhã no horário de Brasília", () => {
    const now = sp("2026-11-05T17:00:00");
    expect(untilLabel(sp("2026-11-05T22:00:00").toISOString(), now)).toBe("até 22:00");
    expect(untilLabel(sp("2026-11-06T08:00:00").toISOString(), now)).toBe("até amanhã 08:00");
    expect(endsTomorrow("22:00", now)).toBe(false);
    expect(endsTomorrow("08:00", now)).toBe(true);
  });

  it("badge com o motivo", () => {
    expect(describeEligibilityBadge(foraDoHorario)).toMatchObject({ label: "Inelegível", detail: "Fora do horário do departamento" });
    expect(describeEligibilityBadge(noHorario)).toMatchObject({ label: "Elegível", detail: "Departamento no horário" });
    expect(describeEligibilityBadge(liberada, sp("2026-11-05T18:00:00"))).toMatchObject({
      label: "Elegível",
      detail: "Liberado até 22:00",
    });
  });
});

describe("EligibilityCell", () => {
  it("fora do horário: gestor vê 'Liberar até…'; sem permissão não vê ação", () => {
    const onManage = vi.fn();
    render(<EligibilityCell participant={participant(foraDoHorario)} canManage onManage={onManage} />);
    fireEvent.click(screen.getByRole("button", { name: "Liberar até…" }));
    expect(onManage).toHaveBeenCalled();
    cleanup();
    render(<EligibilityCell participant={participant(foraDoHorario)} canManage={false} onManage={onManage} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("no horário: 'Pausar até…'; inativo: sem ação", () => {
    render(<EligibilityCell participant={participant(noHorario)} canManage onManage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Pausar até…" })).toBeTruthy();
    cleanup();
    render(
      <EligibilityCell
        participant={participant({ eligibleNow: false, reason: "INACTIVE", override: null })}
        canManage
        onManage={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("EligibilityOverrideDialog", () => {
  it("liberar até o horário escolhido", async () => {
    const onClose = vi.fn();
    render(<EligibilityOverrideDialog participant={participant(foraDoHorario)} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Até", { selector: "input" }), { target: { value: "22:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Liberar", hidden: true }));
    await waitFor(() =>
      expect(h.mutateAsync).toHaveBeenCalledWith({ userId: "u1", input: { eligible: true, until: "22:00" } }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("no horário, a ação padrão é pausar", async () => {
    render(<EligibilityOverrideDialog participant={participant(noHorario)} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Até", { selector: "input" }), { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Pausar", hidden: true }));
    await waitFor(() =>
      expect(h.mutateAsync).toHaveBeenCalledWith({ userId: "u1", input: { eligible: false, until: "15:00" } }),
    );
  });

  it("com liberação vigente: 'Encerrar agora' manda input null", async () => {
    render(<EligibilityOverrideDialog participant={participant(liberada)} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Encerrar agora", hidden: true }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledWith({ userId: "u1", input: null }));
  });

  it("erro do backend vira toast e não fecha", async () => {
    h.mutateAsync.mockRejectedValueOnce(new Error("Consultor não encontrado."));
    const onClose = vi.fn();
    render(<EligibilityOverrideDialog participant={participant(foraDoHorario)} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Liberar", hidden: true }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Consultor não encontrado."));
    expect(onClose).not.toHaveBeenCalled();
  });
});
