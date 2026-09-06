"use client";

import * as React from "react";

import { ChipInput } from "@/components/ai-agents/chip-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formLabelClass } from "@/components/ui/form-dialog";
import { defaultInboxPolicy, type InboxPolicy } from "@/lib/ai-agents/steering";

type Props = {
  value: InboxPolicy;
  onChange: (next: InboxPolicy) => void;
};

export function InboxPolicyPanel({ value, onChange }: Props) {
  const patch = (partial: Partial<InboxPolicy>) =>
    onChange({ ...defaultInboxPolicy(), ...value, ...partial });

  const threshold =
    value.confidenceThreshold == null
      ? ""
      : String(value.confidenceThreshold);

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        Interceptos que o backend aplica antes (e depois) do modelo —
        confiança baixa, retenção, dúvida comercial e link da aula
        inaugural. Campo vazio / desligado cai no comportamento atual
        do código.
      </p>

      <ToggleRow
        id="low-conf"
        label="Handoff por baixa confiança"
        hint="Se o modelo marcar [CONFIANCA] abaixo do limiar, distribui para humano."
        checked={value.lowConfidenceHandoff}
        onChange={(lowConfidenceHandoff) => patch({ lowConfidenceHandoff })}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="conf-threshold" className={formLabelClass}>
          Limiar de confiança (0 a 1)
        </Label>
        <Input
          id="conf-threshold"
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={threshold}
          placeholder="0.40 (padrão do código)"
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              patch({ confidenceThreshold: null });
              return;
            }
            const n = Number(raw);
            patch({
              confidenceThreshold: Number.isFinite(n) ? n : null,
            });
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          Vazio usa 0.40. Valores abaixo disso disparam a distribuição.
        </p>
      </div>

      <ToggleRow
        id="intercept-ret"
        label="Intercepto de retenção"
        hint="Cancelar / trancar / desistir vai direto para Retenção, sem esperar o modelo."
        checked={value.interceptRetention}
        onChange={(interceptRetention) => patch({ interceptRetention })}
      />

      <div className="grid gap-1.5">
        <Label className={formLabelClass}>Palavras extras de retenção</Label>
        <ChipInput
          values={value.retentionKeywords}
          onChange={(retentionKeywords) => patch({ retentionKeywords })}
          placeholder="Ex.: quero cancelar a matrícula"
        />
        <p className="text-[11px] text-muted-foreground">
          Somadas aos termos já existentes no código (cancelar, trancar…).
        </p>
      </div>

      <ToggleRow
        id="intercept-shop"
        label="Intercepto de dúvida comercial"
        hint="Valor, grade, outro curso → Atendimento humano. Sem site institucional."
        checked={value.interceptCourseShopping}
        onChange={(interceptCourseShopping) =>
          patch({ interceptCourseShopping })
        }
      />

      <div className="grid gap-1.5">
        <Label className={formLabelClass}>Palavras extras de dúvida comercial</Label>
        <ChipInput
          values={value.courseShoppingKeywords}
          onChange={(courseShoppingKeywords) =>
            patch({ courseShoppingKeywords })
          }
          placeholder="Ex.: mensalidade, outro curso"
        />
      </div>

      <div className="rounded-xl border bg-muted/10 p-4">
        <div className="text-sm font-semibold">Aliases de departamento</div>
        <p className="mt-0.5 mb-3 text-[12px] text-muted-foreground">
          Como o CRM casa o nome do departamento no banco. Vazio = usa
          os aliases padrão (acolhimento / reten / atendimento, sac).
        </p>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className={formLabelClass}>Acolhimento</Label>
            <ChipInput
              values={value.departmentAliases.acolhimento}
              onChange={(acolhimento) =>
                patch({
                  departmentAliases: {
                    ...value.departmentAliases,
                    acolhimento,
                  },
                })
              }
              placeholder="Ex.: acolhimento"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className={formLabelClass}>Retenção</Label>
            <ChipInput
              values={value.departmentAliases.retencao}
              onChange={(retencao) =>
                patch({
                  departmentAliases: {
                    ...value.departmentAliases,
                    retencao,
                  },
                })
              }
              placeholder="Ex.: retenção"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className={formLabelClass}>Atendimento</Label>
            <ChipInput
              values={value.departmentAliases.atendimento}
              onChange={(atendimento) =>
                patch({
                  departmentAliases: {
                    ...value.departmentAliases,
                    atendimento,
                  },
                })
              }
              placeholder="Ex.: atendimento, sac"
            />
          </div>
        </div>
      </div>

      <p className="rounded-xl border bg-muted/10 p-3 text-[12px] text-muted-foreground">
        Textos de fila humana (8h, retenção) ficam em{" "}
        <span className="font-medium text-foreground">Pilotagem → Horário e fila humana</span>.
      </p>

      <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
        <ToggleRow
          id="inaugural"
          label="Link da aula inaugural"
          hint="Responde o YouTube sem passar pelo modelo, nas datas configuradas."
          checked={value.inauguralEnabled}
          onChange={(inauguralEnabled) => patch({ inauguralEnabled })}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="inaugural-url" className={formLabelClass}>
            URL do YouTube
          </Label>
          <Input
            id="inaugural-url"
            value={value.inauguralUrl ?? ""}
            onChange={(e) =>
              patch({ inauguralUrl: e.target.value.trim() || null })
            }
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className={formLabelClass}>
            Datas (YYYY-MM-DD, horário de Brasília)
          </Label>
          <ChipInput
            values={value.inauguralDates}
            onChange={(inauguralDates) => patch({ inauguralDates })}
            placeholder="Ex.: 2026-08-10"
          />
          <p className="text-[11px] text-muted-foreground">
            Vazio usa as datas padrão do código / variável de ambiente.
          </p>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-background/50 p-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
