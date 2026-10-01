/**
 * `parseXlsx` (SheetJS) — fixtures antigas + ida e volta com a versão
 * instalada.
 *
 * Contexto: o `xlsx` do registry npm parou em 0.18.5 (GHSA-4r6h-8v6p-xvw6,
 * GHSA-5pgg-2g8v-p4x9, sem correção publicada lá). A dependência passou a
 * apontar para o tarball oficial do SheetJS (≥ 0.20.2 corrige os dois).
 * Estes testes garantem que a troca não muda o que o wizard de importação
 * enxerga (XLSX, XLS e ODS).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildMatriculadosWorkbook,
  type MatriculadosBookType,
} from "@/lib/__fixtures__/planilhas/matriculados";
import { parseXlsx } from "@/lib/csv-parse";

const FIXTURES = path.join(__dirname, "..", "__fixtures__", "planilhas");

/** `File.arrayBuffer()` entrega um ArrayBuffer próprio; reproduz isso. */
function fixture(name: string): ArrayBuffer {
  const buf = readFileSync(path.join(FIXTURES, name));
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return copy.buffer;
}

const HEADERS = [
  "nome",
  "e_mail_principal",
  "cpf",
  "rgm",
  "data_nascimento",
  "data_matricula",
  "valor",
  "ativo",
  "total",
  "obs",
];

/** XLSX/XLS preservam o formato numérico → chega o texto formatado. */
const ROWS_FORMATADAS = [
  {
    nome: "Ana Souza",
    e_mail_principal: "ana@exemplo.com",
    cpf: "123.456.789-01",
    rgm: "20231234",
    data_nascimento: "15/03/1990",
    data_matricula: "3/15/24",
    valor: "R$ 1,234.50",
    ativo: "TRUE",
    total: "2469",
    obs: "Olá, mundo",
  },
  {
    nome: "Bia Lima",
    e_mail_principal: "",
    cpf: "987.654.321-00",
    rgm: "20235678",
    data_nascimento: "01/07/2001",
    data_matricula: "11/2/23",
    valor: "50.00%",
    ativo: "FALSE",
    total: "1",
    obs: "",
  },
  {
    nome: 'Caio "Jr" Melo',
    e_mail_principal: "caio@exemplo.com",
    cpf: "",
    rgm: "",
    data_nascimento: "",
    data_matricula: "",
    valor: "",
    ativo: "",
    total: "",
    obs: "linha;com,delimitadores",
  },
];

/** O ODS escrito pelo SheetJS não carrega formato numérico: vem o valor cru. */
const ROWS_ODS = [
  { ...ROWS_FORMATADAS[0], cpf: "12345678901", data_nascimento: "32947", data_matricula: "45366", valor: "1234.5" },
  { ...ROWS_FORMATADAS[1], cpf: "98765432100", data_nascimento: "37073", data_matricula: "45232", valor: "0.5" },
  ROWS_FORMATADAS[2],
];

describe("parseXlsx — fixtures geradas pelo xlsx 0.18.5, leitura idêntica", () => {
  it(".xlsx", async () => {
    const r = await parseXlsx(fixture("matriculados-xlsx-0.18.5.xlsx"));
    expect(r.headers).toEqual(HEADERS);
    expect(r.rows).toEqual(ROWS_FORMATADAS);
  });

  it(".xls (BIFF8 / OLE2)", async () => {
    const r = await parseXlsx(fixture("matriculados-xlsx-0.18.5.xls"));
    expect(r.headers).toEqual(HEADERS);
    expect(r.rows).toEqual(ROWS_FORMATADAS);
  });

  it(".ods", async () => {
    const r = await parseXlsx(fixture("matriculados-xlsx-0.18.5.ods"));
    expect(r.headers).toEqual(HEADERS);
    expect(r.rows).toEqual(ROWS_ODS);
  });

  it("só a primeira aba entra", async () => {
    const r = await parseXlsx(fixture("matriculados-xlsx-0.18.5.xlsx"));
    expect(JSON.stringify(r)).not.toContain("nao deve ser lida");
  });
});

describe("parseXlsx — ida e volta com a versão instalada", () => {
  it("é SheetJS ≥ 0.20.2 (corrige os dois advisories do 0.18.5)", async () => {
    const XLSX = await import("xlsx");
    const [maj, min, pat] = XLSX.version.split(".").map(Number);
    expect(maj > 0 || min > 20 || (min === 20 && pat >= 2)).toBe(true);
  });

  const cases: [string, MatriculadosBookType, typeof ROWS_FORMATADAS][] = [
    ["xlsx", "xlsx", ROWS_FORMATADAS],
    ["xls", "biff8", ROWS_FORMATADAS],
    ["ods", "ods", ROWS_ODS],
  ];
  for (const [ext, bookType, rows] of cases) {
    it(`gerar → ler: .${ext}`, async () => {
      const XLSX = await import("xlsx");
      const out = XLSX.write(buildMatriculadosWorkbook(XLSX), { type: "array", bookType }) as ArrayBuffer;
      const r = await parseXlsx(out);
      expect(r.headers).toEqual(HEADERS);
      expect(r.rows).toEqual(rows);
    });
  }
});
