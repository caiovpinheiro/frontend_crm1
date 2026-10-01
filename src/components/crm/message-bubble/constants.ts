/** Emojis exibidos na barra rápida de reações — padrão WhatsApp. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const
/** Toque longo na bolha abre o menu de ações (padrão WhatsApp mobile). */
export const MENU_LONG_PRESS_MS = 450

/**
 * Paleta da bolha de AUTOMAÇÃO: cinza escuro com texto claro. Hardcoded —
 * invariante ao data-chat-theme e ao modo dark/light, garantindo contraste
 * do texto, dos badges e dos ticks (inclusive o azul de "lida") em qualquer
 * tema. `ACCENT` (violeta) segue como cor do avatar do robô.
 */
export const AUTOMATION_BG = "#374151"
export const AUTOMATION_TEXT = "#f3f4f6"
export const AUTOMATION_ACCENT = "#6c5ce7"
/** Accent do avatar de campanha (teal) — distinto do violeta de automação. */
export const CAMPAIGN_ACCENT = "#0d9488"
