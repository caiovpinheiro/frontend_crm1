# Design System — Inventário Bruto (Fase 1)

> Material factual extraído do código em **2026-05-22**.
> Conta, lista, mapeia. **Não opina** sobre arquitetura, organização ou trade-offs (isso é Fase 2 / Opus).
>
> Fonte: `frontend_crm1` na branch `marcelinho` (commit `772b876`+).

---

## 1. Stack visual atual

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js (App Router) | 15.5 |
| React | React | 19 |
| Styling | **Tailwind CSS v4** (zero `tailwind.config.*`) | 4.2.2 |
| Tokens | `@theme` block em `globals.css` (v4 nativo) | — |
| Variantes | `class-variance-authority` (cva) | 0.7.1 |
| Merge classes | `clsx` + `tailwind-merge` | — |
| Animação | `framer-motion` | 12.38 |
| DnD (Kanban) | `@hello-pangea/dnd` (não @dnd-kit) | 18.0 |
| Flow editor | `reactflow` | 11.11 |
| Forms | `react-hook-form` + `zod` | 7.72 / 4.3 |
| Toast | `sonner` | 2.0 |
| Charts | `recharts` | 3.8 |
| Theme switching | `next-themes` (`attribute="class"`) | 0.4 |
| State | `zustand` | 5.0 |
| Data | `@tanstack/react-query` | 5.99 |
| **Radix usado** | Apenas `react-dialog` + `react-tooltip` | 1.1 / 1.2 |
| **shadcn cli** | Não há `components.json`. Componentes são **forks artesanais**. | — |
| Fonts | Plus Jakarta Sans (display) · DM Sans (body) · JetBrains Mono (mono) — via Google Fonts `@import` | — |

## 2. Tokens existentes (já no `globals.css` @theme)

### 2.1 Cores

```
Brand
  primary           #5b6ff5  (periwinkle/indigo)
  primary-dark      #3d52e8
  primary-soft      rgba(91,111,245,.15)
  lavender          #a78bfa  (IA / Copilot)
  pink              #f472b6
  cyan              #06b6d4

Surfaces (light)
  background        #dde8f5   ← cobertas por mesh gradient no <body>
  bg-subtle/muted/hover  rgba(255,255,255, .35/.45/.55)
  card              rgba(255,255,255, .40)
  popover           rgba(255,255,255, .75)
  dropdown-solid-bg #ffffff   ← override sólido p/ dropdowns sobre stacking-context

Surfaces (dark)
  background        #0b1220
  card              rgba(255,255,255, .05)
  popover           rgba(20,28,45, .85)
  dropdown-solid-bg #1a2238

Texto
  foreground   #1e2a3b   (light) / #e8edf5 (dark)
  ink-soft     #4a5568   / #9ba8b9
  ink-muted    #718096   / #6b7a8c
  ink-subtle   #a0aec0   / #3d4455

Status
  success      #10b981  + soft + foreground
  warning      #f59e0b  + soft + foreground
  destructive  #ef4444  + soft + foreground
  info         #5b6ff5

Canais
  channel-whatsapp   #25D366
  channel-instagram  #E1306C
  channel-email      #5b6ff5
  channel-meta       #0084FF

Charts (recharts)
  chart-1..5  (indigo / green / amber / lavender / red)

Status presença
  online   #10b981
  away     #f59e0b
  offline  #94a3b8

Chat (5 temas via [data-chat-theme=…])
  default | whatsapp | slate | petroleo | roxo | azul
```

### 2.2 Radius

```
sm   6px   (0.375rem)
md   10px  (0.625rem)
lg   16px  (1rem)
xl   22px  (1.375rem)  ← usado por Card
2xl  32px  (2rem)
```

### 2.3 Shadows

```
sm           0 1px 2px  rgba(100,130,180, .06)
card-sm      0 4px 16px rgba(100,130,180, .12)
card         0 8px 32px rgba(100,130,180, .18)
md, lg, xl   (idem com offsets maiores)

indigo-glow   0 6px 20px -4px rgba(91,111,245, .35)
lavender-glow 0 6px 20px -4px rgba(167,139,250, .30)
green-glow    0 6px 20px -6px rgba(16,185,129, .30)
```

### 2.4 Glass tokens (fora do `@theme`, em `:root`)

```
glass-bg            rgba(255,255,255, .25)
glass-bg-strong     rgba(255,255,255, .40)
glass-bg-subtle     rgba(255,255,255, .12)
glass-bg-overlay    rgba(255,255,255, .60)
glass-border        rgba(255,255,255, .55)
glass-border-subtle rgba(255,255,255, .30)
glass-shadow / -lg / -sm
glass-blur          blur(16px)
glass-blur-strong   blur(24px)
glass-blur-subtle   blur(8px)
bg-gradient (mesh)  linear-gradient(135deg, #dde8f5 → #b8cfec → #e8d5f0 → #dce8f5)
```

