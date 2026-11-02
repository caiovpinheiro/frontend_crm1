"use client";

/**
 * Wizard de modelos do widget: um rascunho local, cinco passos e a prévia com
 * o próprio `WebchatPanel`. Fechar sem salvar descarta o rascunho; salvar
 * troca só `config.v2.appearance` e preserva o resto.
 */
import {
  IconArrowDown as ArrowDown,
  IconArrowUp as ArrowUp,
  IconLayoutSidebarRight as ModelIcon,
  IconLoader2 as Loader2,
  IconPlus as Plus,
  IconTrash as Trash,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState, type ReactNode } from "react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { SwitchGlass } from "@/components/crm/switch-glass";
import {
  FormDialog,
  FormDialogIcon,
  formDialogCancelClass,
  formDialogPrimaryClass,
} from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  WEBCHAT_APPEARANCE_LIMITS as L,
  WEBCHAT_DEFAULT_LINK_LABEL,
  WEBCHAT_DEFAULT_WRITE_LABEL,
  WEBCHAT_TOPIC_ICONS,
  effectiveAppearance,
  isPlainAppearance,
  normalizeAppearance,
  type WebchatAction,
  type WebchatAppearance,
  type WebchatAppearanceModel,
  type WebchatFollowUp,
  type WebchatOption,
  type WebchatTopic,
  type WebchatTopicIcon,
} from "@/features/webchat-widget/appearance";
import type { WebchatPublicConfig } from "@/features/webchat-widget/types";
import { TopicIcon } from "@/features/webchat-widget/webchat-flow";
import { WebchatPreview } from "@/features/webchat-widget/webchat-preview";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

import type { ApiChannel } from "../types";
import {
  WIZARD_STEPS,
  appearanceProblems,
  appearanceSaveBody,
  emptyAppearance,
  moved,
  newOption,
  newTopic,
  previewAppearance,
  withModel,
} from "./appearance-config";

export const MODEL_INFO: Record<
  WebchatAppearanceModel,
  { name: string; summary: string; recommended?: boolean }
> = {
  compact: { name: "Compacto", summary: "Ajuda sem sair da página." },
  assisted: {
    name: "Com apoio",
    summary: "Mais espaço e orientação por etapas.",
    recommended: true,
  },
  guided: { name: "Início guiado", summary: "O visitante encontra o assunto com facilidade." },
};

const MODELS: WebchatAppearanceModel[] = ["compact", "assisted", "guided"];

const ICON_NAMES: Record<WebchatTopicIcon, string> = {
  lock: "Cadeado",
  card: "Cartão",
  file: "Documento",
  chat: "Conversa",
  help: "Ajuda",
  book: "Livro",
  calendar: "Calendário",
  phone: "Telefone",
};

const ACTION_NAMES: Record<WebchatAction["type"], string> = {
  send_text: "Enviar uma mensagem do visitante",
  open_url: "Abrir um link em nova aba",
  write: "Levar ao campo de mensagem",
};

const CARD_CLASS = "space-y-3 rounded-xl border border-border bg-card p-4";
const HINT_CLASS = "text-xs text-muted-foreground";

function TextField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  hint,
  inputMode,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
  inputMode?: "url";
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value ?? ""}
        maxLength={maxLength}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? (
        <p id={hintId} className={HINT_CLASS}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? <p className={HINT_CLASS}>{hint}</p> : null}
      </div>
      <SwitchGlass checked={checked} aria-label={label} onChange={onChange} />
    </div>
  );
}

