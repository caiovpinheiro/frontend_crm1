from pathlib import Path

canvas = Path("src/components/automations/workflow-canvas.tsx")
text = canvas.read_text(encoding="utf-8")
old = """      const pipelines = (await res.json()) as {
        id: string;
        name: string;
        stages: { id: string; name: string }[];
      }[];
      const map: Record<string, string> = {};
      for (const p of pipelines) {
        // Incluímos o pipeline também — o resumo do gatilho (ex.: deal_created
        // filtrado por pipeline + estágio) usa o mesmo `lookup` pra
        // converter id→nome de qualquer um dos dois.
        map[p.id] = p.name;
        for (const s of p.stages) {
          map[s.id] = s.name;
        }
      }"""
new = """      const raw = await res.json();
      const pipelines = Array.isArray(raw)
        ? raw
        : ((raw as { pipelines?: unknown; items?: unknown })?.pipelines ??
          (raw as { items?: unknown })?.items ??
          []);
      const map: Record<string, string> = {};
      if (!Array.isArray(pipelines)) return map;
      for (const p of pipelines) {
        if (!p || typeof p !== "object") continue;
        const pipe = p as { id?: string; name?: string; stages?: { id: string; name: string }[] };
        if (pipe.id) map[pipe.id] = pipe.name ?? pipe.id;
        for (const s of pipe.stages ?? []) {
          if (s?.id) map[s.id] = s.name ?? s.id;
        }
      }"""
if old not in text:
    raise SystemExit("canvas old block not found")
canvas.write_text(text.replace(old, new, 1), encoding="utf-8")

preview = Path("src/lib/preview-mocks.ts")
text = preview.read_text(encoding="utf-8")
old = """  { id: "pl-1", name: "Pipeline Padrão", isDefault: true },
  { id: "pl-2", name: "Renovações",      isDefault: false },"""
new = """  { id: "pl-1", name: "Pipeline Padrão", isDefault: true, stages: STAGES },
  { id: "pl-2", name: "Renovações", isDefault: false, stages: STAGES },"""
if old not in text:
    raise SystemExit("preview pipelines block not found")
text = text.replace(old, new, 1)
old = """  {
    test: (u) => u.pathname === "/api/automations",
    handler: () => ({
      items: AUTOMATIONS.map(({ steps: _s, ...a }) => a),
      total: AUTOMATIONS.length,
      page: 1, perPage: 50,
    }),
  },
  {
    test: (u) => /^\\/api\\/automations\\/[^/]+$/.test(u.pathname),
    handler: (u) => AUTOMATIONS.find((a) => a.id === u.pathname.split("/")[3]) ?? AUTOMATIONS[0],
  },"""
new = """  {
    test: (u, method) => u.pathname === "/api/automations" && method === "POST",
    handler: (_u, init) => {
      const body = parseMockBody(init);
      const id = `au-${Date.now()}`;
      return {
        id,
        number: AUTOMATIONS.length + 1,
        name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Nova automação",
        description: typeof body.description === "string" ? body.description : null,
        triggerType: typeof body.triggerType === "string" ? body.triggerType : "manual",
        triggerConfig: body.triggerConfig ?? {},
        active: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stepCount: 0,
        steps: [],
      };
    },
  },
  {
    test: (u) => u.pathname === "/api/automations",
    handler: () => ({
      items: AUTOMATIONS.map(({ steps: _s, ...a }) => a),
      total: AUTOMATIONS.length,
      page: 1, perPage: 50,
    }),
  },
  {
    test: (u) => /^\\/api\\/automations\\/[^/]+\\/stats$/.test(u.pathname),
    handler: () => ({ trigger: {}, steps: {} }),
  },
  {
    test: (u) => /^\\/api\\/automations\\/[^/]+\\/logs$/.test(u.pathname),
    handler: () => ({ items: [], logs: [], total: 0, page: 1, perPage: 50 }),
  },
  {
    test: (u) => /^\\/api\\/automations\\/[^/]+\\/toggle$/.test(u.pathname),
    handler: (u) => {
      const id = u.pathname.split("/")[3];
      const found = AUTOMATIONS.find((a) => a.id === id) ?? AUTOMATIONS[0];
      return { ...found, active: !found.active };
    },
  },
  {
    test: (u) => /^\\/api\\/automations\\/[^/]+$/.test(u.pathname),
    handler: (u) => {
      const id = u.pathname.split("/")[3];
      if (!id || id === "undefined" || id === "null") {
        return { message: "Automação não encontrada." };
      }
      const found = AUTOMATIONS.find((a) => a.id === id);
      if (found) return found;
      return {
        ...AUTOMATIONS[0],
        id,
        name: AUTOMATIONS[0].name,
        steps: AUTOMATIONS[0].steps.map((s) => ({ ...s, automationId: id })),
      };
    },
  },"""
if old not in text:
    raise SystemExit("preview automations block not found")
preview.write_text(text.replace(old, new, 1), encoding="utf-8")
print("patched ok")