### 2.5 Animações nomeadas (keyframes em `globals.css`)

`slide-in`, `slide-in-right`, `slide-in-left`, `fade-in`, `scale-in`, `msg-in`, `pulse-dot`, `pulse-custom`, `pulse-soft`, `pulse-record`, `wave`, `typing-dot`, `kanban-highlight`, `kanban-enter`, `loading`, `shimmer`, `bounce-subtle`, `flow-dash`

### 2.6 Utilities customizadas

`.glass`, `.glass-strong`, `.glass-subtle`, `.glass-overlay`, `.text-gradient`, `.text-gradient-ai`, `.lumen-gradient`, `.lumen-ai-gradient`, `.lumen-subtle-gradient`, `.mesh-background`, `.lumen-transition`, `.scrollbar-thin`, `.scrollbar-workspace`, `.scrollbar-none`, `.kanban-board-hscroll`, `.kanban-scroll`, `.pb-safe / pt-safe / pl-safe / pr-safe / pb-safe-3 / pb-safe-4 / pt-safe-3 / pt-safe-4`, `.h-dvh`, `.min-h-dvh`, `.touch-target` (44×44), `.no-scrollbar`, `.font-display`, `.font-mono`, `.animate-pulse-soft`, `.edge-flow-dash`

### 2.7 Fonte secundária de tokens — DUPLICAÇÃO

`src/lib/design-tokens.ts` exporta `dt.*` (helpers Tailwind como strings):

```
dt.bg.{page,card,hover}
dt.text.{title,label,value,link,section,muted,time,preview}
dt.card.{base,shadow,row,rowSm,kanbanHover}
dt.pill.{base,sm,expired,neutral,stage}
dt.workspace.{leader,leaderLabel,leaderTitle,leaderValue,leaderBarTrack,leaderBarFill,leaderMeta}
dt.chat.{bubble,text,time,check,fontSize,dateSep,sessionExpiredCard,noteLabel}
dt.icons.{stage,owner,origin,forecast,tags,deal,...}  ← nomes Lucide hardcoded
```

E ainda existe `src/lib/dashboard-tokens.ts` separado (escopo: widgets).

## 3. Componentes `src/components/ui/` (26 primitivos)

| Componente | Implementação | Variantes existentes | Observação |
|---|---|---|---|
| `button.tsx` | cva, fork shadcn (Slot **custom**, não Radix) | `default, destructive, outline, secondary, ghost, link, ai, glass` × `default, sm, lg, icon` | 8 variantes (3 "glass-ish" sobrepostas: `secondary=glass=ghost`) |
| `badge.tsx` | cva | `default, secondary, outline, destructive, success, warning, indigo, ai, pink, lead, glass, muted` (12) | `default == indigo`, `warning == lead` ← duplicação |
| `card.tsx` | static | sem variants — hardcoded `rounded-[22px] bg-white/40 border-white/55 backdrop-blur-md` | Card + Header/Title/Description/Content/Footer |
| `input.tsx` | static | sem variants — `h-9 rounded-[10px] bg-white/55` | states: hover/focus/aria-invalid/disabled |
| `textarea.tsx` | static | — | — |
| `label.tsx` | static | — | — |
| `dialog.tsx` | Radix-based | — | usa `@radix-ui/react-dialog` |
| `alert-dialog.tsx` | importa `@radix-ui/react-dialog` (não alert-dialog) | — | inconsistência: nome sugere AlertDialog mas usa Dialog |
| `sheet.tsx` | static | — | provavelmente side drawer |
| `dropdown-menu.tsx` | **custom**, não Radix | — | DM próprio sem `@radix-ui/react-dropdown-menu` |
| `select.tsx` | **custom**, não Radix | — | Select próprio sem `@radix-ui/react-select` |
| `tabs.tsx` | static | — | — |
| `tooltip.tsx` | Radix-based | — | `@radix-ui/react-tooltip` |
| `switch.tsx` | static | — | — |
| `separator.tsx` | static | — | — |
| `scroll-area.tsx` | static (não Radix) | — | — |
| `skeleton.tsx` | static | — | — |
| `avatar.tsx` | static | — | sem Radix |
| `date-picker.tsx` | static (sem `react-day-picker` no package.json) | — | implementação interna |
| `table.tsx` | static | — | — |
| `page-header.tsx` | static | — | layout helper |
| `motion.tsx` | static | — | wrapper sobre framer-motion |
| `sortable-sidebar.tsx` | static | — | helper específico |
| `sidebar-card.tsx`, `sidebar-section.tsx`, `sidebar-field.tsx` | static | — | helpers de painel CRM |

