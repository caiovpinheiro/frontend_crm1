"use client";

/**
 * Partes do widget próprias dos modelos (compacto, com apoio e início guiado):
 * faixa de contexto, tela inicial, tópicos, pergunta local e encerramento.
 * Presentacional: o `WebchatPanel` guarda o estado e a conversa continua nele.
 * Todo texto vai como texto React.
 */
import type { ReactNode, Ref } from "react";

import {
  WEBCHAT_DEFAULT_LINK_LABEL,
  WEBCHAT_DEFAULT_WRITE_LABEL,
  type WebchatAction,
  type WebchatAppearance,
  type WebchatAppearanceModel,
  type WebchatFollowUp,
  type WebchatOption,
  type WebchatTopic,
  type WebchatTopicIcon,
} from "./appearance";
import styles from "./webchat.module.css";

const Icon = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const TOPIC_ICON_PATHS: Record<WebchatTopicIcon, ReactNode> = {
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.7M12 17.5h.01" />
    </>
  ),
  book: (
    <>
      <path d="M12 7a4 4 0 0 0-4-3H3v15h6a3 3 0 0 1 3 2 3 3 0 0 1 3-2h6V4h-5a4 4 0 0 0-4 3z" />
      <path d="M12 7v14" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  phone: (
    <path d="M21 16.5v3a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3 19 19 0 0 1-5.8-5.8 19 19 0 0 1-3-8.3A2 2 0 0 1 3.7 2.2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L7.6 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.4 1.7z" />
  ),
};

export const TopicIcon = ({ icon, size }: { icon: WebchatTopicIcon; size?: number }) => (
  <Icon size={size}>{TOPIC_ICON_PATHS[icon]}</Icon>
);

const ChevronIcon = () => (
  <Icon size={18}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);
const ArrowIcon = () => (
  <Icon size={16}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
const PencilIcon = () => (
  <Icon size={18}>
    <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </Icon>
);
const CheckIcon = () => (
  <Icon size={16}>
    <path d="m5 12 5 5 9-10" />
  </Icon>
);
const PlayIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.7L9.5 4.6A1 1 0 0 0 8 5.5z" />
  </svg>
);

export const MinimizeIcon = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
);
export const ExpandIcon = () => (
  <Icon>
    <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
  </Icon>
);
export const ShrinkIcon = () => (
  <Icon>
    <path d="M20 10h-6V4M14 10l7-7M4 14h6v6M10 14l-7 7" />
  </Icon>
);

const NEW_TAB_HINT = <span className={styles.srOnly}> (abre em nova aba)</span>;

/** Faixa no topo da conversa: valores que o site mandou, nunca texto fixo. */
export function ContextBanner({
  title,
  subtitle,
}: {
  title: string | null;
  subtitle: string | null;
}) {
  return (
    <div className={styles.contextBanner}>
      <span className={styles.contextIcon}>
        <TopicIcon icon="book" />
      </span>
      <div className={styles.contextText}>
        {title ? <p className={styles.contextTitle}>{title}</p> : null}
        {subtitle ? <p className={styles.contextSubtitle}>{subtitle}</p> : null}
      </div>
    </div>
  );
}

type ChooseHandler<T> = (item: T) => void;

type Choice = { id: string; label: string; action: WebchatAction };

/** Link de tutorial: botão-link em contorno (compacto) ou cartão com play. */
function LinkChoice({
  item,
  model,
  onChoose,
}: {
  item: Choice;
  model: WebchatAppearanceModel;
  onChoose: () => void;
}) {
  if (item.action.type !== "open_url") return null;
  const { url, label } = item.action;
  if (model === "compact") {
    return (
      <a
        className={styles.outlineLink}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onChoose}
      >
        <PlayIcon />
        {item.label}
        {NEW_TAB_HINT}
      </a>
    );
  }
  return (
    <div className={styles.tutorialCard}>
      <span className={styles.tutorialPlay}>
        <PlayIcon size={18} />
      </span>
      <div className={styles.tutorialText}>
        <p className={styles.tutorialTitle}>{item.label}</p>
        <a
          className={styles.tutorialLink}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onChoose}
        >
          {label ?? WEBCHAT_DEFAULT_LINK_LABEL}
          <span className={styles.srOnly}>: {item.label}</span>
          <ArrowIcon />
          {NEW_TAB_HINT}
        </a>
      </div>
    </div>
  );
}

