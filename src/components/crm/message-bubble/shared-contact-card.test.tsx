import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { MessageContent } from "./message-content"
import { copySharedPhone, SharedContactCards } from "./shared-contact-card"
import type { Message } from "./types"

const joao = {
  name: "João Silva",
  phones: [{ phone: "+55 11 99999-9999", waId: "5511999999999", type: "CELL" }],
  emails: [{ email: "joao@empresa.com", type: "WORK" }],
  company: "Empresa X",
  title: "Comercial",
}

const maria = {
  name: "Maria Souza",
  phones: [{ phone: "+55 11 88888-8888" }],
}

function bubble(partial: Partial<Message>): Message {
  return {
    id: "m1",
    content: partial.content ?? "",
    time: "10:00",
    type: "incoming",
    ...partial,
  }
}

describe("card de contato compartilhado", () => {
  it("mostra um contato e a ação de copiar", () => {
    const html = renderToStaticMarkup(createElement(SharedContactCards, { contacts: [joao] }))
    expect(html).toContain("João Silva")
    expect(html).toContain("+55 11 99999-9999")
    expect(html).toContain("joao@empresa.com")
    expect(html).toContain("Empresa X · Comercial")
    expect(html).toContain("Copiar telefone")
  })

  it("mostra um card por contato", () => {
    const html = renderToStaticMarkup(
      createElement(SharedContactCards, { contacts: [joao, maria] }),
    )
    expect(html).toContain("João Silva")
    expect(html).toContain("Maria Souza")
    expect(html.match(/Copiar telefone/g)).toHaveLength(2)
  })

  it("mensagem antiga sem sharedContacts mostra o texto", () => {
    const html = renderToStaticMarkup(
      createElement(MessageContent, {
        message: bubble({
          messageType: "contact",
          content: "[Contato compartilhado]",
        }),
        isOutgoing: false,
      }),
    )
    expect(html).toContain("[Contato compartilhado]")
    expect(html).not.toContain("Copiar telefone")
  })

  it("copia o telefone", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    copySharedPhone("+55 11 99999-9999")
    expect(writeText).toHaveBeenCalledWith("+55 11 99999-9999")
    vi.unstubAllGlobals()
  })
})
