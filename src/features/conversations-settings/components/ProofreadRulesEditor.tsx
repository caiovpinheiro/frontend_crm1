"use client";

import * as React from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";

import type { ProofreadReplacement } from "@/features/inbox-v2/lib/proofread-pilot";

export function ProofreadRulesEditor({
  replacements,
  ignore,
  disabled,
  onChangeReplacements,
  onChangeIgnore,
}: {
  replacements: ProofreadReplacement[];
  ignore: string[];
  disabled?: boolean;
  onChangeReplacements: (next: ProofreadReplacement[]) => void;
  onChangeIgnore: (next: string[]) => void;
}) {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [ignoreDraft, setIgnoreDraft] = React.useState("");

  const inputClass =
    "h-10 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 font-body text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]";

  function addPair() {
    const nextFrom = from.trim();
    const nextTo = to.trim();
    if (!nextFrom || !nextTo || disabled) return;
    onChangeReplacements([
      ...replacements.filter(
        (item) => item.from.toLowerCase() !== nextFrom.toLowerCase(),
      ),
      { from: nextFrom, to: nextTo },
    ]);
    setFrom("");
    setTo("");
  }

  function addIgnore() {
    const token = ignoreDraft.trim().toLowerCase();
    if (!token || disabled) return;
    onChangeIgnore(ignore.includes(token) ? ignore : [...ignore, token]);
    setIgnoreDraft("");
  }

  return (
    <div className="flex flex-col gap-4 border-t border-[var(--glass-border-subtle)] pt-3">
      <div>
        <p className="font-display text-[13px] font-bold text-[var(--text-primary)]">
          Quando eu escrever → sugerir
        </p>
        <p className="mt-0.5 mb-2 font-body text-[12.5px] text-[var(--text-muted)]">
          Ex.: mi escrevi → me inscrevi. Vale para toda a organização.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="mi escrevi"
            disabled={disabled}
            className={inputClass}
          />
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="me inscrevi"
            disabled={disabled}
            className={inputClass}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={addPair}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 py-2 font-display text-[12.5px] font-bold text-[var(--text-primary)] hover:bg-[var(--glass-bg-overlay)] disabled:opacity-50"
          >
            <IconPlus size={14} />
            Adicionar
          </button>
        </div>
        {replacements.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {replacements.map((item) => (
              <li
                key={item.from}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-base)] px-3 py-2 font-body text-[13px]"
              >
                <span>
                  <span className="text-[var(--text-muted)]">{item.from}</span>
                  {" → "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {item.to}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remover ${item.from}`}
                  className="rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
                  onClick={() =>
                    onChangeReplacements(
                      replacements.filter((row) => row.from !== item.from),
                    )
                  }
                >
                  <IconTrash size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <p className="font-display text-[13px] font-bold text-[var(--text-primary)]">
          Nunca apontar
        </p>
        <p className="mt-0.5 mb-2 font-body text-[12.5px] text-[var(--text-muted)]">
          Trechos que o LanguageTool erra (ex.: fcee).
        </p>
        <div className="flex gap-2">
          <input
            value={ignoreDraft}
            onChange={(e) => setIgnoreDraft(e.target.value)}
            placeholder="fcee"
            disabled={disabled}
            className={inputClass}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={addIgnore}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 py-2 font-display text-[12.5px] font-bold text-[var(--text-primary)] hover:bg-[var(--glass-bg-overlay)] disabled:opacity-50"
          >
            <IconPlus size={14} />
            Ignorar
          </button>
        </div>
        {ignore.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {ignore.map((token) => (
              <li
                key={token}
                className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-base)] px-2.5 py-1 font-body text-[13px]"
              >
                {token}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Parar de ignorar ${token}`}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  onClick={() =>
                    onChangeIgnore(ignore.filter((item) => item !== token))
                  }
                >
                  <IconTrash size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