/** Botões em pílula e links de tutorial de uma lista de escolhas. */
function Choices<T extends Choice>({
  items,
  model,
  onChoose,
}: {
  items: T[];
  model: WebchatAppearanceModel;
  onChoose: ChooseHandler<T>;
}) {
  const buttons = items.filter((i) => i.action.type !== "open_url");
  const links = items.filter((i) => i.action.type === "open_url");
  return (
    <>
      {buttons.length ? (
        <div className={styles.pills}>
          {buttons.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.pill}
              onClick={() => onChoose(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {links.map((item) => (
        <LinkChoice key={item.id} item={item} model={model} onChoose={() => onChoose(item)} />
      ))}
    </>
  );
}

/**
 * Tópicos dentro da conversa (compacto e com apoio). Com a conversa andando,
 * ficam só os links: uma escolha que envia texto já foi superada.
 */
export function ConversationTopics({
  appearance,
  engaged,
  onChoose,
}: {
  appearance: WebchatAppearance;
  engaged: boolean;
  onChoose: ChooseHandler<WebchatTopic>;
}) {
  const { start, model } = appearance;
  const items = engaged
    ? start.topics.filter((t) => t.action.type === "open_url")
    : start.topics;
  const showQuestion = !engaged && model === "assisted" && Boolean(start.title);
  if (!items.length && !showQuestion) return null;
  return (
    <div className={styles.flow}>
      {showQuestion ? (
        <div className={`${styles.row} ${styles.rowOut}`}>
          <div className={styles.bubble}>{start.title}</div>
          {start.subtitle ? <p className={styles.flowHint}>{start.subtitle}</p> : null}
        </div>
      ) : null}
      <Choices items={items} model={model} onChoose={onChoose} />
    </div>
  );
}

/** Pergunta do tópico escolhido. Respondida, ficam só os links. */
export function FollowUpBlock({
  followUp,
  answered,
  model,
  regionRef,
  onChoose,
}: {
  followUp: WebchatFollowUp;
  answered: boolean;
  model: WebchatAppearanceModel;
  regionRef?: Ref<HTMLDivElement>;
  onChoose: ChooseHandler<WebchatOption>;
}) {
  const items = answered
    ? followUp.options.filter((o) => o.action.type === "open_url")
    : followUp.options;
  return (
    <div ref={regionRef} className={styles.flow} tabIndex={-1}>
      <div className={`${styles.row} ${styles.rowOut}`}>
        <div className={styles.bubble}>{followUp.question}</div>
        {followUp.hint ? <p className={styles.flowHint}>{followUp.hint}</p> : null}
      </div>
      <Choices items={items} model={model} onChoose={onChoose} />
    </div>
  );
}

/** "Consegui resolver" e afins: só mandam o rótulo como mensagem. */
export function ClosingButtons({
  resolved,
  needHelp,
  onSend,
}: {
  resolved: string | null;
  needHelp: string | null;
  onSend: (text: string) => void;
}) {
  return (
    <div className={styles.pills}>
      {resolved ? (
        <button type="button" className={styles.pill} onClick={() => onSend(resolved)}>
          <CheckIcon />
          {resolved}
        </button>
      ) : null}
      {needHelp ? (
        <button type="button" className={styles.pill} onClick={() => onSend(needHelp)}>
          {needHelp}
        </button>
      ) : null}
    </div>
  );
}

/** Tela inicial do modelo guiado. O campo de mensagem segue embaixo dela. */
export function GuidedStart({
  appearance,
  greeting,
  context,
  onChoose,
  onWrite,
}: {
  appearance: WebchatAppearance;
  greeting: string;
  context: { title: string | null; subtitle: string | null } | null;
  onChoose: ChooseHandler<WebchatTopic>;
  onWrite: () => void;
}) {
  const { start } = appearance;
  const place = context ? (context.title ?? context.subtitle) : null;
  return (
    <div className={styles.start}>
      <h2 className={styles.startTitle}>{start.title ?? greeting}</h2>
      {start.subtitle ? <p className={styles.startSubtitle}>{start.subtitle}</p> : null}
      {start.topics.length ? (
        <ul className={styles.topicList}>
          {start.topics.map((topic) => (
            <li key={topic.id}>
              {topic.action.type === "open_url" ? (
                <a
                  className={styles.topicRow}
                  href={topic.action.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onChoose(topic)}
                >
                  <span className={styles.topicIcon} data-icon={topic.icon}>
                    <TopicIcon icon={topic.icon} />
                  </span>
                  <span className={styles.topicLabel}>
                    {topic.label}
                    {NEW_TAB_HINT}
                  </span>
                  <ChevronIcon />
                </a>
              ) : (
                <button type="button" className={styles.topicRow} onClick={() => onChoose(topic)}>
                  <span className={styles.topicIcon} data-icon={topic.icon}>
                    <TopicIcon icon={topic.icon} />
                  </span>
                  <span className={styles.topicLabel}>{topic.label}</span>
                  <ChevronIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {place ? (
        <div className={styles.contextBanner}>
          <span className={styles.contextIcon}>
            <TopicIcon icon="book" />
          </span>
          <p className={styles.contextPlace}>
            Você está em: <strong>{place}</strong>
          </p>
        </div>
      ) : null}
      <button type="button" className={styles.writeButton} onClick={onWrite}>
        <PencilIcon />
        {start.writeLabel ?? WEBCHAT_DEFAULT_WRITE_LABEL}
      </button>
    </div>
  );
}