/** Subir, descer e remover. Sem `disabled`: o foco não some ao chegar na ponta. */
function ItemControls({
  name,
  index,
  total,
  onMove,
  onRemove,
}: {
  name: string;
  index: number;
  total: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const button =
    "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        className={button}
        aria-label={`Mover ${name} para cima`}
        aria-disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="size-4" />
      </button>
      <button
        type="button"
        className={button}
        aria-label={`Mover ${name} para baixo`}
        aria-disabled={index === total - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown className="size-4" />
      </button>
      <button type="button" className={button} aria-label={`Remover ${name}`} onClick={onRemove}>
        <Trash className="size-4" />
      </button>
    </div>
  );
}

function ActionFields({
  action,
  onChange,
}: {
  action: WebchatAction;
  onChange: (action: WebchatAction) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs">
          Ao clicar
        </Label>
        <SelectNative
          id={id}
          value={action.type}
          onChange={(e) => {
            const type = e.target.value as WebchatAction["type"];
            if (type === "send_text") onChange({ type, text: "" });
            else if (type === "open_url") onChange({ type, url: "" });
            else onChange({ type: "write" });
          }}
        >
          {(Object.keys(ACTION_NAMES) as WebchatAction["type"][]).map((type) => (
            <option key={type} value={type}>
              {ACTION_NAMES[type]}
            </option>
          ))}
        </SelectNative>
      </div>
      {action.type === "send_text" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-text`} className="text-xs">
            Mensagem enviada
          </Label>
          <Textarea
            id={`${id}-text`}
            rows={2}
            maxLength={L.text}
            value={action.text}
            placeholder="Vazio envia o próprio título do botão."
            onChange={(e) => onChange({ ...action, text: e.target.value })}
          />
        </div>
      ) : null}
      {action.type === "open_url" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Link (https)"
            value={action.url}
            maxLength={L.url}
            inputMode="url"
            placeholder="https://"
            onChange={(url) => onChange({ ...action, url })}
          />
          <TextField
            label="Texto do link"
            value={action.label}
            maxLength={L.label}
            placeholder={WEBCHAT_DEFAULT_LINK_LABEL}
            hint="Aparece no cartão de tutorial."
            onChange={(label) => onChange({ ...action, label })}
          />
        </div>
      ) : null}
    </div>
  );
}

function IconPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: WebchatTopicIcon;
  onChange: (icon: WebchatTopicIcon) => void;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className="text-xs font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {WEBCHAT_TOPIC_ICONS.map((icon) => (
          <label
            key={icon}
            title={ICON_NAMES[icon]}
            className={cn(
              "flex size-9 cursor-pointer items-center justify-center rounded-xl border text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50",
              value === icon ? "border-primary bg-primary/10 text-primary" : "border-border bg-card",
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === icon}
              aria-label={ICON_NAMES[icon]}
              onChange={() => onChange(icon)}
            />
            <TopicIcon icon={icon} size={18} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ModelStep({
  draft,
  onChange,
}: {
  draft: WebchatAppearance;
  onChange: (a: WebchatAppearance) => void;
}) {
  const name = useId();
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Modelo do widget" className="grid gap-3 sm:grid-cols-3">
        {MODELS.map((model) => {
          const info = MODEL_INFO[model];
          const selected = draft.model === model;
          return (
            <label
              key={model}
              className={cn(
                "flex cursor-pointer flex-col gap-1.5 rounded-xl border bg-card p-4 focus-within:ring-2 focus-within:ring-ring/50",
                selected ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={selected}
                onChange={() => onChange(withModel(draft, model))}
              />
              <span className="text-sm font-semibold text-foreground">{info.name}</span>
              <span className={HINT_CLASS}>{info.summary}</span>
              {info.recommended ? (
                <span className="mt-1 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  Recomendado
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      <SwitchRow
        label="Permitir expandir o painel"
        hint="Mostra um botão no cabeçalho, fora do celular."
        checked={draft.allowExpand}
        onChange={(allowExpand) => onChange({ ...draft, allowExpand })}
      />
    </div>
  );
}

function TopicsStep({
  draft,
  onChange,
}: {
  draft: WebchatAppearance;
  onChange: (a: WebchatAppearance) => void;
}) {
  const addRef = useRef<HTMLButtonElement>(null);
  const { start, model } = draft;
  const setStart = (patch: Partial<WebchatAppearance["start"]>) =>
    onChange({ ...draft, start: { ...start, ...patch } });
  const setTopics = (topics: WebchatTopic[]) => setStart({ topics });
  const patchTopic = (id: string, patch: Partial<WebchatTopic>) =>
    setTopics(start.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  return (
    <div className="space-y-4">
      {model !== "compact" ? (
        <div className={CARD_CLASS}>
          <TextField
            label={model === "guided" ? "Título da tela inicial" : "Pergunta inicial"}
            value={start.title}
            maxLength={L.title}
            hint={model === "guided" ? "Vazio usa a saudação do canal." : undefined}
            onChange={(title) => setStart({ title })}
          />
          <TextField
            label={model === "guided" ? "Subtítulo" : "Dica abaixo da pergunta"}
            value={start.subtitle}
            maxLength={L.subtitle}
            onChange={(subtitle) => setStart({ subtitle })}
          />
          {model === "guided" ? (
            <TextField
              label="Texto do botão de escrever"
              value={start.writeLabel}
              maxLength={L.writeLabel}
              placeholder={WEBCHAT_DEFAULT_WRITE_LABEL}
              onChange={(writeLabel) => setStart({ writeLabel })}
            />
          ) : null}
        </div>
      ) : null}

      {start.topics.length ? (
        <ul className="space-y-3">
          {start.topics.map((topic, index) => {
            const name = topic.label.trim() || `tópico ${index + 1}`;
            return (
              <li key={topic.id} className={CARD_CLASS}>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                    Tópico {index + 1}
                  </p>
                  <ItemControls
                    name={name}
                    index={index}
                    total={start.topics.length}
                    onMove={(delta) => setTopics(moved(start.topics, index, delta))}
                    onRemove={() => {
                      setTopics(start.topics.filter((t) => t.id !== topic.id));
                      addRef.current?.focus();
                    }}
                  />
                </div>
                <TextField
                  label="Título"
                  value={topic.label}
                  maxLength={L.label}
                  onChange={(label) => patchTopic(topic.id, { label })}
                />
                {model === "guided" ? (
                  <IconPicker
                    label="Ícone"
                    value={topic.icon}
                    onChange={(icon) => patchTopic(topic.id, { icon })}
                  />
                ) : null}
                <ActionFields
                  action={topic.action}
                  onChange={(action) => patchTopic(topic.id, { action })}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={cn(CARD_CLASS, HINT_CLASS)}>
          Nenhum tópico ainda. O visitante pode escrever direto no campo de mensagem.
        </p>
      )}

      <ButtonGlass
        ref={addRef}
        type="button"
        variant="glass"
        size="sm"
        className="px-3 py-1.5"
        disabled={start.topics.length >= L.topics}
        onClick={() => setTopics([...start.topics, newTopic()])}
      >
        <Plus className="size-4" />
        Adicionar tópico
      </ButtonGlass>
      <p className={HINT_CLASS}>Até {L.topics} tópicos.</p>
    </div>
  );
}

function FollowUpEditor({
  followUp,
  onChange,
}: {
  followUp: WebchatFollowUp;
  onChange: (followUp: WebchatFollowUp) => void;
}) {
  const addRef = useRef<HTMLButtonElement>(null);
  const setOptions = (options: WebchatOption[]) => onChange({ ...followUp, options });
  return (
    <div className="space-y-3">
      <TextField
        label="Pergunta"
        value={followUp.question}
        maxLength={L.question}
        onChange={(question) => onChange({ ...followUp, question })}
      />
      <TextField
        label="Dica (opcional)"
        value={followUp.hint}
        maxLength={L.hint}
        onChange={(hint) => onChange({ ...followUp, hint })}
      />
      <ul className="space-y-3">
        {followUp.options.map((option, index) => {
          const name = option.label.trim() || `opção ${index + 1}`;
          return (
            <li key={option.id} className="space-y-3 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">Opção {index + 1}</p>
                <ItemControls
                  name={name}
                  index={index}
                  total={followUp.options.length}
                  onMove={(delta) => setOptions(moved(followUp.options, index, delta))}
                  onRemove={() => {
                    setOptions(followUp.options.filter((o) => o.id !== option.id));
                    addRef.current?.focus();
                  }}
                />
              </div>
              <TextField
                label="Título"
                value={option.label}
                maxLength={L.label}
                onChange={(label) =>
                  setOptions(
                    followUp.options.map((o) => (o.id === option.id ? { ...o, label } : o)),
                  )
                }
              />
              <ActionFields
                action={option.action}
                onChange={(action) =>
                  setOptions(
                    followUp.options.map((o) => (o.id === option.id ? { ...o, action } : o)),
                  )
                }
              />
            </li>
          );
        })}
      </ul>
      <ButtonGlass
        ref={addRef}
        type="button"
        variant="glass"
        size="sm"
        className="px-3 py-1.5"
        disabled={followUp.options.length >= L.options}
        onClick={() => setOptions([...followUp.options, newOption()])}
      >
        <Plus className="size-4" />
        Adicionar opção
      </ButtonGlass>
    </div>
  );
}

function StepsStep({
  draft,
  onChange,
}: {
  draft: WebchatAppearance;
  onChange: (a: WebchatAppearance) => void;
}) {
  const { topics } = draft.start;
  if (!topics.length) {
    return (
      <p className={cn(CARD_CLASS, HINT_CLASS)}>
        Adicione um tópico no passo anterior para criar perguntas e links de tutorial.
      </p>
    );
  }
  const setFollowUp = (id: string, followUp: WebchatFollowUp | null) =>
    onChange({
      ...draft,
      start: {
        ...draft.start,
        topics: topics.map((t) => {
          if (t.id !== id) return t;
          const { followUp: _removed, ...rest } = t;
          return followUp ? { ...rest, followUp } : rest;
        }),
      },
    });
  return (
    <div className="space-y-3">
      <p className={HINT_CLASS}>
        A pergunta aparece só no widget, depois que o visitante escolhe o tópico. Para um tutorial,
        crie uma opção que abre um link.
      </p>
      {topics.map((topic, index) => (
        <div key={topic.id} className={CARD_CLASS}>
          <SwitchRow
            label={topic.label.trim() || `Tópico ${index + 1}`}
            hint="Fazer uma pergunta depois deste tópico"
            checked={Boolean(topic.followUp)}
            onChange={(on) =>
              setFollowUp(topic.id, on ? { question: "", options: [newOption()] } : null)
            }
          />
          {topic.followUp ? (
            <FollowUpEditor
              followUp={topic.followUp}
              onChange={(followUp) => setFollowUp(topic.id, followUp)}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ContextStep({
  draft,
  contextKeys,
  onChange,
}: {
  draft: WebchatAppearance;
  contextKeys: string[];
  onChange: (a: WebchatAppearance) => void;
}) {
  const { contextBanner: banner, closing } = draft;
  const setBanner = (patch: Partial<WebchatAppearance["contextBanner"]>) =>
    onChange({ ...draft, contextBanner: { ...banner, ...patch } });
  const setClosing = (patch: Partial<WebchatAppearance["closing"]>) =>
    onChange({ ...draft, closing: { ...closing, ...patch } });
  const listId = useId();
  return (
    <div className="space-y-4">
      <div className={CARD_CLASS}>
        <SwitchRow
          label="Mostrar a faixa de contexto"
          hint="Usa o que o site manda por setContext. Sem valor, a faixa não aparece."
          checked={banner.enabled}
          onChange={(enabled) => setBanner({ enabled })}
        />
        {banner.enabled ? (
          <>
            <datalist id={listId}>
              {contextKeys.map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
            <div className="grid gap-3 sm:grid-cols-2">
              <ContextKeyField
                label="Chave do título"
                listId={listId}
                value={banner.titleKey}
                onChange={(titleKey) => setBanner({ titleKey })}
              />
              <ContextKeyField
                label="Chave da linha menor"
                listId={listId}
                value={banner.subtitleKey}
                onChange={(subtitleKey) => setBanner({ subtitleKey })}
              />
            </div>
            <p className={HINT_CLASS}>Na prévia, a faixa mostra um valor de exemplo.</p>
          </>
        ) : null}
      </div>
      <div className={CARD_CLASS}>
        <SwitchRow
          label="Mostrar botões de encerramento"
          hint="Só enviam o texto do botão como mensagem. Não encerram o ticket."
          checked={closing.enabled}
          onChange={(enabled) => setClosing({ enabled })}
        />
        {closing.enabled ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Botão de resolvido"
              value={closing.resolvedLabel}
              maxLength={L.label}
              onChange={(resolvedLabel) => setClosing({ resolvedLabel })}
            />
            <TextField
              label="Botão de ajuda"
              value={closing.needHelpLabel}
              maxLength={L.label}
              onChange={(needHelpLabel) => setClosing({ needHelpLabel })}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ContextKeyField({
  label,
  listId,
  value,
  onChange,
}: {
  label: string;
  listId: string;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        list={listId}
        value={value ?? ""}
        maxLength={64}
        className="font-mono text-xs"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ReviewStep({
  draft,
  onGoTo,
}: {
  draft: WebchatAppearance;
  onGoTo: (step: number) => void;
}) {
  const problems = appearanceProblems(draft);
  const { start, contextBanner, closing } = draft;
  const followUps = start.topics.filter((t) => t.followUp).length;
  const rows: [string, ReactNode][] = [
    ["Modelo", MODEL_INFO[draft.model].name],
    ["Expandir o painel", draft.allowExpand ? "Permitido" : "Não"],
    ["Tópicos", start.topics.length],
    ["Tópicos com pergunta", followUps],
    ["Faixa de contexto", contextBanner.enabled ? "Ligada" : "Desligada"],
    ["Botões de encerramento", closing.enabled ? "Ligados" : "Desligados"],
  ];
  return (
    <div className="space-y-4">
      <dl className={CARD_CLASS}>
        {rows.map(([term, value]) => (
          <div key={term} className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {isPlainAppearance(draft) ? (
        <p className={cn(CARD_CLASS, HINT_CLASS)}>
          Sem tópicos, faixa ou encerramento, o modelo compacto mantém o visual atual do widget.
        </p>
      ) : null}
      {problems.length ? (
        <div className={CARD_CLASS}>
          <p className="text-sm font-semibold text-foreground">Vale conferir antes de salvar</p>
          <ul className="space-y-1.5">
            {problems.map((problem) => (
              <li
                key={`${problem.step}-${problem.message}`}
                className="flex items-start justify-between gap-3 text-sm text-muted-foreground"
              >
                <span className="min-w-0">{problem.message}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-primary hover:underline"
                  aria-label={`Ir para ${WIZARD_STEPS[problem.step]}: ${problem.message}`}
                  onClick={() => onGoTo(problem.step)}
                >
                  Ajustar
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export type WebchatAppearanceWizardProps = {
  channel: ApiChannel;
  /** `appearance` gravado; `undefined` = canal ainda sem modelo. */
  initial?: WebchatAppearance;
  /** Cor, avatar e saudação do painel: a prévia mostra o que o visitante veria. */
  previewBase: WebchatPublicConfig;
  contextKeys: string[];
  onClose: () => void;
  onSaved: (appearance: WebchatAppearance) => void;
};

export function WebchatAppearanceWizard({
  channel,
  initial,
  previewBase,
  contextKeys,
  onClose,
  onSaved,
}: WebchatAppearanceWizardProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<WebchatAppearance>(() => initial ?? emptyAppearance());
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const last = WIZARD_STEPS.length - 1;

  const goTo = (next: number) => {
    setStep(next);
    // O botão clicado pode sair da tela: o foco vai para o título do passo.
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = appearanceSaveBody(channel, draft);
      const res = await fetch(apiUrl(`/api/channels/${channel.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Erro ao salvar.");
      return body.config.v2.appearance;
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
      void queryClient.invalidateQueries({ queryKey: ["channel", channel.id] });
      onSaved(normalizeAppearance(saved) ?? emptyAppearance());
    },
  });

  const previewConfig: WebchatPublicConfig = {
    ...previewBase,
    appearance: effectiveAppearance(previewAppearance(draft)),
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="2xl"
      mobileFullScreen
      busy={save.isPending}
      title="Modelo do widget"
      description="Escolha como o widget recebe o visitante e configure os botões."
      icon={
        <FormDialogIcon>
          <ModelIcon className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            disabled={save.isPending}
            onClick={onClose}
          >
            Cancelar
          </ButtonGlass>
          {step > 0 ? (
            <ButtonGlass
              type="button"
              variant="glass"
              className={formDialogCancelClass}
              disabled={save.isPending}
              onClick={() => goTo(step - 1)}
            >
              Voltar
            </ButtonGlass>
          ) : null}
          {step < last ? (
            <ButtonGlass
              type="button"
              variant="primary"
              className={formDialogPrimaryClass}
              onClick={() => goTo(step + 1)}
            >
              Próximo
            </ButtonGlass>
          ) : (
            <ButtonGlass
              type="button"
              variant="primary"
              className={formDialogPrimaryClass}
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar
            </ButtonGlass>
          )}
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <nav aria-label="Passos">
            <ol className="flex flex-wrap gap-1.5">
              {WIZARD_STEPS.map((label, index) => (
                <li key={label}>
                  <button
                    type="button"
                    aria-current={index === step ? "step" : undefined}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      index === step
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => goTo(index)}
                  >
                    {index + 1}. {label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-semibold text-foreground outline-none"
          >
            {WIZARD_STEPS[step]}
          </h3>
          {step === 0 ? <ModelStep draft={draft} onChange={setDraft} /> : null}
          {step === 1 ? <TopicsStep draft={draft} onChange={setDraft} /> : null}
          {step === 2 ? <StepsStep draft={draft} onChange={setDraft} /> : null}
          {step === 3 ? (
            <ContextStep draft={draft} contextKeys={contextKeys} onChange={setDraft} />
          ) : null}
          {step === 4 ? <ReviewStep draft={draft} onGoTo={goTo} /> : null}
          {save.isError ? (
            <p className="text-sm text-[var(--color-danger-text)]" role="alert">
              {save.error instanceof Error ? save.error.message : "Erro ao salvar."}
            </p>
          ) : null}
        </div>
        <aside aria-label="Prévia do widget" className="min-w-0 lg:sticky lg:top-0 lg:self-start">
          <div className="h-[640px] overflow-hidden rounded-xl border border-border">
            <WebchatPreview inline config={previewConfig} />
          </div>
        </aside>
      </div>
    </FormDialog>
  );
}
