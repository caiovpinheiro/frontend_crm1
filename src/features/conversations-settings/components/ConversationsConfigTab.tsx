"use client";

import * as React from "react";
import Link from "next/link";
import {
  IconArrowRight,
  IconMail,
  IconMicrophone,
  IconPencil,
  IconRobot,
  IconShieldCheck,
  IconSignature,
  IconTextSpellcheck,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/crm/glass-card";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { useInboxSettings, useSaveInboxSetting, type InboxSettings } from "../hooks/use-inbox-settings";
import { loadProofreadPilot } from "@/features/inbox-v2/lib/proofread-pilot";
import { ProofreadRulesEditor } from "./ProofreadRulesEditor";

// ─── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
      {children}
    </p>
  );
}

// ─── Toggle setting row ─────────────────────────────────────────────────────────

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] p-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:bg-[var(--glass-bg-base)] sm:flex-row sm:items-center sm:gap-3.5 sm:p-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[14px] font-bold text-pretty text-[var(--text-primary)]">{label}</h3>
          <p className="mt-0.5 max-w-[560px] break-words font-body text-[12.5px] leading-snug text-[var(--text-muted)]">
            {description}
          </p>
        </div>
      </div>
      <SwitchGlass
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
        size="list"
        className="shrink-0 self-end sm:self-auto"
      />
    </div>
  );
}

// ─── Select setting row ─────────────────────────────────────────────────────────

