/**
 * Espelho do catálogo de campos do relatório de matriculados (backend
 * `src/services/ai/academic-record-policy.ts`). O backend é a fonte da
 * verdade: ele normaliza o que foi salvo e descarta chave que não existe.
 * Aqui só ficam chave, rótulo e o aviso que a tela mostra.
 *
 * A allowlist é guardada em `toolConfig.consultar_matricula.readableFields`,
 * o mesmo campo que `search_crm_records` usa.
 */

export type AcademicFieldKey =
  | "nome"
  | "curso"
  | "polo"
  | "serie"
  | "ciclo"
  | "rgm"
  | "emailAcademico"
  | "instituicao"
  | "tipoMatricula"
  | "dataMatricula"
  | "situacao";

export type AcademicFieldDescriptor = {
  key: AcademicFieldKey;
  label: string;
  sensitiveHint: boolean;
  warning?: string;
};

/**
 * Ficam de fora, sem opção de liberar: CPF, data de nascimento, telefone e
 * e-mail pessoal. Servem para ACHAR a linha do aluno, nunca para o agente
 * dizer em voz alta.
 */
export const ACADEMIC_RECORD_FIELDS: AcademicFieldDescriptor[] = [
  { key: "nome", label: "Nome do aluno", sensitiveHint: false },
  { key: "curso", label: "Curso", sensitiveHint: false },
  { key: "polo", label: "Polo", sensitiveHint: false },
  { key: "serie", label: "Série / semestre", sensitiveHint: false },
  { key: "ciclo", label: "Ciclo", sensitiveHint: false },
  {
    key: "rgm",
    label: "RGM / número de matrícula",
    sensitiveHint: true,
    warning:
      "Identificador do aluno. Libere se o agente deve poder informar o RGM quando pedido.",
  },
  {
    key: "emailAcademico",
    label: "E-mail acadêmico",
    sensitiveHint: true,
    warning: "Dado de contato institucional.",
  },
  { key: "instituicao", label: "Instituição", sensitiveHint: false },
  {
    key: "tipoMatricula",
    label: "Tipo de matrícula (nova / rematrícula)",
    sensitiveHint: false,
  },
  {
    key: "dataMatricula",
    label: "Data da matrícula",
    sensitiveHint: true,
    warning: "Data de contrato. Raramente precisa ser dita ao aluno.",
  },
  {
    key: "situacao",
    label: "Situação da matrícula",
    sensitiveHint: true,
    warning:
      "Foi este campo que gerou o incidente: o agente respondeu “seu curso está cancelado”. O acesso ao portal já é derivado dele sem expor o motivo — só libere se a operação realmente quiser que o agente diga a situação.",
  },
];

const KEY_PREFIX = "matricula.";

export const ACADEMIC_FIELD_KEYS: AcademicFieldKey[] =
  ACADEMIC_RECORD_FIELDS.map((f) => f.key);

function stripPrefix(raw: string): string {
  const k = raw.trim().toLowerCase();
  return k.startsWith(KEY_PREFIX) ? k.slice(KEY_PREFIX.length) : k;
}

export function isAcademicFieldReadable(
  readableFields: string[],
  key: AcademicFieldKey,
): boolean {
  if (readableFields.length === 0) return false;
  return readableFields.some((raw) => {
    const k = raw.trim().toLowerCase();
    if (k === "*" || k === `${KEY_PREFIX}*`) return true;
    return stripPrefix(k) === key.toLowerCase();
  });
}

/**
 * Liga/desliga um campo preservando o que não é do relatório.
 *
 * `readableFields` é compartilhado com `search_crm_records` (chaves
 * "entidade.campo"), então marcar uma caixinha aqui não pode apagar o que
 * foi liberado lá.
 */
export function toggleAcademicField(
  readableFields: string[],
  key: AcademicFieldKey,
): string[] {
  const isAcademicKey = (raw: string) => {
    const k = raw.trim().toLowerCase();
    if (k.startsWith(KEY_PREFIX)) return true;
    return ACADEMIC_FIELD_KEYS.includes(k as AcademicFieldKey);
  };
  const others = readableFields.filter((raw) => !isAcademicKey(raw));
  const mine = readableFields.filter(isAcademicKey);
  const next = isAcademicFieldReadable(mine, key)
    ? mine.filter((raw) => stripPrefix(raw) !== key.toLowerCase())
    : [...mine, key];
  return [...others, ...next];
}
