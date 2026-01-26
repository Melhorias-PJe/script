// ==UserScript==
// @name         PJe TJCE - Automação Unificada (Select + Padrões + Prazo + Advogados + Agrupar + Copiar ID)
// @namespace    local.tjce.pje.unified.automacao
// @version      1.0.2
// @description  Unifica: Select nativo (sem Select2), Padrões (Intimação/Diário), Prazo rápido (linha+topo), Botões Advogados Autor/Réu + Auto Mostrar Todos, Agrupar com (última opção só no Diário Eletrônico) e Copiar ID com ícone padrão do PJe. Toast discreto (inferior direito) e 1 scheduler/observer global.
// @match        https://pje.tjce.jus.br/pje1grau/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  /* ------------------------------------------------------------------
   * Config
   * ------------------------------------------------------------------ */
  const CONFIG = {
    DEBUG: false,               // true => mais logs no console
    TOAST_TIMEOUT_MS: 2500,     // duração padrão do toast
    TOAST_MAX: 2,               // máximo de toasts simultâneos
    TOAST_MODE: "WARN_ONLY",    // "ALL" | "WARN_ONLY" | "OFF"
    OBS_DEBOUNCE_MS: 0,         // 0 => requestAnimationFrame
    AUTO_MOSTRAR_TODOS: true,   // tenta clicar automaticamente em "Mostrar todos"
  };

  /* ------------------------------------------------------------------
   * Guard geral (anti-execução dupla)
   * ------------------------------------------------------------------ */
  const ROOT = document.documentElement;
  const GLOBAL_FLAG = "pjeUnifiedApplied";
  if (ROOT.dataset[GLOBAL_FLAG] === "1") return;
  ROOT.dataset[GLOBAL_FLAG] = "1";

  /* ------------------------------------------------------------------
   * Utils: log, normalização, eventos
   * ------------------------------------------------------------------ */
  const U = {
    norm(s) { return (s || "").replace(/\s+/g, " ").trim(); },
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
    warn(...args) { console.warn("[PJe-Unificado]", ...args); },
    err(...args) { console.error("[PJe-Unificado]", ...args); },
    qs(sel, root = document) { return root.querySelector(sel); },
    qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  };

  /* ------------------------------------------------------------------
   * Toast (discreto) + Anti-spam de mensagens
   *  - Inferior direito ✅
   *  - WARN_ONLY por padrão ✅
   *  - Suporta force:true (para ações do usuário, ex: "ID copiado") ✅
   * ------------------------------------------------------------------ */
  const Toast = (() => {
    const SPAM = new Set();
    const ID = "pje-unified-toast-host";

    function canShow(level, force) {
      if (CONFIG.TOAST_MODE === "OFF") return false;
      if (force) return true;
      if (CONFIG.TOAST_MODE === "WARN_ONLY") return level === "warn" || level === "error";
      return true; // ALL
    }

    function ensureHost() {
      let host = document.getElementById(ID);
      if (host) return host;

      host = document.createElement("div");
      host.id = ID;
      host.style.cssText = [
        "position:fixed",
        "bottom:12px",
        "right:12px",
        "z-index:2147483647",
        "display:flex",
        "flex-direction:column",
        "gap:10px",
        "max-width:360px",
        "font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif",
      ].join(";");

      const style = document.createElement("style");
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
        .pje-toast.info  { border-left: 4px solid #4da3ff; }
        .pje-toast.warn  { border-left: 4px solid #ffcc4d; }
        .pje-toast.error { border-left: 4px solid #ff4d4d; }

        @keyframes pjeToastIn {
          from { transform: translateY(6px); opacity: 0.3; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `;
      document.documentElement.appendChild(style);
      document.documentElement.appendChild(host);
      return host;
    }

    function push({ level = "info", title = "PJe Automação", message = "", meta = "", key = "", force = false }) {
      if (!canShow(level, force)) return;

      const spamKey = key || `${level}|${title}|${message}|${meta}`;
      if (SPAM.has(spamKey)) return;
      SPAM.add(spamKey);

      const host = ensureHost();

      while (host.children.length >= CONFIG.TOAST_MAX) {
        host.removeChild(host.firstChild);
      }

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

    function missing(moduleName, what, selectorOrId) {
      push({
        level: "warn",
        title: `PJe Automação – ${moduleName}`,
        message: `Não encontrei ${what}. Pode ter mudado a estrutura/ID do PJe.`,
        meta: selectorOrId ? `Alvo: ${selectorOrId}` : "",
        key: `missing|${moduleName}|${what}|${selectorOrId || ""}`,
      });
    }

    function failure(moduleName, err, context = "") {
      push({
        level: "error",
        title: `PJe Automação – ${moduleName}`,
        message: `Erro interno no módulo. (não quebrou o restante)`,
        meta: `${context ? context + " | " : ""}${(err && (err.message || String(err))) || "Erro"}`,
        key: `fail|${moduleName}|${(err && (err.message || String(err))) || "Erro"}|${context}`,
      });
    }

    function info(title, message, meta = "", key = "") {
      push({ level: "info", title, message, meta, key });
    }

    return { info, missing, failure, push };
  })();

  /* ------------------------------------------------------------------
   * Scheduler: 1 MutationObserver global, com debounce
   * ------------------------------------------------------------------ */
  let scheduled = false;
  let lastScheduleAt = 0;

  function scheduleApply(reason = "mutation") {
    if (scheduled) return;
    scheduled = true;

    const run = () => {
      scheduled = false;
      try { runAll(reason); } catch (e) { U.err("Falha geral no runAll:", e); }
    };

    if (CONFIG.OBS_DEBOUNCE_MS > 0) {
      const now = Date.now();
      const wait = Math.max(0, CONFIG.OBS_DEBOUNCE_MS - (now - lastScheduleAt));
      lastScheduleAt = now;
      setTimeout(run, wait);
    } else {
      requestAnimationFrame(run);
    }
  }

  const MO = new MutationObserver(() => scheduleApply("mutation"));
  MO.observe(document.documentElement, { childList: true, subtree: true });

  /* ------------------------------------------------------------------
   * Módulo A: Select nativo (esconder Select2 visual) + normalização
   * ------------------------------------------------------------------ */
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

.select2-dropdown{ display: none !important; }
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

    function init() {
      try {
        injectCSS();
        normalizeSelects();
      } catch (e) {
        Toast.failure(NAME, e, "init");
      }
    }

    function apply() {
      try { normalizeSelects(); }
      catch (e) { Toast.failure(NAME, e, "apply"); }
    }

    return { NAME, init, apply };
  })();

  /* ------------------------------------------------------------------
   * Módulo B: Padrões (Intimação / Diário Eletrônico)
   * ------------------------------------------------------------------ */
  const ModPadroes = (() => {
    const NAME = "Padrões";
    const FLAG = "pjeDefaultsApplied";

    function setDefaults() {
      const selects = document.querySelectorAll("select");
      selects.forEach(sel => {
        try {
          const opts = Array.from(sel.options || []);
          if (!opts.length) return;
          if (sel.dataset[FLAG] === "1") return;

          const atual = sel.options[sel.selectedIndex];
          if (!atual) return;

          const atualTxt = (atual.textContent || "").trim().toLowerCase();

          const intimacao = opts.find(o => (o.textContent || "").trim().toLowerCase().startsWith("intimação"));
          if (intimacao && atualTxt === "selecione") {
            sel.value = intimacao.value;
            U.fireAll(sel);
          }

          const diario = opts.find(o => (o.textContent || "").trim().toLowerCase().startsWith("diário eletrônico"));
          if (diario && atualTxt === "sistema") {
            sel.value = diario.value;
            U.fireAll(sel);
          }

          sel.dataset[FLAG] = "1";
        } catch (e) {
          Toast.failure(NAME, e, "setDefaults");
        }
      });
    }

    function init() {}
    function apply() { setDefaults(); }

    return { NAME, init, apply };
  })();

  /* ------------------------------------------------------------------
   * Módulo C: Agrupar com: última opção (somente Diário Eletrônico)
   * ------------------------------------------------------------------ */
  const ModAgruparCom = (() => {
    const NAME = "Agrupar com";
    const SELECT_FLAG = "pjeLastApplied";

    function shouldApplyForSelect(sel) {
      const tr = sel.closest("tr");
      if (!tr) return false;
      const meioSpan = tr.querySelector('span[id$=":meioCom"]');
      const meio = U.norm(meioSpan?.textContent);
      return meio === "Diário Eletrônico";
    }

    function applySelect(sel) {
      if (!sel) return;
      if (sel.dataset[SELECT_FLAG] === "1") return;

      if (!shouldApplyForSelect(sel)) {
        sel.dataset[SELECT_FLAG] = "1";
        return;
      }

      const opts = sel.options ? Array.from(sel.options) : [];
      if (opts.length < 2) {
        sel.dataset[SELECT_FLAG] = "1";
        return;
      }

      const lastIndex = opts.length - 1;
      if (sel.selectedIndex !== lastIndex) {
        sel.selectedIndex = lastIndex;
        U.fireAll(sel);
      }

      sel.dataset[SELECT_FLAG] = "1";
    }

    function applyAll() {
      document.querySelectorAll('select[id$=":comboAgrupar"]').forEach(applySelect);
    }

    function init() {}
    function apply() {
      try { applyAll(); }
      catch (e) { Toast.failure(NAME, e, "applyAll"); }
    }

    return { NAME, init, apply };
  })();

  /* ------------------------------------------------------------------
   * Módulo D: Prazo rápido (linha + topo)
   * ------------------------------------------------------------------ */
  const ModPrazoRapido = (() => {
    const NAME = "Prazo rápido";
    const BTN_VALUES = [5, 10, 15, 20, 30];
    const INPUT_SELECTOR = 'input[id$=":quantidadePrazoAto"]';
    const TABLE_SELECTOR = 'table[id$=":destinatariosTable"]';
    const STYLE_ID = "pje-unified-prazo-style";

    function ensureStyles() {
      if (document.getElementById(STYLE_ID)) return;

      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .pje-prazo-wrap{
          display:inline-flex;
          align-items:center;
          gap:6px;
          margin-top:4px;
          flex-wrap:wrap;
        }
        .pje-prazo-wrap button{
          padding:2px 6px;
          border:1px solid #cfcfcf;
          background:#f7f7f7;
          border-radius:4px;
          cursor:pointer;
          font-size:12px;
          line-height:1.2;
        }
        .pje-prazo-wrap button:hover{ background:#ededed; }

        .pje-prazo-top{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
        }
        .pje-prazo-title{
          font-weight:600;
          white-space:nowrap;
        }
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
        b.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          onClick(v);
        });
        wrap.appendChild(b);
      });
      return wrap;
    }

    function addLineButtons(input) {
      const td = input.closest("td");
      if (!td) return;
      if (td.querySelector(".pje-prazo-wrap")) return;

      ensureStyles();
      td.appendChild(createButtons(v => {
        input.value = v;
        U.fireAll(input);
        input.focus();
      }));
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

      if (th.querySelector(".pje-prazo-wrap")) {
        table.dataset.pjePrazoTop = "1";
        return;
      }

      ensureStyles();

      const title = document.createElement("span");
      title.className = "pje-prazo-title";
      title.textContent = "Prazo";

      const wrap = createButtons(v => {
        table.querySelectorAll(INPUT_SELECTOR).forEach(inp => {
          inp.value = v;
          U.fireAll(inp);
        });
      });

      const box = document.createElement("div");
      box.className = "pje-prazo-top";
      box.appendChild(title);
      box.appendChild(wrap);

      th.textContent = "";
      th.appendChild(box);
      table.dataset.pjePrazoTop = "1";
    }

    function applyAll() {
      document.querySelectorAll(INPUT_SELECTOR).forEach(addLineButtons);
      document.querySelectorAll(TABLE_SELECTOR).forEach(addTopButtons);
    }

    function init() {}
    function apply() {
      try { applyAll(); }
      catch (e) { Toast.failure(NAME, e, "applyAll"); }
    }

    return { NAME, init, apply };
  })();

  /* ------------------------------------------------------------------
   * Módulo E: Botões Advogados Autor/Réu + Auto Mostrar Todos
   * ------------------------------------------------------------------ */
  const ModAdvogados = (() => {
    const NAME = "Advogados";
    const FLAG = "pjeAdvButtonsApplied";

    function findTopButtonsBar() {
      const candidates = U.qsa('a.btn.btn-default[title]');
      const anchor = candidates.find(a =>
        /Intimar todos/i.test(a.title || "") || /Mostrar todos/i.test(a.title || "")
      );
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

      const lawyerAs = U.qsa('a[title="ADVOGADO"]', childs);

      return lawyerAs
        .map(a => {
          const span = U.qs('span[title="ADVOGADO"]', a) || a;
          const raw = (span.textContent || "").trim();
          const name = raw.replace(/^ADVOGADO\s*-\s*/i, "").trim();
          return { a, name };
        })
        .filter(x => x.name.length > 0);
    }

    function waitForRegionMutation(region, timeoutMs = 2500) {
      return new Promise(resolve => {
        if (!region) return resolve();

        let done = false;
        const obs = new MutationObserver(() => finish());

        const finish = () => {
          if (done) return;
          done = true;
          try { obs.disconnect(); } catch (e) {}
          resolve();
        };

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

    async function clickLawyersSequential(poloName) {
      if (running) return;
      running = true;

      try {
        const region = findRegionDestinatarios();
        const list = collectLawyerLinksFromPolo(poloName);

        if (!list.length) {
          Toast.missing(NAME, `advogados em "${poloName}"`, 'Árvore ".rich-tree" / links title="ADVOGADO"');
          return;
        }

        for (const item of list) {
          try { item.a.click(); } catch (e) {
            U.warn("Falha ao clicar advogado:", item.name, e);
          }
          await waitForRegionMutation(region, 2500);
          await U.sleep(80);
        }
      } catch (e) {
        Toast.failure(NAME, e, `clickLawyersSequential(${poloName})`);
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

      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        onClick();
      });

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

      const btnAutor = mkBtn("Advogados Autor", () => clickLawyersSequential("Polo ativo"), "adv-autor");
      const btnReu   = mkBtn("Advogados Réu",   () => clickLawyersSequential("Polo passivo"), "adv-reu");

      bar.appendChild(btnAutor);
      bar.appendChild(btnReu);

      ROOT.dataset[FLAG] = "1";
    }

    function init() {}
    function apply() {
      try { applyButtons(); }
      catch (e) { Toast.failure(NAME, e, "applyButtons"); }
    }

    return { NAME, init, apply };
  })();

  /* ------------------------------------------------------------------
   * Módulo F: Copiar ID (ícone padrão do PJe ao lado do link)
   *  - Sem MutationObserver próprio ✅ (usa o scheduler global)
   *  - Ícone clonado do PJe quando disponível ✅
   *  - Toast de ação do usuário com force:true ✅
   * ------------------------------------------------------------------ */
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
      // tenta achar um ícone real já renderizado no PJe
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
      icon.setAttribute("title", "Copiar número para área de transferência");

      icon.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

        const ok = await copyText(idValue);
        Toast.push({
          level: ok ? "info" : "warn",
          title: "Copiar ID",
          message: ok ? `ID copiado: ${idValue}` : "Não consegui copiar 😕",
          force: true, // ação do usuário: mostra mesmo em WARN_ONLY
          key: `copyid|${ok}|${idValue}`
        });
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

  /* ------------------------------------------------------------------
   * Registro de módulos
   * ------------------------------------------------------------------ */
  const MODULES = [
    ModSelectNativo,
    ModPadroes,
    ModAgruparCom,
    ModPrazoRapido,
    ModAdvogados,
    ModCopiarID,
  ];

  function runAll(reason) {
    U.debug("Aplicando módulos:", reason);

    for (const m of MODULES) {
      try { m.init && m.init(); } catch (e) { Toast.failure(m.NAME || "Módulo", e, "init"); }
    }
    for (const m of MODULES) {
      try { m.apply && m.apply(); } catch (e) { Toast.failure(m.NAME || "Módulo", e, "apply"); }
    }
  }

  /* ------------------------------------------------------------------
   * Boot
   * ------------------------------------------------------------------ */
  scheduleApply("boot-start");
  document.addEventListener("DOMContentLoaded", () => scheduleApply("dom-ready"), { once: true });
  window.addEventListener("load", () => scheduleApply("window-load"), { once: true });

  // Sem toast "script ativo" pra não poluir (WARN_ONLY já resolve).
})();
