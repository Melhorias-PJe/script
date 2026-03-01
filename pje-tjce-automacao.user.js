
/* ===== banner.js ===== */
// ==UserScript==
// @name         PJe TJCE - Automação Unificada
// @namespace    local.tjce.pje.unified.automacao
// @version      1.1.7
// @description  (Build modular) Detecta tipo do select por opções (Meio x Comunicação), estabiliza 'Selecione' com fallback correto, reduz spam de toast e adiciona Copiar ID com ícone ao lado do link.
// @match        https://pje.tjce.jus.br/pje1grau/*
// @match        https://pje-treinamento-release.tjce.jus.br/pje1grau/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      comunicaapi.pje.jus.br
// ==/UserScript==

(function () {
  "use strict";



/* ===== core/config.js ===== */
const CONFIG = {
  DEBUG: false,

  TOAST_TIMEOUT_MS: 6500,
  TOAST_MAX: 3,
  TOAST_SHOW_WARN: false,
  TOAST_SHOW_ERROR: true,

  START_AFTER_LOAD: true,
  START_QUIET_MS: 800,
  START_MAX_WAIT_MS: 9000,

  AUTO_MOSTRAR_TODOS: true,

  FINAL_CHECK_ENABLED: true,
  FINAL_CHECK_SECOND_PASS: true,
  FINAL_CHECK_SECOND_PASS_WAIT_MS: 900,

  FINAL_CHECK_ON_INTERACTION: true,
  FINAL_CHECK_TRIGGER_DELAY_MS: 900,
  FINAL_CHECK_INTERACTION_QUIET_MS: 550,
  FINAL_CHECK_INTERACTION_MAX_WAIT_MS: 9000,
  FINAL_CHECK_FALLBACK_ON_LOAD_SILENT: true,

  STABILIZER_ENABLED: true,
  STABILIZER_MAX_TRIES: 12,

  DEFAULT_COMUNICACAO_PREFER: ["Intimação"],
  DEFAULT_MEIO_PREFER: ["Diário Eletrônico"],

  STABILIZER_STABLE_SIG_LIMIT: 4,

  COPY_ID_TOAST_ON_SUCCESS: false,

  // Páginas onde os módulos (exceto Copiar ID) podem rodar
  // Preferir seletor de DOM (mais estável que URL/Hash no SPA)
  TARGET_SELECTOR: "#taskInstanceForm",
  TARGET_TASK_LINK_ID_PREFIX: "taskInstanceForm:Processo_Fluxo_prepararExpediente-",
  TARGET_TASK_LINK_TEXTS: [
    "Escolher destinatários",
    "Preparar ato",
    "Escolher documentos e finalizar",
  ],
  TARGET_HASH_PREFIXES: [
    "#/painel-usuario-interno/conteudo-tarefa/",
    "#/painel-usuario-interno",
    "#/painel-usuario-interno/lista-minhas-tarefas/",
  ],
};



/* ===== core/state.js ===== */
const ROOT = document.documentElement;
const GLOBAL_FLAG = "pjeUnifiedApplied";
if (ROOT.dataset[GLOBAL_FLAG] === "1") return;
ROOT.dataset[GLOBAL_FLAG] = "1";

const USER_TOUCHED_ATTR = "pjeUserTouched";

// marca selects que o usuário mexeu (evita "brigar" com o usuário)
document.addEventListener("change", (ev) => {
  if (!ev.isTrusted) return;
  const t = ev.target;
  if (t && t.tagName === "SELECT") t.dataset[USER_TOUCHED_ATTR] = "1";
}, true);

const state = {
  automationsEnabled: !CONFIG.START_AFTER_LOAD,
  lastMutationAt: Date.now(),
};



/* ===== core/utils.js ===== */
const U = {
  norm(s) { return (s || "").replace(/\s+/g, " ").trim(); },
  normLower(s) { return U.norm(s).toLowerCase(); },
  normUpper(s) {
    return (s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  },
  fireAll(el) {
    if (!el) return;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  },
  debug(...args) { if (CONFIG.DEBUG) console.log("[PJe-Unificado]", ...args); },
  err(...args) { console.error("[PJe-Unificado]", ...args); },
  qs(sel, root = document) { return root.querySelector(sel); },
  qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
    return String(h >>> 0);
  },
  isTargetPage() {
    const sel = (CONFIG.TARGET_SELECTOR || "").trim();
    if (sel && document.querySelector(sel)) {
      const idPrefix = (CONFIG.TARGET_TASK_LINK_ID_PREFIX || "").trim();
      const texts = Array.isArray(CONFIG.TARGET_TASK_LINK_TEXTS)
        ? CONFIG.TARGET_TASK_LINK_TEXTS.map(t => U.norm(t))
        : [];

      if (idPrefix && texts.length) {
        const links = Array.from(document.querySelectorAll(`a[id^="${idPrefix}"]`));
        const linkTexts = links.map(a => U.norm(a.textContent));
        const allFound = texts.every(t => linkTexts.includes(t));
        if (allFound) return true;
      } else {
        return true;
      }
    }

    const hash = window.location && typeof window.location.hash === "string"
      ? window.location.hash
      : "";
    const prefixes = Array.isArray(CONFIG.TARGET_HASH_PREFIXES)
      ? CONFIG.TARGET_HASH_PREFIXES
      : [];
    return prefixes.some(p => hash.startsWith(p));
  },
};



/* ===== core/toast.js ===== */
const Toast = (() => {
  const SPAM = new Set();
  const ID = "pje-unified-toast-host";
  const STYLE_ID = "pje-unified-toast-style";

  function ensureHost() {
    let host = document.getElementById(ID);
    if (host) return host;

    host = document.createElement("div");
    host.id = ID;
    host.style.cssText = [
      "position:fixed",
      "top:12px",
      "right:12px",
      "z-index:2147483647",
      "display:flex",
      "flex-direction:column",
      "gap:10px",
      "max-width:360px",
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif",
    ].join(";");

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .pje-toast{
          background: rgba(30,30,30,0.94);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 10px;
          padding: 10px 12px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.35);
          font-size: 13px;
          line-height: 1.25;
          backdrop-filter: blur(6px);
          animation: pjeToastIn .12s ease-out;
          white-space: pre-line;
        }
        .pje-toast .t-title{
          font-weight: 700;
          margin-bottom: 4px;
          display:flex;
          align-items:center;
          gap:8px;
        }
        .pje-toast .t-meta{
          opacity: 0.85;
          font-size: 12px;
          margin-top: 6px;
          word-break: break-word;
        }
        .pje-toast .t-close{
          margin-left:auto;
          cursor:pointer;
          opacity:0.75;
          font-weight:700;
          padding:0 4px;
          border-radius:6px;
        }
        .pje-toast .t-close:hover{ opacity:1; background: rgba(255,255,255,0.10); }
        .pje-toast.warn  { border-left: 4px solid #ffcc4d; }
        .pje-toast.error { border-left: 4px solid #ff4d4d; }
        @keyframes pjeToastIn {
          from { transform: translateY(-6px); opacity: 0.3; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `;
      document.documentElement.appendChild(style);
    }

    document.documentElement.appendChild(host);
    return host;
  }

  function push({ level = "warn", title = "PJe Automação", message = "", meta = "", key = "" }) {
    const allow =
      (level === "warn" && CONFIG.TOAST_SHOW_WARN) ||
      (level === "error" && CONFIG.TOAST_SHOW_ERROR);

    if (!allow) return;

    const spamKey = key || `${level}|${title}|${message}|${meta}`;
    if (SPAM.has(spamKey)) return;
    SPAM.add(spamKey);

    const host = ensureHost();
    while (host.children.length >= CONFIG.TOAST_MAX) host.removeChild(host.firstChild);

    const box = document.createElement("div");
    box.className = `pje-toast ${level}`;

    const head = document.createElement("div");
    head.className = "t-title";
    head.innerHTML = `<span>⚙️ ${title}</span>`;

    const close = document.createElement("span");
    close.className = "t-close";
    close.textContent = "×";
    close.title = "Fechar";
    close.addEventListener("click", () => { try { box.remove(); } catch (e) {} });
    head.appendChild(close);

    const body = document.createElement("div");
    body.textContent = message;

    box.appendChild(head);
    box.appendChild(body);

    if (meta) {
      const m = document.createElement("div");
      m.className = "t-meta";
      m.textContent = meta;
      box.appendChild(m);
    }

    host.appendChild(box);
    setTimeout(() => { try { box.remove(); } catch (e) {} }, CONFIG.TOAST_TIMEOUT_MS);
  }

  function failure(moduleName, err, context = "") {
    push({
      level: "error",
      title: `PJe Automação – ${moduleName}`,
      message: "Erro interno no módulo. (restante continua)",
      meta: `${context ? context + " | " : ""}${(err && (err.message || String(err))) || "Erro"}`,
      key: `fail|${moduleName}|${(err && (err.message || String(err))) || "Erro"}|${context}`,
    });
  }

  function warn(title, message, meta = "", key = "") {
    push({ level: "warn", title, message, meta, key });
  }

  return { failure, warn };
})();



/* ===== core/selectHelpers.js ===== */
function selectedTextLower(sel) {
  const opt = sel?.options?.[sel.selectedIndex];
  return U.normLower(opt?.textContent || "");
}

function findOptionByPrefixInSelect(sel, prefix) {
  const prefixLower = U.normLower(prefix);
  const opts = Array.from(sel.options || []);
  return opts.find(o => U.normLower(o?.textContent || "").startsWith(prefixLower)) || null;
}

function setByPreferenceList(sel, list) {
  for (const label of list) {
    const opt = findOptionByPrefixInSelect(sel, label);
    if (opt) {
      sel.value = opt.value;
      U.fireAll(sel);
      return { set: true, chosen: label };
    }
  }
  return { set: false, chosen: "" };
}

// detecta o tipo do select por opções (blindado)
function detectSelectKind(sel) {
  const texts = Array.from(sel?.options || [])
    .map(o => (o && typeof o.textContent === "string") ? U.normLower(o.textContent) : "")
    .filter(t => typeof t === "string" && t.length);

  const starts = (prefix) => texts.some(t => typeof t === "string" && t.startsWith(prefix));
  const has = (part) => texts.some(t => typeof t === "string" && t.includes(part));

  const hasMeio =
    starts("diário eletrônico") ||
    starts("correios") ||
    starts("pessoalmente") ||
    starts("central de mandados") ||
    has("mandados");

  const hasCom =
    starts("intimação") ||
    starts("citação") ||
    starts("notificação");

  if (hasMeio && !hasCom) return "MEIO";
  if (hasCom && !hasMeio) return "COMUNICACAO";
  if (hasMeio && hasCom) return "MEIO";
  return "UNKNOWN";
}

function applyDefaultForSelect(sel) {
  const kind = detectSelectKind(sel);
  const cur = selectedTextLower(sel);

  if (sel.dataset[USER_TOUCHED_ATTR] === "1") return false;

  const isDefault = (cur === "selecione" || cur === "sistema");
  if (!isDefault) return false;

  if (kind === "MEIO") return setByPreferenceList(sel, CONFIG.DEFAULT_MEIO_PREFER).set;
  if (kind === "COMUNICACAO") return setByPreferenceList(sel, CONFIG.DEFAULT_COMUNICACAO_PREFER).set;
  return false;
}



/* ===== modules/selectNativo.js ===== */
const ModSelectNativo = (() => {
  const NAME = "Select nativo";
  const STYLE_ID = "pje-unified-select2-style";

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
select.select2-hidden-accessible,
select[aria-hidden="true"]{
  position: static !important;
  width: auto !important;
  height: auto !important;
  clip: auto !important;
  clip-path: none !important;
  overflow: visible !important;
  white-space: normal !important;
  display: inline-block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
span.select2,
span.select2-container,
span.select2-container--default,
span.select2-container--open{
  display: none !important;
}
.select2-dropdown{ display:none !important; }
    `;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function normalizeSelects() {
    const sels = document.querySelectorAll(
      "select.select2-hidden-accessible, select[aria-hidden='true']"
    );
    sels.forEach(s => {
      s.classList.remove("select2-hidden-accessible");
      s.removeAttribute("aria-hidden");
      if (s.getAttribute("tabindex") === "-1") s.removeAttribute("tabindex");
    });
  }

  function init() { try { injectCSS(); normalizeSelects(); } catch (e) { Toast.failure(NAME, e, "init"); } }
  function apply() { try { normalizeSelects(); } catch (e) { Toast.failure(NAME, e, "apply"); } }
  return { NAME, init, apply };
})();



/* ===== modules/padroes.js ===== */
const ModPadroes = (() => {
  const NAME = "Padrões";
  const FLAG = "pjeDefaultsApplied";
  function apply() {
    document.querySelectorAll("select").forEach(sel => {
      try {
        if (!sel.options || !sel.options.length) return;

        const cur = selectedTextLower(sel);
        const isDefault = (cur === "selecione" || cur === "sistema");
        if (sel.dataset[FLAG] === "1" && !isDefault) return;

        applyDefaultForSelect(sel);
        sel.dataset[FLAG] = "1";
      } catch (e) { Toast.failure(NAME, e, "apply"); }
    });
  }
  return { NAME, init() {}, apply };
})();



/* ===== modules/agruparCom.js ===== */
const ModAgruparCom = (() => {
  const NAME = "Agrupar com";
  const SELECT_FLAG = "pjeLastApplied";

  function shouldApplyForSelect(sel) {
    const tr = sel.closest("tr");
    if (!tr) return false;
    const meioSpan = tr.querySelector('span[id$=":meioCom"]');
    return U.norm(meioSpan?.textContent) === "Diário Eletrônico";
  }

  function applySelect(sel) {
    if (!sel) return;
    if (sel.dataset[SELECT_FLAG] === "1") return;

    if (!shouldApplyForSelect(sel)) {
      sel.dataset[SELECT_FLAG] = "1";
      return;
    }

    const opts = Array.from(sel.options || []);
    if (opts.length < 2) return;

    const lastIndex = opts.length - 1;
    if (sel.selectedIndex !== lastIndex) {
      sel.selectedIndex = lastIndex;
      U.fireAll(sel);
    }

    sel.dataset[SELECT_FLAG] = "1";
  }

  function apply() {
    try { document.querySelectorAll('select[id$=":comboAgrupar"]').forEach(applySelect); }
    catch (e) { Toast.failure(NAME, e, "apply"); }
  }

  return { NAME, init() {}, apply };
})();



/* ===== modules/prazoRapido.js ===== */
const ModPrazoRapido = (() => {
  const NAME = "Prazo rápido";
  const BTN_VALUES = [5, 10, 15, 20, 30];
  const INPUT_SELECTOR = 'input[id$=":quantidadePrazoAto"]';
  const TABLE_SELECTOR = 'table[id$=":destinatariosTable"], table[id*=":destinatariosTable"]';
  const STYLE_ID = "pje-unified-prazo-style";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .pje-prazo-wrap{ display:inline-flex; align-items:center; gap:6px; margin-top:4px; flex-wrap:wrap; }
      .pje-prazo-wrap button{
        padding:2px 6px; border:1px solid #cfcfcf; background:#f7f7f7;
        border-radius:4px; cursor:pointer; font-size:12px; line-height:1.2;
      }
      .pje-prazo-wrap button:hover{ background:#ededed; }
      .pje-prazo-top{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .pje-prazo-title{ font-weight:600; white-space:nowrap; }
    `;
    document.documentElement.appendChild(style);
  }

  function createButtons(onClick) {
    const wrap = document.createElement("div");
    wrap.className = "pje-prazo-wrap";
    BTN_VALUES.forEach(v => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = v;
      b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); onClick(v); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function addLineButtons(input) {
    const td = input.closest("td");
    if (!td) return;
    if (td.querySelector(".pje-prazo-wrap")) return;
    ensureStyles();
    td.appendChild(createButtons(v => { input.value = v; U.fireAll(input); input.focus(); }));
  }

  function addTopButtons(table) {
    if (table.dataset.pjePrazoTop === "1") return;
    const firstInput = table.querySelector(INPUT_SELECTOR);
    if (!firstInput) return;

    const td = firstInput.closest("td");
    const tr = td?.closest("tr");
    if (!td || !tr) return;

    const index = Array.from(tr.children).indexOf(td);
    const th = table.querySelector(`thead tr th:nth-child(${index + 1})`);
    if (!th) return;

    if (th.querySelector(".pje-prazo-wrap")) { table.dataset.pjePrazoTop = "1"; return; }

    ensureStyles();

    const title = document.createElement("span");
    title.className = "pje-prazo-title";
    title.textContent = "Prazo";

    const wrap = createButtons(v => {
      table.querySelectorAll(INPUT_SELECTOR).forEach(inp => { inp.value = v; U.fireAll(inp); });
    });

    const box = document.createElement("div");
    box.className = "pje-prazo-top";
    box.appendChild(title);
    box.appendChild(wrap);

    th.textContent = "";
    th.appendChild(box);

    table.dataset.pjePrazoTop = "1";
  }

  function apply() {
    try {
      document.querySelectorAll(INPUT_SELECTOR).forEach(addLineButtons);
      document.querySelectorAll(TABLE_SELECTOR).forEach(addTopButtons);
    } catch (e) { Toast.failure(NAME, e, "apply"); }
  }

  return { NAME, init() {}, apply };
})();



/* ===== modules/verificacaoFinal.js ===== */
const ModVerificacaoFinal = (() => {
  function applyAllGlobal() {
    let corrected = 0, remains = 0;

    document.querySelectorAll("select").forEach(sel => {
      try {
        if (sel.dataset[USER_TOUCHED_ATTR] === "1") {
          const cur = selectedTextLower(sel);
          if (cur === "selecione" || cur === "sistema") remains++;
          return;
        }

        const cur = selectedTextLower(sel);
        const isDefault = (cur === "selecione" || cur === "sistema");
        if (!isDefault) return;

        const ok = applyDefaultForSelect(sel);
        if (ok) corrected++;

        const after = selectedTextLower(sel);
        if (after === "selecione" || after === "sistema") remains++;
      } catch (e) {}
    });

    return { corrected, remains };
  }

  return { applyAllGlobal };
})();



/* ===== modules/stabilizer.js ===== */
const Stabilizer = (() => {
  const ATTACHED = "pjeStabilizerAttached";
  const TRY = "pjeStabilizerTry";
  const MAXED = "pjeStabilizerMaxed";
  const INCOMP = "pjeStabilizerIncompatible";
  const SIG = "pjeStabilizerSig";
  const SIG_N = "pjeStabilizerSigN";

  const GRID_SEL = 'table[id$=":destinatariosTable"], table[id*=":destinatariosTable"]';

  function getOptionsSignature(sel) {
    return Array.from(sel.options || [])
      .map(o => U.normLower(o?.textContent || ""))
      .filter(Boolean)
      .join("|");
  }

  function listOptionsTop(sel, n = 10) {
    return Array.from(sel.options || [])
      .map(o => U.norm(o?.textContent || ""))
      .filter(Boolean)
      .slice(0, n)
      .join(" / ");
  }

  function getRowHint(sel) {
    const tr = sel.closest("tr");
    if (!tr) return "linha";

    const clone = tr.cloneNode(true);
    clone.querySelectorAll("script, style, noscript").forEach(n => n.remove());

    const parts = [];
    for (const n of Array.from(clone.querySelectorAll("td, span, a"))) {
      const t = U.norm(n.textContent);
      if (!t) continue;
      if (t.length > 120) continue;
      if (/function\s+\w+|\<!\[CDATA\[/.test(t)) continue;
      parts.push(t);
      if (parts.length >= 8) break;
    }
    return (parts.join(" | ") || "linha").slice(0, 180);
  }

  function canAutoFix(sel) {
    if (!CONFIG.STABILIZER_ENABLED) return false;
    if (!sel) return false;
    if (sel.disabled) return false;
    if (sel.dataset[USER_TOUCHED_ATTR] === "1") return false;
    if (sel.dataset[INCOMP] === "1") return false;
    return true;
  }

  function bumpTry(sel) {
    const tries = parseInt(sel.dataset[TRY] || "0", 10) + 1;
    sel.dataset[TRY] = String(tries);
    return tries;
  }

  function backoffDelay(tries) {
    return Math.min(1600, Math.round(250 * Math.pow(1.6, Math.max(0, tries - 1))));
  }

  function markMaxed(sel) { sel.dataset[MAXED] = "1"; }
  function isMaxed(sel) { return sel.dataset[MAXED] === "1"; }

  function stableSignatureCheck(sel, signature) {
    const prev = sel.dataset[SIG] || "";
    const prevN = parseInt(sel.dataset[SIG_N] || "0", 10);

    if (signature && signature === prev) sel.dataset[SIG_N] = String(prevN + 1);
    else { sel.dataset[SIG] = signature; sel.dataset[SIG_N] = "1"; }

    return parseInt(sel.dataset[SIG_N] || "0", 10);
  }

  function anyTargetExists(sel, kind) {
    if (kind === "MEIO") return CONFIG.DEFAULT_MEIO_PREFER.some(l => !!findOptionByPrefixInSelect(sel, l));
    if (kind === "COMUNICACAO") return CONFIG.DEFAULT_COMUNICACAO_PREFER.some(l => !!findOptionByPrefixInSelect(sel, l));
    return false;
  }

  function markIncompatible(sel, hint, reason) {
    sel.dataset[INCOMP] = "1";
    const opts = listOptionsTop(sel, 10) || "(sem opções)";
    Toast.warn(
      "PJe Automação",
      "Destinatário incompatível com o padrão (nenhuma opção alvo existe neste combo).",
      `Motivo: ${reason}\nLinha: ${hint}\nOpções (top 10): ${opts}`,
      `stabilizer|incomp|${U.hash(hint + "|" + opts)}`
    );
  }

  function tryFix(sel, reason = "stabilizer") {
    if (!canAutoFix(sel)) return;
    if (isMaxed(sel)) return;

    const cur = selectedTextLower(sel);
    if (cur !== "selecione" && cur !== "sistema") return;

    const kind = detectSelectKind(sel);

    const sig = getOptionsSignature(sel);
    const stableN = stableSignatureCheck(sel, sig);

    if (kind !== "UNKNOWN" && sig && stableN >= CONFIG.STABILIZER_STABLE_SIG_LIMIT && !anyTargetExists(sel, kind)) {
      return markIncompatible(sel, getRowHint(sel), `stable-signature (${stableN}) sem alvo para ${kind}`);
    }

    const tries = bumpTry(sel);
    if (tries > CONFIG.STABILIZER_MAX_TRIES) {
      markMaxed(sel);
      const hint = getRowHint(sel);
      const opts = listOptionsTop(sel, 10) || "(sem opções)";
      Toast.warn(
        "PJe Automação",
        "Não consegui estabilizar um destinatário (campo continua padrão).",
        `Motivo: ${reason} | Tentativas: ${CONFIG.STABILIZER_MAX_TRIES}\nTipo detectado: ${kind}\nLinha: ${hint}\nOpções (top 10): ${opts}`,
        `stabilizer|maxed|${U.hash(hint + "|" + opts)}`
      );
      return;
    }

    const delay = backoffDelay(tries);

    setTimeout(() => {
      if (!canAutoFix(sel)) return;
      if (isMaxed(sel)) return;

      const cur2 = selectedTextLower(sel);
      if (cur2 !== "selecione" && cur2 !== "sistema") return;

      const changed = applyDefaultForSelect(sel);
      if (!changed) tryFix(sel, "options-not-ready");
    }, delay);
  }

  function attach(sel) {
    if (!CONFIG.STABILIZER_ENABLED) return;
    if (!sel || sel.dataset[ATTACHED] === "1") return;
    sel.dataset[ATTACHED] = "1";

    const mo = new MutationObserver(() => tryFix(sel, "options-mutation"));
    mo.observe(sel, { childList: true, subtree: true });

    tryFix(sel, "attach");
  }

  function scanAndAttach() {
    if (!CONFIG.STABILIZER_ENABLED) return;
    document.querySelectorAll(GRID_SEL).forEach(grid => {
      grid.querySelectorAll("select").forEach(attach);
    });
  }

  return { scanAndAttach };
})();



/* ===== modules/advogados.js ===== */
const ModAdvogados = (() => {
  const NAME = "Advogados";
  const FLAG = "pjeAdvButtonsApplied";

  function findTopButtonsBar() {
    const candidates = U.qsa('a.btn.btn-default[title]');
    const anchor = candidates.find(a => /Intimar todos/i.test(a.title || "") || /Mostrar todos/i.test(a.title || ""));
    return anchor ? anchor.closest("div.mb-10") : null;
  }

  function findRegionDestinatarios() {
    return U.qs('[id$=":regionDestinatarios"]') || U.qs('[id*=":regionDestinatarios"]');
  }

  function findPoloAnchor(poloText) {
    const tree = U.qs(".rich-tree.selecao-partes") || U.qs(".rich-tree");
    if (!tree) return null;
    const wanted = U.normUpper(poloText);
    const anchors = U.qsa("td.rich-tree-node-text a", tree);
    return anchors.find(a => U.normUpper(a.textContent) === wanted) || null;
  }

  function getPoloChildrenContainer(poloAnchor) {
    const poloTable = poloAnchor.closest("table.rich-tree-node");
    if (!poloTable) return null;
    let node = poloTable.nextElementSibling;
    if (node && node.classList.contains("rich-tree-node-children")) return node;
    const parentBlock = poloTable.parentElement;
    if (!parentBlock) return null;
    return U.qs("div.rich-tree-node-children", parentBlock);
  }

  function collectLawyerLinksFromPolo(poloName) {
    const poloA = findPoloAnchor(poloName);
    if (!poloA) return [];
    const childs = getPoloChildrenContainer(poloA);
    if (!childs) return [];
    return U.qsa('a[title="ADVOGADO"]', childs).map(a => ({ a })).filter(x => x.a);
  }

  function waitForRegionMutation(region, timeoutMs = 2500) {
    return new Promise(resolve => {
      if (!region) return resolve();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        try { obs.disconnect(); } catch (e) {}
        resolve();
      };
      const obs = new MutationObserver(() => finish());
      obs.observe(region, { childList: true, subtree: true });
      setTimeout(finish, timeoutMs);
    });
  }

  function autoMostrarTodos() {
    const btn = U.qs('a.btn.btn-default[title*="Mostrar todos"]');
    if (!btn) return false;
    if (btn.dataset.autoClicked === "1") return true;
    btn.dataset.autoClicked = "1";
    try { btn.click(); } catch (e) {}
    return true;
  }

  let running = false;

  async function clickLawyersSequential(poloName, afterReason) {
    if (running) return;
    running = true;
    try {
      const region = findRegionDestinatarios();
      const list = collectLawyerLinksFromPolo(poloName);
      if (!list.length) return;

      for (const item of list) {
        try { item.a.click(); } catch (e) {}
        await waitForRegionMutation(region, 2500);
        await U.sleep(80);
      }

      SchedulerAPI.scheduleFinalCheck(afterReason || `Advogados (${poloName})`);
    } finally {
      running = false;
    }
  }

  function mkBtn(label, onClick, dataKey) {
    const a = document.createElement("a");
    a.href = "#";
    a.className = "btn btn-default";
    a.style.marginLeft = "6px";
    a.dataset.pjeBtn = dataKey;
    a.textContent = " " + label;

    const i = document.createElement("i");
    i.className = "fa fa-user";
    a.prepend(i);

    a.addEventListener("click", (ev) => { ev.preventDefault(); onClick(); });
    return a;
  }

  function applyButtons() {
    if (ROOT.dataset[FLAG] === "1") {
      if (CONFIG.AUTO_MOSTRAR_TODOS) autoMostrarTodos();
      return;
    }

    if (CONFIG.AUTO_MOSTRAR_TODOS) autoMostrarTodos();

    const bar = findTopButtonsBar();
    if (!bar) return;

    if (bar.querySelector('[data-pje-btn="adv-autor"]')) {
      ROOT.dataset[FLAG] = "1";
      return;
    }

    const btnAutor = mkBtn("Advogados Autor", () => clickLawyersSequential("Polo ativo", "Advogados Autor"), "adv-autor");
    const btnReu   = mkBtn("Advogados Réu",   () => clickLawyersSequential("Polo passivo", "Advogados Réu"), "adv-reu");

    bar.appendChild(btnAutor);
    bar.appendChild(btnReu);

    ROOT.dataset[FLAG] = "1";
  }

  function apply() { try { applyButtons(); } catch (e) { Toast.failure(NAME, e, "applyButtons"); } }
  return { NAME, init() {}, apply };
})();



/* ===== modules/comunicaDj.js ===== */
const ModComunicaDJ = (() => {
  const NAME = "Comunica DJ";
  const CFG = {
    TRIBUNAL: "TJCE",
    ITEM_SELECTOR: 'div[id$=":infoPPE"]',
    DIARIO_RE: /\b(DIARIO|DJ)\s+ELETRONICO\b/i,
    ADV_LINE_ATTR: "data-adv-publicacao",
    BTN_APPLIED_FLAG: "tmDjBtnsApplied",
  };

  function dataBRparaISO(dataBR) {
    const m = String(dataBR || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }

  function addDaysISO(iso, days) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const dt = new Date(+m[1], +m[2] - 1, +m[3]);
    dt.setDate(dt.getDate() + Number(days || 0));
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }

  function isWeekendISO(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const d = new Date(+m[1], +m[2] - 1, +m[3]).getDay();
    return d === 0 || d === 6;
  }

  function calcDataFimISO(dataIniISO) {
    let fim = addDaysISO(dataIniISO, 1);
    for (let i = 0; i < 10; i++) {
      if (!fim) return null;
      if (!isWeekendISO(fim)) return fim;
      fim = addDaysISO(fim, 1);
    }
    return fim;
  }

  function normalizarNumeroProcesso(str) {
    return String(str || "").replace(/\D/g, "");
  }

  function extrairNumeroProcessoDoItem(infoPPE) {
    const txt = infoPPE?.innerText || "";
    const m = txt.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
    return m ? normalizarNumeroProcesso(m[0]) : null;
  }

  function extrairNumeroProcessoDoDOM() {
    const txt = (document.body?.innerText || "").slice(0, 120000);
    const m = txt.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
    return m ? normalizarNumeroProcesso(m[0]) : null;
  }

  function montarUrlComunicaWeb({ dataIniISO, dataFimISO, numeroProcesso }) {
    return (
      "https://comunica.pje.jus.br/consulta" +
      `?siglaTribunal=${encodeURIComponent(CFG.TRIBUNAL)}` +
      `&dataDisponibilizacaoInicio=${encodeURIComponent(dataIniISO)}` +
      `&dataDisponibilizacaoFim=${encodeURIComponent(dataFimISO)}` +
      `&numeroProcesso=${encodeURIComponent(numeroProcesso)}`
    );
  }

  function montarUrlComunicaApi({ dataIniISO, dataFimISO, numeroProcesso }) {
    return (
      "https://comunicaapi.pje.jus.br/api/v1/comunicacao" +
      `?pagina=1&itensPorPagina=20` +
      `&siglaTribunal=${encodeURIComponent(CFG.TRIBUNAL)}` +
      `&dataDisponibilizacaoInicio=${encodeURIComponent(dataIniISO)}` +
      `&dataDisponibilizacaoFim=${encodeURIComponent(dataFimISO)}` +
      `&numeroProcesso=${encodeURIComponent(numeroProcesso)}`
    );
  }

  function gmGetJSON(url) {
    const gmReq =
      (typeof GM_xmlhttpRequest === "function" && GM_xmlhttpRequest) ||
      (typeof GM !== "undefined" && GM && typeof GM.xmlHttpRequest === "function" && GM.xmlHttpRequest);

    if (!gmReq) return Promise.reject(new Error("GM request API indisponivel"));

    return new Promise((resolve, reject) => {
      gmReq({
        method: "GET",
        url,
        headers: { Accept: "application/json" },
        timeout: 20000,
        onload: r => {
          try { resolve(JSON.parse(r.responseText)); }
          catch (e) { reject(e); }
        },
        onerror: reject,
        ontimeout: () => reject(new Error("timeout")),
      });
    });
  }

  function requestJSON(url) {
    if (
      typeof GM_xmlhttpRequest === "function" ||
      (typeof GM !== "undefined" && GM && typeof GM.xmlHttpRequest === "function")
    ) return gmGetJSON(url);
    return Promise.reject(new Error("GM request API indisponivel"));
  }

  function dedup(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      if (!x) continue;
      if (seen.has(x)) continue;
      seen.add(x);
      out.push(x);
    }
    return out;
  }

  function extrairTodosAdvogados(json) {
    const items = Array.isArray(json?.items) ? json.items : [];
    if (!items.length) return [];

    const labels = [];

    for (const it of items) {
      const lista = Array.isArray(it?.destinatarioadvogados) ? it.destinatarioadvogados : [];
      for (const da of lista) {
        const a = da?.advogado;
        if (!a?.nome) continue;
        const oab = (a.numero_oab && a.uf_oab) ? `OAB/${a.uf_oab}-${a.numero_oab}` : null;
        labels.push(oab ? `${a.nome} - ${oab}` : a.nome);
      }
    }

    return dedup(labels);
  }

  function criarBotao(iconHtml, title, onClick) {
    const span = document.createElement("span");
    span.style.cursor = "pointer";
    span.style.margin = "3px";
    span.style.marginLeft = "6px";
    span.style.userSelect = "none";
    span.title = title;
    span.innerHTML = iconHtml;

    span.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    span.addEventListener("mouseenter", () => { span.style.opacity = "0.7"; });
    span.addEventListener("mouseleave", () => { span.style.opacity = "1"; });

    return span;
  }

  function getOrCreateAdvBlock(divDiario) {
    let bloco = divDiario.nextElementSibling;

    if (!bloco || bloco.getAttribute(CFG.ADV_LINE_ATTR) !== "1") {
      bloco = document.createElement("div");
      bloco.setAttribute(CFG.ADV_LINE_ATTR, "1");
      bloco.style.marginTop = "4px";
      bloco.style.fontSize = "12px";
      bloco.style.opacity = "0.92";
      divDiario.parentNode.insertBefore(bloco, divDiario.nextSibling);
    }

    return bloco;
  }

  function renderAdvogadosEmLinhas(bloco, advs, statusText) {
    bloco.innerHTML = "";

    const titulo = document.createElement("div");
    titulo.style.fontWeight = "bold";
    titulo.textContent = statusText || "Advogados da comunicacao:";
    bloco.appendChild(titulo);

    if (!advs.length) return;

    const lista = document.createElement("div");
    lista.style.marginTop = "2px";

    for (const a of advs) {
      const linha = document.createElement("div");
      linha.textContent = `- ${a}`;
      lista.appendChild(linha);
    }

    bloco.appendChild(lista);
  }

  function aplicarBotoesInline(divDiario, handlers) {
    if (divDiario.dataset[CFG.BTN_APPLIED_FLAG] === "1") return;
    divDiario.dataset[CFG.BTN_APPLIED_FLAG] = "1";

    const texto = (divDiario.textContent || "").trim();
    divDiario.textContent = "";

    const spanTexto = document.createElement("span");
    spanTexto.textContent = texto;

    const btnAbrir = criarBotao(
      '<i class="fa fa-external-link" aria-hidden="true"></i>',
      "Abrir Comunica (web)",
      handlers.onOpenWeb
    );
    const btnAdv = criarBotao(
      '<i class="fa fa-user" aria-hidden="true"></i>',
      "Buscar advogados da comunicacao (API)",
      handlers.onFetchAdv
    );

    divDiario.appendChild(spanTexto);
    divDiario.appendChild(btnAbrir);
    divDiario.appendChild(btnAdv);
  }

  function acharDivDiario(infoPPE) {
    return U.qsa("div", infoPPE).find((d) => {
      const t = U.normUpper(d.textContent || "");
      return CFG.DIARIO_RE.test(t);
    });
  }

  async function buscarEInjetarAdvogados({ divDiario, urlApi }) {
    const bloco = getOrCreateAdvBlock(divDiario);

    try {
      renderAdvogadosEmLinhas(bloco, [], "Advogados da comunicacao: carregando...");
      const json = await requestJSON(urlApi);
      const advs = extrairTodosAdvogados(json);

      if (!advs.length) {
        renderAdvogadosEmLinhas(bloco, [], "Advogados da comunicacao: nao encontrados.");
        U.debug("[ComunicaDJ] API JSON sem advogados", json);
        return;
      }

      renderAdvogadosEmLinhas(bloco, advs, "Advogados da comunicacao:");
    } catch (e) {
      renderAdvogadosEmLinhas(bloco, [], "Advogados da comunicacao: erro ao consultar a API.");
      U.err("[ComunicaDJ] Erro API:", e);
    }
  }

  function processarItem(infoPPE) {
    const divDiario = acharDivDiario(infoPPE);
    if (!divDiario) return;

    const m = (divDiario.textContent || "").match(/(\d{2}\/\d{2}\/\d{4})/);
    if (!m) return;

    const dataIniISO = dataBRparaISO(m[1]);
    const dataFimISO = dataIniISO ? calcDataFimISO(dataIniISO) : null;

    const numeroProcesso = extrairNumeroProcessoDoItem(infoPPE) || extrairNumeroProcessoDoDOM();

    if (!dataIniISO || !dataFimISO || !numeroProcesso) return;

    const urlWeb = montarUrlComunicaWeb({ dataIniISO, dataFimISO, numeroProcesso });
    const urlApi = montarUrlComunicaApi({ dataIniISO, dataFimISO, numeroProcesso });

    aplicarBotoesInline(divDiario, {
      onOpenWeb: () => window.open(urlWeb, "_blank", "noopener"),
      onFetchAdv: () => { buscarEInjetarAdvogados({ divDiario, urlApi }); },
    });
  }

  function apply() {
    try { U.qsa(CFG.ITEM_SELECTOR).forEach(processarItem); }
    catch (e) { Toast.failure(NAME, e, "apply"); }
  }

  return { NAME, init() {}, apply };
})();



/* ===== modules/copiarId.js ===== */
const ModCopiarID = (() => {
  const NAME = "Copiar ID";
  const WRAP_ATTR = "data-pje-copyid-wrapped";
  const ICON_MARK = "data-pje-copyid-icon";
  const STYLE_ID = "pje-unified-copyid-style";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${ICON_MARK}="1"]{
        margin-left:6px;
        cursor: copy;
        vertical-align: middle;
      }
      [${ICON_MARK}="1"]:hover{
        filter: brightness(1.15);
      }
    `;
    document.documentElement.appendChild(style);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}

    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  function getPjeClipboardTemplate() {
    return document.querySelector('i.copiar-clipboard, i.fa-clipboard, i[class*="clipboard"]');
  }

  function makeIcon(idValue) {
    const tpl = getPjeClipboardTemplate();

    let icon;
    if (tpl) {
      icon = tpl.cloneNode(true);
      icon.removeAttribute("onclick");
    } else {
      icon = document.createElement("span");
      icon.textContent = "📋";
      icon.style.fontSize = "13px";
    }

    icon.setAttribute(ICON_MARK, "1");
    icon.setAttribute("title", "Copiar ID para a área de transferência");

    icon.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

      const ok = await copyText(idValue);
      if (!ok) {
        Toast.warn(
          "Copiar ID",
          "Não consegui copiar 😕",
          `ID: ${idValue}`,
          `copyid-fail|${idValue}`
        );
      } else if (CONFIG.COPY_ID_TOAST_ON_SUCCESS) {
        Toast.warn("Copiar ID", `Copiado: ${idValue}`, "", `copyid-ok|${idValue}`);
      }
    });

    return icon;
  }

  function processLinks() {
    ensureStyles();

    const links = document.querySelectorAll('a[href*="/documento/download/"]');
    if (!links.length) return;

    links.forEach(a => {
      const idValue = (a.textContent || "").trim();
      if (!/^\d+$/.test(idValue)) return;

      if (a.getAttribute(WRAP_ATTR) === "1") return;
      a.setAttribute(WRAP_ATTR, "1");

      const next = a.nextElementSibling;
      if (next && next.getAttribute && next.getAttribute(ICON_MARK) === "1") return;

      a.insertAdjacentElement("afterend", makeIcon(idValue));
    });
  }

  function init() {}
  function apply() {
    try { processLinks(); }
    catch (e) { Toast.failure(NAME, e, "processLinks"); }
  }

  return { NAME, init, apply };
})();



/* ===== core/scheduler.js ===== */
// API compartilhada para módulos chamarem o final-check sem acoplamento
const SchedulerAPI = (() => {
  let finalCheckTimer = null;
  let finalCheckRunning = false;

  function scheduleFinalCheck(reason, { silent = false } = {}) {
    if (!CONFIG.FINAL_CHECK_ENABLED) return;
    if (!state.automationsEnabled) return;
    if (!U.isTargetPage()) return;

    if (finalCheckTimer) clearTimeout(finalCheckTimer);

    finalCheckTimer = setTimeout(() => {
      finalCheckTimer = null;
      runFinalCheckAfterQuiet(reason, { silent }).catch(e => Toast.failure("Verificação Final", e, "runFinalCheckAfterQuiet"));
    }, CONFIG.FINAL_CHECK_TRIGGER_DELAY_MS);
  }

  async function runFinalCheckAfterQuiet(reason, { silent } = {}) {
    if (finalCheckRunning) return;
    finalCheckRunning = true;

    try {
      const startedAt = Date.now();
      while (true) {
        const now = Date.now();
        const quietFor = now - state.lastMutationAt;
        const maxed = (now - startedAt) >= CONFIG.FINAL_CHECK_INTERACTION_MAX_WAIT_MS;
        if (quietFor >= CONFIG.FINAL_CHECK_INTERACTION_QUIET_MS || maxed) break;
        await U.sleep(50);
      }

      const r1 = ModVerificacaoFinal.applyAllGlobal();

      if (CONFIG.FINAL_CHECK_SECOND_PASS && r1.remains > 0) {
        await U.sleep(CONFIG.FINAL_CHECK_SECOND_PASS_WAIT_MS);
        const r2 = ModVerificacaoFinal.applyAllGlobal();

        if (!silent && r2.remains > 0) {
          Toast.warn(
            "PJe Automação",
            "Alguns campos continuam em estado padrão após atualização.",
            `Motivo: ${reason} | Delay: ${CONFIG.FINAL_CHECK_TRIGGER_DELAY_MS}ms | Restaram: ${r2.remains}`,
            "final-remains"
          );
        }
      } else {
        if (!silent && r1.remains > 0) {
          Toast.warn(
            "PJe Automação",
            "Alguns campos continuam em estado padrão após atualização.",
            `Motivo: ${reason} | Delay: ${CONFIG.FINAL_CHECK_TRIGGER_DELAY_MS}ms | Restaram: ${r1.remains}`,
            "final-remains"
          );
        }
      }

      Stabilizer.scanAndAttach();
    } finally {
      finalCheckRunning = false;
    }
  }

  return { scheduleFinalCheck };
})();

// listener de cliques que disparam final check (instalado 1x)
const FinalCheckClicks = (() => {
  const CLICK_FLAG = "pjeFinalCheckClickListener";

  function install() {
    if (!CONFIG.FINAL_CHECK_ON_INTERACTION) return;
    if (ROOT.dataset[CLICK_FLAG] === "1") return;
    ROOT.dataset[CLICK_FLAG] = "1";

    document.addEventListener("click", (ev) => {
      const a = ev.target?.closest?.("a");
      if (!a) return;

      if (a.matches('a[data-pje-btn="adv-autor"]')) return SchedulerAPI.scheduleFinalCheck("Advogados Autor");
      if (a.matches('a[data-pje-btn="adv-reu"]')) return SchedulerAPI.scheduleFinalCheck("Advogados Réu");
      if (a.matches('a[title="ADVOGADO"]')) return SchedulerAPI.scheduleFinalCheck("Clique em Advogado (árvore)");
      if (a.closest(".rich-tree") && a.matches("td.rich-tree-node-text a")) return SchedulerAPI.scheduleFinalCheck("Clique em Parte (árvore)");
      if (a.matches('a.btn.btn-default[title*="Mostrar todos"]')) return SchedulerAPI.scheduleFinalCheck("Mostrar todos");
      if (a.matches('a.btn.btn-default[title*="Intimar todos"]')) return SchedulerAPI.scheduleFinalCheck("Intimar todos");
    }, true);
  }

  return { install };
})();

// scheduler do runAll (1 MO global)
const Scheduler = (() => {
  let scheduled = false;

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { runAll(); } catch (e) { U.err("Falha geral no runAll:", e); }
    });
  }

  const MO = new MutationObserver(() => {
    state.lastMutationAt = Date.now();
    scheduleApply();
  });
  MO.observe(document.documentElement, { childList: true, subtree: true });

  // SPA troca hash sem reload; garante reavaliação das regras por página
  window.addEventListener("hashchange", () => scheduleApply());

  return { scheduleApply };
})();

// módulos pesados (só rodam quando automationsEnabled)
const HEAVY_MODULES = [
  ModPadroes,
  ModAgruparCom,
  ModPrazoRapido,
  ModAdvogados,
  ModCopiarID,
];

function runAll() {
  // Copiar ID pode rodar mesmo no boot leve
  try { ModCopiarID.apply(); } catch (e) {}
  // Comunica DJ pode aparecer fora do contexto da tarefa-alvo
  try { ModComunicaDJ.apply(); } catch (e) {}

  if (!U.isTargetPage()) return;

  ModSelectNativo.init();
  ModSelectNativo.apply();

  if (!state.automationsEnabled) return;

  FinalCheckClicks.install();

  for (const m of HEAVY_MODULES) { m.init && m.init(); }
  for (const m of HEAVY_MODULES) { m.apply && m.apply(); }

  Stabilizer.scanAndAttach();
}



/* ===== core/boot.js ===== */
async function enableAfterLoadAndQuiet() {
  if (!CONFIG.START_AFTER_LOAD) {
    state.automationsEnabled = true;
    Scheduler.scheduleApply();
    return;
  }

  const startedAt = Date.now();

  function waitQuiet(quietMs, maxWaitMs) {
    return new Promise(resolve => {
      function tick() {
        const now = Date.now();
        const quietFor = now - state.lastMutationAt;
        const maxed = (now - startedAt) >= maxWaitMs;
        if (quietFor >= quietMs || maxed) return resolve();
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  await waitQuiet(CONFIG.START_QUIET_MS, CONFIG.START_MAX_WAIT_MS);

  state.automationsEnabled = true;
  Scheduler.scheduleApply();

  if (CONFIG.FINAL_CHECK_FALLBACK_ON_LOAD_SILENT) {
    SchedulerAPI.scheduleFinalCheck("Carregamento inicial", { silent: true });
  }
}

// boot leve
Scheduler.scheduleApply();

// boot pesado
window.addEventListener("load", () => {
  enableAfterLoadAndQuiet().catch(e => Toast.failure("Inicialização", e, "enableAfterLoadAndQuiet"));
}, { once: true });



/* ===== footer.js ===== */

})();