### Componentes pedidos no prompt e ausentes:

- Toast (usa `sonner` direto, sem wrapper)
- Pagination (custom inline em várias páginas)
- Accordion
- Combobox / Command
- Drawer (`sheet.tsx` cobre parcialmente)
- Context Menu (custom inline em vários lugares)
- Popover (não há primitivo — composto com framer-motion + Portal)
- Empty State
- Loading State (só `skeleton`; sem `Spinner`, `Progress`)
- Radio Group, Checkbox (não há primitivos)
- Form (sem wrapper `<Form />` integrado com `react-hook-form`)

## 4. Componentes de domínio (`src/components/<feature>/`)

| Domínio | Arquivos | Notas |
|---|---|---|
| `pipeline/` | 30 arquivos | Maior área. Kanban, list view, sales-hub, deal-workspace (chat embutido), deal-detail (drawer), kanban-filters/* (8) |
| `inbox/` | ~25 (chat-window, conversation-list, transfer-control, swipe-row, presence-dashboard, audio-recorder, ai-draft-card, …) | — |
| `automations/` | 21 (workflow-canvas, 10+ nodes: trigger/wait/condition/delay/goto/finish/action/business-hours/interactive/variable/question, node-inline-config, copilot-panel, animated-edge, template-gallery, …) | React Flow |
| `dashboard/widgets/` | 14 widgets | grid layout |
| `channels/`, `contacts/`, `companies/`, `analytics/`, `ai-agents/`, `sales-hub/`, `onboarding/`, `profile/`, `pwa/`, `layout/` | — | — |
| `features/campaign-builder/` | wizard isolado | único uso de pasta `features/` |

## 5. Kanban — detalhe

| Arquivo | Função |
|---|---|
| `kanban-board.tsx` | container horizontal scroll, distribui colunas |
| `kanban-column.tsx` | coluna por stage; header + droppable + lista vertical |
| `kanban-card.tsx` | card do deal (draggable); densidade variável via `card-fields-config` |
| `kanban-types.ts` | types puros |
| `stage-header.tsx` | faixa colorida com nome/contagem da etapa |
| `bulk-actions-bar.tsx` | barra inferior quando cards selecionados |
| `card-fields-config.tsx` | popover "que campos mostrar no card" (via Portal) |
| `kanban-filters/` | 8 arquivos: filter-dropdown, filter-panel (+ body), filter-chips, saved-filters-menu, use-kanban-filters (hook), types, date-presets, api |
| `funnel-automations.tsx` | side panel de automações no funil |

- DnD provider: `@hello-pangea/dnd` (fork de `react-beautiful-dnd`).
- Scrollbars: utilities customizadas `.kanban-board-hscroll` (horizontal, brand-tinted) + `.kanban-scroll` (vertical, ghost-on-hover).
- Animação card-novo: `@keyframes kanban-enter` + `kanban-highlight` (flash brand).

## 6. Métricas factuais (números)

- **371 arquivos** `.ts`/`.tsx` em `src/`
- **~600 imports** de `@/components/ui/*` (1 arquivo importa 12 primitivos — `contact-panel.tsx`)
- **~200 ocorrências** de `className="...bg-[...]..."` (arbitrários Tailwind) — alta parte porque tokens foram criados depois e nem todos migrados
- **~250 ocorrências** de `bg-white/<n>` ou `border-white/<n>` (camadas glass com opacidade hardcoded)
- **~180 arquivos** com cor hex `#xxxxxx` literal — alguns são intencionais (channel colors, charts), outros são vazamento (ex.: `text-[#92600a]`, `#0a3d5e`, etc.)
- **~165 arquivos** com `style={{}}` inline (em parte por `--var(...)` dinâmicos; em parte por convivência com framer-motion)
- **1 arquivo apenas** importa `@radix-ui/react-tooltip`; **6 arquivos** importam `@radix-ui/react-dialog`. Resto é fork artesanal.

## 7. Sinais de inconsistência observados

### 7.1 Tokens duplicados
- `bg-white/40` literal **e** `bg-card` (= rgba(255,255,255,.40)) **e** `--glass-bg-strong` (= rgba(255,255,255,.40)) — 3 jeitos de escrever a mesma cor
- `--shadow-card-sm` ≡ `--shadow-md` ≡ `--glass-shadow-sm` (todos `0 4px 16px rgba(100,130,180,.12)`)
- `--shadow-card` ≡ `--shadow-lg` ≡ `--glass-shadow`
- Badge `default` ≡ `indigo` (mesmo CSS)
- Badge `warning` ≡ `lead` (mesmo CSS)
- Button `secondary` ≡ `glass` (mesmo CSS exato)

### 7.2 Tokens com nomes ambíguos
- `surface`, `subtle`, `muted`, `bg-subtle`, `bg-muted`, `accent`, `secondary` — sobreposição semântica não-documentada
- `glass-bg` (`:root`) vs `bg-card` (`@theme`) — escopo diferente, valores próximos mas não iguais

### 7.3 Tokens hardcoded fora do sistema
- `text-[#92600a]` (badge warning) e `text-[#065f46]` (badge success) — cores específicas que **não estão** em `@theme`
- `bg-[#0f4c75]` (header workspace) hardcoded em `design-tokens.ts`
- `border-[#0a3d5e]` (workspace) idem
- `from-[#a78bfa] to-[#f472b6]` (AIBadge gradient) hardcoded
- Cores `tabular-nums text-slate-400/700/900` (slate Tailwind direto) misturadas com tokens semânticos (`text-foreground`, `text-ink-soft`)

### 7.4 Fonte única de verdade duplicada
- `src/lib/design-tokens.ts` (helpers `dt.*`) **+** `src/lib/dashboard-tokens.ts` (escopo widgets) **+** `globals.css @theme` (CSS vars) — 3 fontes paralelas com regras de uso diferentes

### 7.5 Ausência de componentes pedidos
- Sem primitivo `Checkbox`, `RadioGroup`, `Combobox`, `Toast`, `Popover`, `Pagination`, `Accordion`, `Form`, `EmptyState`, `Spinner`, `Progress` — implementações inline em cada feature

### 7.6 Mistura de famílias Radix vs custom
- `Tooltip` e `Dialog` usam Radix; `DropdownMenu`, `Select`, `ScrollArea`, `Tabs`, `Switch`, `Avatar` são forks manuais sem Radix por baixo. Não há padrão único de "qual primitivo herda acessibilidade do Radix".

### 7.7 Dark mode com overrides imperativos
- Bloco `globals.css` linhas 371–399: ~25 overrides `.dark .bg-white\/45 { ... }`, `.dark .border-white\/55 { ... }` etc. — sintoma de que a base não foi escrita token-first; o dark mode tampa o vazamento de `bg-white/x` em CSS bruto.

### 7.8 Z-index e stacking sem estratégia
- Vários componentes usam `createPortal` (popovers do Kanban, profile dropdown, presence) — feito porque `backdrop-blur` cria stacking context e quebra positioning. Não há escala de z-index documentada nem token.

### 7.9 Sintaxe Tailwind v4 mista
- Tailwind v4 sintaxe nova `bg-(--token)` vs antiga `bg-[var(--token)]` — Linter já reporta 8+ ocorrências (no `client-page.tsx` de automation) onde a sintaxe antiga ficou.

## 8. Mapa de uso por página (top 10 — quantidade de imports `@/components/ui/*`)

```
1.  contact-panel.tsx                            12
2.  chat-window.tsx                              14  (também inclui design-tokens dt)
3.  reports/client-page.tsx (style inline)       10
4.  whatsapp-templates/client-page.tsx            9
5.  custom-fields/client-page.tsx                 9
6.  panels.tsx (deal-detail)                      9
7.  schedules/client-page.tsx                     7
8.  templates/client-page.tsx                     7
9.  pipeline/client-page.tsx                      3 (mas 12 hex literals)
10. ai-agents/client-page.tsx                     7
```

---

## Fim da Fase 1

O que falta (Fase 2, requer Opus pela governança):

1. **Arquitetura proposta** (Atomic / shadcn-first / feature-sliced / Tailwind tokens-only)
2. **Estrutura de pastas nova**
3. **Estratégia de variants** (cva vs slots vs compound)
4. **Estratégia de themes** (continuar com `data-chat-theme` + `.dark`? consolidar?)
5. **Estratégia de tokens** (3 camadas: primitive/semantic/component, e como nomear)
6. **Plano de refatoração** seguro (ordem de migração sem quebrar dark mode nem o Kanban em prod)
7. **Quais primitivos** virar shadcn oficial vs manter custom
8. **Quais componentes unificar** (ex.: 8 button variants → 4? 12 badge variants → 6?)
9. **Estratégia de a11y** (Radix global vs custom + ARIA manual)
