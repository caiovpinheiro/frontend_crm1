/*! Bwipo Webchat loader v2 — <script async src="https://bwipo.com/webchat/embed.js?v=2" data-key="wc_..."></script>
 * Injeta a bolha + um iframe da nossa origem. Nenhum CSS/JS nosso roda no DOM do site
 * além destes 2 elementos. Protocolo postMessage: src/features/webchat-widget/protocol.ts
 * API (superconjunto da v1: open/close/toggle seguem iguais) — contrato em
 * backend docs/decisoes/webchat-widget.md §9.1/§9.2:
 *   BwipoWebchat.open({ message?, ref? }) · identify({ externalId, userHash, name?, email?, phone?, attributes? })
 *   setContext(obj) · track(name, data?, { important?, at? }) · capabilities · version === 2
 *   window "bwipo:webchat:ready" (detail { version, capabilities }) · window.BwipoWebchatQueue = [["identify", {...}], ...] */
(function (w, d) {
  "use strict";
  if (w.BwipoWebchat) return;
  var s = d.currentScript;
  if (!s) {
    var list = d.querySelectorAll("script[data-key]");
    for (var i = list.length - 1; i >= 0; i--) {
      if (/\/webchat\/embed\.js/.test(list[i].src)) { s = list[i]; break; }
    }
  }
  if (!s) return;
  var key = s.getAttribute("data-key") || "";
  if (!/^wc_[A-Za-z0-9_-]{6,64}$/.test(key)) { if (w.console) console.warn("[bwipo-webchat] data-key inválida"); return; }
  var base;
  try { base = new URL(s.src, w.location.href).origin; } catch (e) { return; }
  var NS = "bwipo:webchat", Z = "2147483000";
  var st = { open: false, ready: false, pos: "right", color: "#2563eb", unread: 0, title: "" };
  // v2: limites só de forma (a regra que vale é a do servidor).
  var MAX_QUEUE = 100, BATCH = 20, BATCH_MS = 5000, MAX_IDENTIFY = 8192, MAX_MESSAGE = 4000, MAX_REF = 128;
  var CAPS = { prefill: true, identify: true, track: true, context: true };
  try { Object.freeze(CAPS); } catch (e) {}
  // proto: versão anunciada no `hello` do iframe; mensagens v2 só saem com proto >= 2.
  var link = { acked: false, proto: 0 };
  var pend = { identify: null, context: null, open: null };
  var events = [], batchTimer = null, readyFired = false;
  var mq = w.matchMedia ? w.matchMedia("(max-width: 640px)") : null;
  var ICON_CHAT = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z"/></svg>';
  var ICON_X = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  function css(el, o) { for (var k in o) el.style.setProperty(k, o[k], "important"); }

  var frame = d.createElement("iframe");
  frame.src = base + "/webchat/" + encodeURIComponent(key) + "?host=" + encodeURIComponent(w.location.origin) + "&v=2";
  frame.title = "Chat";
  frame.setAttribute("allow", "clipboard-write");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
  css(frame, { position: "fixed", border: "0", display: "none", "z-index": Z, background: "transparent",
    "color-scheme": "normal", "box-shadow": "0 12px 40px rgba(16,24,40,.18)" });

  var btn = d.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Abrir chat");
  btn.innerHTML = ICON_CHAT;
  css(btn, { position: "fixed", bottom: "20px", width: "56px", height: "56px", "border-radius": "50%", border: "0",
    padding: "0", margin: "0", cursor: "pointer", display: "none", "align-items": "center", "justify-content": "center",
    "z-index": Z, "box-shadow": "0 6px 20px rgba(16,24,40,.22)", transition: "transform .15s ease" });

  var badge = d.createElement("span");
  badge.setAttribute("aria-hidden", "true");
  css(badge, { position: "absolute", top: "-2px", right: "-2px", "min-width": "20px", height: "20px", padding: "0 5px",
    "border-radius": "10px", background: "#e11d48", color: "#fff", "font": "600 11px/20px system-ui,sans-serif",
    "text-align": "center", display: "none", "box-sizing": "border-box" });

  function light(hex) {
    var h = hex.slice(1); if (h.length === 3) h = h.replace(/./g, "$&$&");
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 186;
  }

  function layout() {
    var mobile = mq && mq.matches, side = st.pos === "left" ? "left" : "right", other = side === "left" ? "right" : "left";
    css(btn, { background: st.color, color: light(st.color) ? "#111827" : "#fff" });
    btn.style.setProperty(side, "20px", "important"); btn.style.removeProperty(other);
    btn.style.setProperty("display", st.ready && !(st.open && mobile) ? "flex" : "none", "important");
    btn.innerHTML = st.open ? ICON_X : ICON_CHAT;
    btn.appendChild(badge);
    var label = st.open ? "Fechar chat" : "Abrir chat";
    if (!st.open && st.unread > 0) {
      label += " (" + st.unread + (st.unread === 1 ? " mensagem não lida)" : " mensagens não lidas)");
    }
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-expanded", String(st.open));
    css(badge, { display: !st.open && st.unread > 0 ? "block" : "none" });
    badge.textContent = st.unread > 9 ? "9+" : String(st.unread);
    frame.style.removeProperty(other);
    if (mobile) {
      css(frame, { top: "0", bottom: "0", width: "100%", height: "100%", "border-radius": "0" });
      frame.style.setProperty(side, "0", "important");
    } else {
      frame.style.removeProperty("top");
      css(frame, { bottom: "88px", width: "380px", height: "min(640px, calc(100vh - 108px))", "border-radius": "16px" });
      frame.style.setProperty(side, "20px", "important");
    }
    css(frame, { display: st.ready && st.open ? "block" : "none" });
  }

  function post(msg) { try { frame.contentWindow.postMessage(msg, base); } catch (e) {} }
  function send(type) { post({ ns: NS, type: type }); }
  function focusEl(el) { try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} } }
  function fire(name, detail) {
    try { w.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {}
  }
  function v2() { return link.acked && link.proto >= 2; }
  // Abrir leva o foco para dentro do iframe (o painel foca o diálogo ao
  // receber `open`); fechar devolve o foco para a bolha. `extra` (v2):
  // texto pré-preenchido (sem enviar) e `ref` da conversa.
  function setOpen(v, extra) {
    if (!st.ready) return;
    st.open = !!v; layout();
    if (st.open && extra && v2()) {
      var msg = { ns: NS, type: "open" };
      if (extra.message) msg.message = extra.message;
      if (extra.ref) msg.ref = extra.ref;
      post(msg);
    } else send(st.open ? "open" : "close");
    focusEl(st.open ? frame : btn);
  }

  // ── v2: fila até o handshake, lotes de eventos, página fechando ──
  function scalar(v) {
    return v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && isFinite(v));
  }
  /** Objeto raso só com valores simples (null fica: no contexto remove a chave). */
  function flat(o, max) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    var out = {}, n = 0;
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (++n > max) break;
      var v = o[k];
      if (!scalar(v)) continue;
      out[String(k).slice(0, 64)] = typeof v === "string" ? v.slice(0, 1000) : v;
    }
    return out;
  }
  function str(v, max) {
    if (typeof v === "number" && isFinite(v)) v = String(v);
    return typeof v === "string" && v && v.length <= max ? v : null;
  }
  function flushEvents() {
    if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
    if (!v2()) return;
    while (events.length) post({ ns: NS, type: "track", events: events.splice(0, BATCH) });
  }
  // Depois do `ack`: identify primeiro (o iframe só manda contexto/eventos
  // depois dele), contexto fundido e os eventos guardados.
  function drain() {
    if (!v2()) return;
    if (pend.identify) { post({ ns: NS, type: "identify", identity: pend.identify }); pend.identify = null; }
    if (pend.context) { post({ ns: NS, type: "context", context: pend.context }); pend.context = null; }
    flushEvents();
  }
  function openOpts(o) {
    if (!o || typeof o !== "object") return null;
    var x = {};
    if (typeof o.message === "string" && o.message) x.message = o.message.slice(0, MAX_MESSAGE);
    var r = str(o.ref, MAX_REF);
    if (r) x.ref = r;
    return x.message || x.ref ? x : null;
  }
  function open(o) {
    var x = openOpts(o);
    // Prefill/ref antes do widget ficar pronto: aplica no `ready`.
    if (!st.ready) { if (x) pend.open = x; return; }
    setOpen(true, x);
  }
  function identify(p) {
    if (!p || typeof p !== "object") return;
    var ext = str(p.externalId, 128);
    if (!ext) { if (w.console) console.warn("[bwipo-webchat] identify sem externalId válido"); return; }
    var id = { externalId: ext, userHash: typeof p.userHash === "string" ? p.userHash.slice(0, 256) : "" };
    var keys = ["name", "email", "phone"];
    for (var i = 0; i < keys.length; i++) {
      if (typeof p[keys[i]] === "string" && p[keys[i]]) id[keys[i]] = p[keys[i]].slice(0, 254);
    }
    var attrs = flat(p.attributes, 50);
    if (attrs) id.attributes = attrs;
    try { if (JSON.stringify(id).length > MAX_IDENTIFY) return; } catch (e) { return; }
    pend.identify = id; // o último vale
    drain();
  }
  function setContext(o) {
    var patch = flat(o, 100);
    if (!patch) return;
    var cur = pend.context || {};
    for (var k in patch) cur[k] = patch[k];
    pend.context = cur;
    drain();
  }
  function track(name, data, opts) {
    var n = str(name, 64);
    if (!n) return;
    var ev = { name: n }, dd = flat(data, 10);
    if (dd) { for (var k in dd) { ev.data = dd; break; } }
    if (opts && opts.important === true) ev.important = true;
    var at = opts && opts.at, ms = NaN;
    if (at instanceof Date) ms = at.getTime();
    else if (typeof at === "number") ms = at;
    else if (typeof at === "string") ms = Date.parse(at);
    ev.at = isFinite(ms) ? ms : Date.now();
    events.push(ev);
    if (events.length > MAX_QUEUE) events.splice(0, events.length - MAX_QUEUE);
    if (events.length >= BATCH) flushEvents();
    else if (!batchTimer) batchTimer = setTimeout(flushEvents, BATCH_MS);
  }
  // Página fechando: o que restou vai já e o iframe envia com keepalive.
  function onPageHide() {
    flushEvents();
    if (v2()) send("flush");
  }

  w.addEventListener("message", function (e) {
    if (e.source !== frame.contentWindow || e.origin !== base) return;
    var m = e.data;
    if (!m || m.ns !== NS) return;
    if (m.type === "hello") {
      post({ ns: NS, type: "ack", page: { page: w.location.href, referrer: d.referrer, title: d.title } });
      link.acked = true;
      link.proto = typeof m.protocol === "number" ? m.protocol : 0;
      drain();
    } else if (m.type === "ready") {
      var t = m.theme || {};
      if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(t.primary || "")) st.color = t.primary;
      st.pos = t.position === "left" ? "left" : "right";
      if (t.title) {
        st.title = String(t.title).slice(0, 60);
        btn.title = st.title;
        frame.title = "Chat: " + st.title;
      }
      st.ready = true; layout();
      if (pend.open) { var po = pend.open; pend.open = null; setOpen(true, po); }
      if (!readyFired) { readyFired = true; fire("bwipo:webchat:ready", { version: 2, capabilities: CAPS }); }
    } else if (m.type === "unread") {
      st.unread = Math.max(0, parseInt(m.count, 10) || 0); layout();
    } else if (m.type === "close") {
      // Fechar/Esc dentro do iframe: foco volta para a bolha.
      var wasOpen = st.open;
      st.open = false; layout();
      if (wasOpen) focusEl(btn);
    } else if (m.type === "identity") {
      fire("bwipo:webchat:identity", { verified: m.verified === true });
    }
  });

  btn.addEventListener("click", function () { setOpen(!st.open); });
  // Esc com o foco na bolha/iframe (dentro do iframe o próprio painel trata).
  d.addEventListener("keydown", function (e) {
    if (!st.open || (e.key !== "Escape" && e.key !== "Esc")) return;
    if (d.activeElement !== btn && d.activeElement !== frame) return;
    setOpen(false);
  });
  if (mq && mq.addEventListener) mq.addEventListener("change", layout);
  w.addEventListener("pagehide", onPageHide);
  d.addEventListener("visibilitychange", function () { if (d.visibilityState === "hidden") onPageHide(); });

  function mount() { d.body.appendChild(frame); d.body.appendChild(btn); layout(); }
  if (d.body) mount(); else d.addEventListener("DOMContentLoaded", mount);

  var api = {
    version: 2,
    capabilities: CAPS,
    open: function (o) { open(o); },
    close: function () { setOpen(false); },
    toggle: function () { if (st.open) setOpen(false); else open(); },
    identify: function (p) { identify(p); },
    setContext: function (o) { setContext(o); },
    track: function (n, data, opts) { track(n, data, opts); }
  };
  w.BwipoWebchat = api;
  // Chamadas feitas antes do script carregar (em ordem); depois, `push` chama direto.
  function call(c) {
    if (!c || typeof c.length !== "number" || c[0] === "version" || typeof api[c[0]] !== "function") return;
    try { api[c[0]].apply(api, Array.prototype.slice.call(c, 1)); } catch (e) {}
  }
  var q = w.BwipoWebchatQueue;
  if (q && typeof q.length === "number") for (var qi = 0; qi < q.length; qi++) call(q[qi]);
  w.BwipoWebchatQueue = { push: function () { for (var j = 0; j < arguments.length; j++) call(arguments[j]); } };
})(window, document);
