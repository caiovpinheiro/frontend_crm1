import { describe, expect, it } from "vitest";

import { escapeHtml, unknownTenantHtml } from "../html-escape";

describe("unknownTenantHtml", () => {
  it("mostra o slug como texto e não materializa HTML executável", () => {
    const payload = `<img src=x onerror=alert(1)></code><script>alert(1)</script>`;
    const html = unknownTenantHtml(payload, "https://bwipo.example");

    expect(html).toContain(escapeHtml(payload));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapa o href do apex quando contém aspas", () => {
    const html = unknownTenantHtml("acme", `https://x.example/"onclick="alert(1)`);
    expect(html).not.toContain(`onclick="alert(1)`);
    expect(html).toContain("&quot;");
  });
});
