/** @vitest-environment jsdom */
/**
 * Seção "Contexto do site": rótulos, eventos importantes, limites,
 * retenção e anônimo. Dados neutros.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebchatContextSection } from "../context-section";
import { defaultWebchatV2Config, EMPTY_WEBCHAT_SECRETS, type WebchatV2Config } from "../v2-config";

function Harness({ onChange }: { onChange: (v: WebchatV2Config) => void }) {
  const [value, setValue] = useState(defaultWebchatV2Config());
  return (
    <WebchatContextSection
      channelId="ch-1"
      publicKey={null}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      secrets={EMPTY_WEBCHAT_SECRETS}
      onSecretsChange={() => {}}
    />
  );
}

afterEach(cleanup);

describe("WebchatContextSection", () => {
  it("adiciona rótulo com Enter; chave inválida mostra erro e não grava", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Chave do contexto"), { target: { value: "chave com espaço" } });
    fireEvent.change(screen.getByLabelText("Rótulo da chave"), { target: { value: "Etapa" } });
    fireEvent.click(screen.getByText("Rótulo"));
    expect(screen.getByRole("alert").textContent).toMatch(/Chave inválida/);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Chave do contexto"), { target: { value: "etapa" } });
    fireEvent.keyDown(screen.getByLabelText("Rótulo da chave"), { key: "Enter" });
    expect(onChange.mock.lastCall?.[0].context.labels).toEqual({ etapa: "Etapa" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("etapa")).toBeTruthy();
  });

  it("evento importante: nome inválido recusado, válido entra uma vez", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText("Eventos importantes (viram nota na conversa)");
    fireEvent.change(input, { target: { value: "-ruim" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(input, { target: { value: "pediu_ajuda" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "pediu_ajuda" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange.mock.lastCall?.[0].events.important).toEqual(["pediu_ajuda"]);
  });

  it("limites, retenção, anônimo e abrir conversa", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Guardar eventos e contexto por (dias)"), { target: { value: "7" } });
    expect(onChange.mock.lastCall?.[0].events.retentionDays).toBe(7);
    fireEvent.change(screen.getByLabelText("Máximo de chaves"), { target: { value: "500" } });
    expect(onChange.mock.lastCall?.[0].context.maxKeys).toBe(100);
    fireEvent.click(screen.getByLabelText("Aceitar contexto de visitante não identificado"));
    expect(onChange.mock.lastCall?.[0].context.anonymous).toBe(true);
    fireEvent.click(screen.getByLabelText("Evento importante abre conversa"));
    expect(onChange.mock.lastCall?.[0].events.importantOpensConversation).toBe(true);
  });
});
