/** Brief único para o v0: redesenhar o sistema de overlays, não 119 telas. */
export const V0_MODAL_BRIEF = `Redesign the overlay/modal SYSTEM of a B2B CRM (UI copy in Portuguese). Do NOT generate 119 unique screens. Generate 8 reusable shells that share one Dialog primitive.

Stack: React + Tailwind + CSS variables (no hardcoded hex except brand). Native <dialog> + portal. Buttons are rounded-full, font-display semibold. Inputs are glass.

LIGHT TOKENS
- brand: #5b6ff5 (primary-dark #3d52e8)
- modal panel: rgba(255,255,255,0.97), border rgba(255,255,255,0.55), shadow 0 16px 48px rgba(100,130,180,0.24)
- radius panel: 32px (--radius-2xl)
- backdrop: black/30 + blur-md
- header: px-24px py-20px, border-b subtle, title font-display 18px bold, description 13px muted
- footer: px-24px py-16px, border-t, Cancel = glass outline, Save = solid brand
- close: X top-right
- no emoji, no new palette, keep glassmorphism

SIZE SCALE (keep these names)
- sm ~384px — confirm / 1–2 fields
- md ~512px — short form 3–5 fields
- lg ~672px — 2-column form
- xl ~896px — complex / compose
- 2xl ~1152px — wizard / builder / 3-col filter

SHELLS TO OUTPUT (Portuguese copy, light theme). Attached screenshot is the CURRENT as-is — improve hierarchy, spacing and consistency, do not invent a different visual language.

1. Form CRUD (FormDialog) — icon + title + description, scrollable body, sticky footer Cancelar / Salvar. Show sm, md, lg, xl.
2. Confirm (AlertDialog sm) — title + 1 paragraph + Cancelar / Excluir (destructive red).
3. Short picker — radio list (e.g. WhatsApp channels), Confirmar.
4. Catalog picker — search + sectioned 2-col cards ("O que deseja automatizar?"). Premium, still same panel chrome.
5. Wizard 2xl — left step list + right form, Continuar.
6. Sheet right — contact detail drawer (not a center modal).
7. Filter explorer 2xl — 3 columns: atalhos | propriedades | tags.
8. System md — two states: WhatsApp QR, and bulk progress bar.

Also specify when to use which shell (decision table). Output shared Overlay/Dialog primitive first, then each shell as a variant.`;
