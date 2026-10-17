/*! Bwipo Webchat loader v1 — <script async src="https://bwipo.com/webchat/embed.js?v=1" data-key="wc_..."></script>
 * Injeta a bolha + um iframe da nossa origem. Nenhum CSS/JS nosso roda no DOM do site
 * além destes 2 elementos. Protocolo postMessage: src/features/webchat-widget/protocol.ts */
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
  var st = { open: false, ready: false, pos: "right", color: "#2563eb", unread: 0 };
  var mq = w.matchMedia ? w.matchMedia("(max-width: 640px)") : null;
  var ICON_CHAT = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z"/></svg>';
  var ICON_X = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  function css(el, o) { for (var k in o) el.style.setProperty(k, o[k], "important"); }

  var frame = d.createElement("iframe");
  frame.src = base + "/webchat/" + encodeURIComponent(key) + "?host=" + encodeURIComponent(w.location.origin) + "&v=1";
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
    btn.setAttribute("aria-label", st.open ? "Fechar chat" : "Abrir chat");
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

  function send(type) { try { frame.contentWindow.postMessage({ ns: NS, type: type }, base); } catch (e) {} }
  function setOpen(v) { if (!st.ready) return; st.open = !!v; layout(); send(st.open ? "open" : "close"); }

  w.addEventListener("message", function (e) {
    if (e.source !== frame.contentWindow || e.origin !== base) return;
    var m = e.data;
    if (!m || m.ns !== NS) return;
    if (m.type === "hello") {
      try {
        frame.contentWindow.postMessage({ ns: NS, type: "ack", page: { page: w.location.href, referrer: d.referrer, title: d.title } }, base);
      } catch (err) {}
    } else if (m.type === "ready") {
      var t = m.theme || {};
      if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(t.primary || "")) st.color = t.primary;
      st.pos = t.position === "left" ? "left" : "right";
      if (t.title) btn.title = String(t.title).slice(0, 60);
      st.ready = true; layout();
    } else if (m.type === "unread") {
      st.unread = Math.max(0, parseInt(m.count, 10) || 0); layout();
    } else if (m.type === "close") {
      st.open = false; layout();
    }
  });

  btn.addEventListener("click", function () { setOpen(!st.open); });
  if (mq && mq.addEventListener) mq.addEventListener("change", layout);

  function mount() { d.body.appendChild(frame); d.body.appendChild(btn); layout(); }
  if (d.body) mount(); else d.addEventListener("DOMContentLoaded", mount);

  w.BwipoWebchat = { version: 1, open: function () { setOpen(true); }, close: function () { setOpen(false); },
    toggle: function () { setOpen(!st.open); } };
})(window, document);