function SelectRow<T extends string>({
  icon,
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] p-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:bg-[var(--glass-bg-base)] sm:flex-row sm:items-center sm:gap-3.5 sm:p-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[14px] font-bold text-pretty text-[var(--text-primary)]">{label}</h3>
          <p className="mt-0.5 max-w-[560px] break-words font-body text-[12.5px] leading-snug text-[var(--text-muted)]">
            {description}
          </p>
        </div>
      </div>
      <DropdownGlass
        options={options}
        value={value}
        onValueChange={(v) => onChange(v as T)}
        disabled={disabled}
        matchTriggerWidth={false}
        triggerClassName="w-full min-w-[160px] sm:w-auto"
      />
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function ConversationsConfigTab() {
  const { settings, isLoading } = useInboxSettings();
  const saveMutation = useSaveInboxSetting();

  function save(key: keyof InboxSettings, value: InboxSettings[keyof InboxSettings]) {
    saveMutation.mutate(
      { key, value },
      {
        onError: () => toast.error("Falha ao salvar configuração"),
      },
    );
  }

  const busy = isLoading || saveMutation.isPending;

  return (
    <div className="flex min-w-0 w-full max-w-full flex-col gap-6">
      {/* ── Assinatura do agente ──────────────────────────────────────────── */}
      <GlassCard variant="panel" className="min-w-0 p-3 sm:p-4.5">
        <SectionLabel>Assinatura do agente</SectionLabel>
        <div className="flex flex-col gap-2.5">
          <ToggleRow
            icon={<IconSignature size={20} />}
            label="Permitir assinatura"
            description="Agentes podem assinar mensagens enviadas com seu nome, habilitado ou desabilitado individualmente no composer."
            checked={settings.agentSignatureEnabled}
            onChange={(v) => save("agentSignatureEnabled", v)}
            disabled={busy}
          />
          <ToggleRow
            icon={<IconPencil size={20} />}
            label="Permitir edição da assinatura"
            description="Agentes podem personalizar o texto da assinatura. Quando desativado, somente o nome do perfil é utilizado."
            checked={settings.agentSignatureEditable}
            onChange={(v) => save("agentSignatureEditable", v)}
            disabled={!settings.agentSignatureEnabled || busy}
          />
          <ToggleRow
            icon={<IconSignature size={20} />}
            label="Assinatura obrigatória"
            description="Exige que todos os atendentes utilizem assinatura ao enviar mensagens."
            checked={settings.requireSignature}
            onChange={(v) => save("requireSignature", v)}
            disabled={!settings.agentSignatureEnabled || busy}
          />
        </div>
      </GlassCard>

      {/* ── Corretor automático ───────────────────────────────────────────── */}
      <GlassCard variant="panel" className="min-w-0 p-3 sm:p-4.5">
        <SectionLabel>Corretor automático</SectionLabel>
        <div className="flex flex-col gap-2.5">
          <ToggleRow
            icon={<IconTextSpellcheck size={20} />}
            label="Ativar corretor no envio"
            description="Antes de enviar, o inbox corrige ortografia e aplica as regras abaixo. Vale para todos os atendentes."
            checked={settings.proofreadEnabled}
            onChange={(v) => save("proofreadEnabled", v)}
            disabled={busy}
          />
          {settings.proofreadEnabled ? (
            <ProofreadRulesEditor
              replacements={
                settings.proofreadReplacementsSaved
                  ? settings.proofreadReplacements
                  : loadProofreadPilot().replacements
              }
              ignore={
                settings.proofreadIgnoreSaved
                  ? settings.proofreadIgnore
                  : loadProofreadPilot().ignore
              }
              disabled={busy}
              onChangeReplacements={(next) => save("proofreadReplacements", next)}
              onChangeIgnore={(next) => save("proofreadIgnore", next)}
            />
          ) : null}
        </div>
      </GlassCard>

      {/* ── Finalização de conversa ───────────────────────────────────────── */}
      <GlassCard variant="panel" className="min-w-0 p-3 sm:p-4.5">
        <SectionLabel>Finalização de conversa</SectionLabel>
        <div className="flex flex-col gap-2.5">
          <ToggleRow
            icon={<IconUser size={20} />}
            label="Manter atendente ao finalizar"
            description="O atendente permanece vinculado à conversa mesmo após ela ser finalizada."
            checked={settings.keepAgentOnEnd}
            onChange={(v) => save("keepAgentOnEnd", v)}
            disabled={busy}
          />
          <ToggleRow
            icon={<IconUsers size={20} />}
            label="Manter departamento ao finalizar"
            description="O departamento permanece vinculado à conversa mesmo após ela ser finalizada."
            checked={settings.keepDepartmentOnEnd}
            onChange={(v) => save("keepDepartmentOnEnd", v)}
            disabled={busy}
          />
        </div>
      </GlassCard>

      {/* ── Transcrição de áudio ──────────────────────────────────────────── */}
      <GlassCard variant="panel" className="min-w-0 p-3 sm:p-4.5">
        <SectionLabel>Transcrição de áudio</SectionLabel>
        <div className="flex flex-col gap-2.5">
          <SelectRow
            icon={<IconMicrophone size={20} />}
            label="Transcrição automática"
            description="Define quando as mensagens de áudio serão transcritas automaticamente."
            value={settings.audioTranscription}
            options={[
              { value: "none", label: "Desativado" },
              { value: "all", label: "Sempre" },
              { value: "on_demand", label: "Sob demanda" },
            ]}
            onChange={(v) => save("audioTranscription", v)}
            disabled={busy}
          />
          <SelectRow
            icon={<IconMicrophone size={20} />}
            label="Idioma da transcrição"
            description="Idioma utilizado pelo motor de transcrição de áudio."
            value={settings.transcriptionLanguage}
            options={[
              { value: "pt-BR", label: "Português (BR)" },
              { value: "en-US", label: "English (US)" },
              { value: "es-ES", label: "Español (ES)" },
            ]}
            onChange={(v) => save("transcriptionLanguage", v)}
            disabled={settings.audioTranscription === "none" || busy}
          />
        </div>
      </GlassCard>

      {/* ── Sinalização nos cards ────────────────────────────────────────── */}
      <GlassCard variant="panel" className="min-w-0 p-3 sm:p-4.5">
        <SectionLabel>Sinalização nos cards</SectionLabel>
        <div className="flex flex-col gap-2.5">
          <ToggleRow
            icon={<IconMail size={20} />}
            label="Sinalizar mensagens recebidas"
            description="Mostra a barra lilás «aguardando resposta» nos cards do funil e da inbox quando a última mensagem veio do cliente."
            checked={settings.showInboundSignal}
            onChange={(v) => save("showInboundSignal", v)}
            disabled={busy}
          />
          <ToggleRow
            icon={<IconRobot size={20} />}
            label="Contar resposta de agente/automação"
            description="Quando ligado, mensagens enviadas por automação ou IA atualizam a última direção da conversa e contam como respondidas nos filtros da inbox (Aguardando/Respondidas) e do funil — como se fossem de um atendente humano."
            checked={settings.countAgentReplyAsAnswered}
            onChange={(v) => save("countAgentReplyAsAnswered", v)}
            disabled={busy}
          />
        </div>
      </GlassCard>

      {/* ── Atalho para Permissões ────────────────────────────────────────── */}
      <Link
        href="/settings/permissions?tab=roles"
        className="group flex min-w-0 flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] p-3.5 shadow-[var(--glass-shadow)] backdrop-blur-md transition-all hover:-translate-y-px hover:border-[var(--brand-primary)] hover:shadow-[var(--shadow-brand)] sm:flex-row sm:items-center sm:gap-3.5 sm:p-4.5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="flex size-[42px] shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] text-[var(--brand-primary)]">
            <IconShieldCheck size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[14px] font-bold text-pretty text-[var(--text-primary)]">
              Permissões de mensageria
            </h3>
            <p className="mt-0.5 max-w-[640px] break-words font-body text-[12.5px] leading-snug text-[var(--text-muted)]">
              As permissões de conversas, canais, templates e campanhas foram unificadas com as
              demais. Gerencie tudo em{" "}
              <strong className="text-[var(--text-secondary)]">Configurações › Permissões</strong>.
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center justify-center gap-1.5 self-start rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 py-2 font-display text-[12.5px] font-bold text-[var(--brand-primary)] transition-colors group-hover:bg-[var(--brand-primary)] group-hover:text-white sm:self-auto">
          Gerenciar permissões
          <IconArrowRight size={14} />
        </span>
      </Link>
    </div>
  );
}
