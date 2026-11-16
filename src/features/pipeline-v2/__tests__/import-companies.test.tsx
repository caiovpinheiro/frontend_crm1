/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: h.toastError, info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/features/shared/queries/pipelines", () => ({
  usePipelinesQuery: () => ({ data: [] }),
}));
vi.mock("@/components/crm/tooltip-glass", () => ({
  TooltipGlass: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/pipeline/bulk-operation-progress-dialog", () => ({
  BulkOperationProgressDialog: ({ operationId, title }: { operationId: string | null; title: string }) =>
    operationId ? <div>progresso:{title}:{operationId}</div> : null,
}));

import { ImportPanel } from "../import-export";

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ImportPanel fixedEntity="companies" onDone={() => {}} />
    </QueryClientProvider>,
  );
}

async function upload(csv: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([csv], "empresas.csv", { type: "text/csv" });
  // jsdom não implementa File.text() em todas as versões.
  Object.defineProperty(file, "text", { value: async () => csv });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("Configurações de Importação");
}

describe("ImportPanel — empresas", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ operationId: "op1", total: 2 }), { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("auto-mapeia o CSV da exportação, sem tag e com 'atualizar' desligado por padrão", async () => {
    renderPanel();
    await upload("Número;Nome;Domínio;Porte;Cidade;Contatos\n10;Acme;a@acme.com;00.000/0001;SP;3\n;Beta;;;RJ;0");

    const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
    expect(selects.map((s) => s.value)).toEqual(["number", "name", "domain", "size", "city", ""]);
    expect(screen.queryByText("Criar tag")).toBeNull();
    const update = screen.getByRole("checkbox", { name: "Atualizar dados existentes" });
    expect(update.getAttribute("aria-checked")).toBe("false");
    // Empresas não buscam campos personalizados.
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Importar agora/ }));
    await screen.findByText("progresso:Importação de empresas:op1");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/companies/import");
    const fd = init.body as FormData;
    expect(fd.get("updateExisting")).toBe("false");
    expect(fd.get("tag")).toBeNull();
    const sent = await (fd.get("file") as Blob).text();
    expect(sent.split("\n")[0]).toBe("number,name,domain,size,city");
    expect(sent.split("\n")[1]).toBe("10,Acme,a@acme.com,00.000/0001,SP");
  });

  it("marcar 'atualizar existentes' envia a escolha explícita", async () => {
    renderPanel();
    await upload("Número,Nome\n10,Acme");
    fireEvent.click(screen.getByRole("checkbox", { name: "Atualizar dados existentes" }));
    fireEvent.click(screen.getByRole("button", { name: /Importar agora/ }));
    await screen.findByText("progresso:Importação de empresas:op1");
    const fd = fetchMock.mock.calls[0]![1].body as FormData;
    expect(fd.get("updateExisting")).toBe("true");
  });

  it("bloqueia o envio sem a coluna Nome mapeada", async () => {
    renderPanel();
    await upload("Número,Cidade\n10,SP");
    fireEvent.click(screen.getByRole("button", { name: /Importar agora/ }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(h.toastError.mock.calls[0]![0]).toMatch(/Nome/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
