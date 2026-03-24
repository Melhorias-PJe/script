
/* ===== banner.js ===== */
// ==UserScript==
// @name         PJe TJCE - Automação Unificada (1.1.10 modular)
// @namespace    local.tjce.pje.unified.automacao
// @version      1.1.10
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



/* ===== core/selector-references.js ===== */
const SelectorCatalogRefsSource = (() => {
  const references = {
    "prepararExpediente.prazo.quantidadePrazoAto": {
      reference: {
        screen: "Preparar expediente",
        source: "Mapeado a partir de src/modules/prazoRapido.js",
        capturedAt: "2026-03-16T15:00:00Z",
        htmlSnippet: '<input id="formExpediente:destinatariosTable:0:quantidadePrazoAto" name="formExpediente:destinatariosTable:0:quantidadePrazoAto" type="text" value="15">',
        normalizedSnippet: '<input id="*:destinatariosTable:*:quantidadePrazoAto" name="*:destinatariosTable:*:quantidadePrazoAto" type="text" value="15">',
      },
      anchors: {
        ids: ["destinatariosTable", "quantidadePrazoAto"],
        classes: ["rich-table-cell"],
        textNearby: ["Prazo", "Quantidade do prazo", "Destinatarios"],
      },
    },
    "prepararExpediente.destinatarios.tabelaDestinatarios": {
      reference: {
        screen: "Preparar expediente",
        source: "Mapeado a partir de src/modules/prazoRapido.js e src/modules/stabilizer.js",
        capturedAt: "2026-03-16T15:00:00Z",
        htmlSnippet: '<table id="formExpediente:destinatariosTable" class="rich-table"><thead><tr><th>Prazo</th></tr></thead><tbody>...</tbody></table>',
        normalizedSnippet: '<table id="*:destinatariosTable" class="rich-table"><thead><tr><th>Prazo</th></tr></thead><tbody>...</tbody></table>',
      },
      anchors: {
        ids: ["destinatariosTable"],
        classes: ["rich-table"],
        textNearby: ["Prazo", "Meio", "Agrupar com"],
      },
    },
    "prepararExpediente.destinatarios.comboAgrupar": {
      reference: {
        screen: "Preparar expediente",
        source: "Mapeado a partir de src/modules/agruparCom.js",
        capturedAt: "2026-03-16T15:00:00Z",
        htmlSnippet: '<select id="formExpediente:destinatariosTable:0:comboAgrupar" name="formExpediente:destinatariosTable:0:comboAgrupar"><option>Sistema</option><option>Intimacao</option></select>',
        normalizedSnippet: '<select id="*:destinatariosTable:*:comboAgrupar" name="*:destinatariosTable:*:comboAgrupar"><option>...</option></select>',
      },
      anchors: {
        ids: ["destinatariosTable", "comboAgrupar", "meioCom"],
        classes: ["rich-table-cell"],
        textNearby: ["Diario Eletronico", "Agrupar com", "Sistema"],
      },
    },
    "definirEnderecos.regionDestinatarios": {
      reference: {
        screen: "Definir enderecos / destinatarios",
        source: "Mapeado a partir de src/modules/advogados.js",
        capturedAt: "2026-03-16T15:00:00Z",
        htmlSnippet: '<div id="formProcesso:regionDestinatarios" class="rf-p region-destinatarios"><div class="mb-10">...</div></div>',
        normalizedSnippet: '<div id="*:regionDestinatarios" class="region-destinatarios"><div class="mb-10">...</div></div>',
      },
      anchors: {
        ids: ["regionDestinatarios"],
        classes: ["mb-10", "region-destinatarios"],
        textNearby: ["Mostrar todos", "Intimar todos", "Polo ativo"],
      },
    },
    "analisarProcessos.comunicaDj.infoPPE": {
      reference: {
        screen: "Analisar processos",
        source: "Mapeado a partir de src/modules/comunicaDj.js",
        capturedAt: "2026-03-16T15:00:00Z",
        htmlSnippet: '<div id="formAnalise:0:infoPPE" class="panel panel-default"><div>Diario Eletronico - 15/03/2026</div></div>',
        normalizedSnippet: '<div id="*:infoPPE" class="panel panel-default"><div>Diario Eletronico - dd/mm/aaaa</div></div>',
      },
      anchors: {
        ids: ["infoPPE"],
        classes: ["panel", "panel-default"],
        textNearby: ["Diario Eletronico", "Publicacao", "Numero do processo"],
      },
    },
  };

  return { references };
})();



/* ===== core/selectors.js ===== */
const SelectorCatalogSource = (() => {
  const meta = {
    version: "1.0.0",
    hash: "",
    updatedAt: "2026-03-16T15:00:00Z",
  };

  const selectors = {
    prepararExpediente: {
      prazo: {
        quantidadePrazoAto: {
          label: "Campo de prazo por destinatario",
          description: "Input de quantidade de prazo usado na grade de destinatarios do expediente.",
          type: "input",
          selectors: [
            'input[id$=":quantidadePrazoAto"]',
            'input[name$=":quantidadePrazoAto"]',
            'table[id$=":destinatariosTable"] input[id*="quantidadePrazoAto"]',
          ],
          status: "validated",
          notes: "Prefere sufixo JSF para resistir a prefixos dinamicos.",
          lastValidated: "2026-03-16T15:00:00Z",
          container: {
            selectors: [
              'table[id$=":destinatariosTable"]',
              'table[id*=":destinatariosTable"]',
            ],
            strategy: "first-match",
          },
        },
      },
      destinatarios: {
        tabelaDestinatarios: {
          label: "Tabela de destinatarios",
          description: "Grade principal onde ficam meio, prazo e agrupamento de comunicacoes.",
          type: "table",
          selectors: [
            'table[id$=":destinatariosTable"]',
            'table[id*=":destinatariosTable"]',
          ],
          status: "validated",
          notes: "Usada como ancora estrutural para outros campos dentro da tela.",
          lastValidated: "2026-03-16T15:00:00Z",
        },
        comboAgrupar: {
          label: "Select Agrupar com",
          description: "Select de agrupamento usado quando o meio de comunicacao e Diario Eletronico.",
          type: "select",
          selectors: [
            'select[id$=":comboAgrupar"]',
            'select[name$=":comboAgrupar"]',
            'table[id$=":destinatariosTable"] select[id*="comboAgrupar"]',
          ],
          status: "validated",
          notes: "O modulo atual usa o seletor por sufixo; a tabela serve de container estavel.",
          lastValidated: "2026-03-16T15:00:00Z",
          container: {
            selectors: [
              'table[id$=":destinatariosTable"]',
              'table[id*=":destinatariosTable"]',
            ],
            strategy: "first-match",
          },
        },
      },
    },
    definirEnderecos: {
      regionDestinatarios: {
        label: "Regiao de destinatarios",
        description: "Container que recebe atualizacoes parciais apos cliques na arvore de polos e advogados.",
        type: "container",
        selectors: [
          '[id$=":regionDestinatarios"]',
          '[id*=":regionDestinatarios"]',
        ],
        status: "validated",
        notes: "Boa ancora para MutationObserver durante updates AJAX do RichFaces.",
        lastValidated: "2026-03-16T15:00:00Z",
      },
    },
    analisarProcessos: {
      comunicaDj: {
        infoPPE: {
          label: "Bloco de informacao da publicacao",
          description: "Container usado para localizar publicacoes no Diario Eletronico e inserir acoes inline.",
          type: "container",
          selectors: [
            'div[id$=":infoPPE"]',
            'div[id*=":infoPPE"]',
          ],
          status: "validated",
          notes: "Sufixo :infoPPE apareceu consistente nas telas analisadas.",
          lastValidated: "2026-03-16T15:00:00Z",
        },
      },
    },
    pac: {},
    comuns: {},
  };

  return { meta, selectors };
})();

const SelectorCatalog = (() => {
  const STORAGE_KEY = "pje-selector-catalog";

  let activeCatalog = {
    meta: {
      version: SelectorCatalogSource.meta.version,
      hash: "pending",
      updatedAt: SelectorCatalogSource.meta.updatedAt,
    },
    selectors: deepClone(SelectorCatalogSource.selectors),
    references: deepClone(SelectorCatalogRefsSource.references),
    source: "embedded",
  };

  let readyPromise = null;

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue);
    if (!isObject(value)) return value;
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortValue(value[key]);
      return acc;
    }, {});
  }

  function stableStringify(value, space = 0) {
    return JSON.stringify(sortValue(value), null, space);
  }

  async function computeHash(payload) {
    const text = typeof payload === "string" ? payload : stableStringify(payload);
    try {
      if (window.crypto?.subtle && typeof TextEncoder === "function") {
        const bytes = new TextEncoder().encode(text);
        const digest = await window.crypto.subtle.digest("SHA-256", bytes);
        const hash = Array.from(new Uint8Array(digest))
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
        return `sha256-${hash}`;
      }
    } catch (_) {}
    return `hash-${U.hash(text)}`;
  }

  function flattenReferencesMap(references) {
    return isObject(references) ? references : {};
  }

  function normalizeLoadedCatalog(payload, sourceLabel) {
    if (!isObject(payload)) return null;
    return {
      meta: isObject(payload.meta) ? payload.meta : null,
      selectors: isObject(payload.selectors) ? payload.selectors : {},
      references: flattenReferencesMap(payload.references),
      source: sourceLabel || payload.source || "unknown",
    };
  }

  async function buildEmbeddedCatalog() {
    const selectors = deepClone(SelectorCatalogSource.selectors);
    const references = deepClone(SelectorCatalogRefsSource.references);
    const meta = {
      version: SelectorCatalogSource.meta.version,
      updatedAt: SelectorCatalogSource.meta.updatedAt,
      hash: await computeHash({
        version: SelectorCatalogSource.meta.version,
        updatedAt: SelectorCatalogSource.meta.updatedAt,
        selectors,
        references,
      }),
    };
    return { meta, selectors, references, source: "embedded" };
  }

  function hasChromeStorage() {
    return Boolean(
      typeof chrome !== "undefined" &&
      chrome &&
      chrome.storage &&
      chrome.storage.local &&
      typeof chrome.storage.local.get === "function" &&
      typeof chrome.storage.local.set === "function"
    );
  }

  function readLocalStorage() {
    try {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  async function loadLocalCatalog() {
    try {
      if (hasChromeStorage()) {
        const payload = await new Promise((resolve, reject) => {
          chrome.storage.local.get([STORAGE_KEY], (result) => {
            const err = chrome.runtime?.lastError;
            if (err) return reject(new Error(err.message));
            resolve(result?.[STORAGE_KEY] || null);
          });
        });
        return normalizeLoadedCatalog(payload, "chrome.storage.local");
      }
      return normalizeLoadedCatalog(readLocalStorage(), "localStorage");
    } catch (error) {
      U.err("[SelectorCatalog] Falha ao carregar catalogo local:", error);
      return null;
    }
  }

  async function saveLocalCatalog(payload) {
    try {
      if (hasChromeStorage()) {
        await new Promise((resolve, reject) => {
          chrome.storage.local.set({ [STORAGE_KEY]: payload }, () => {
            const err = chrome.runtime?.lastError;
            if (err) return reject(new Error(err.message));
            resolve();
          });
        });
        return true;
      }

      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
      }
    } catch (error) {
      U.err("[SelectorCatalog] Falha ao salvar catalogo local:", error);
    }
    return false;
  }

  async function getLocalCatalogMeta() {
    const payload = await loadLocalCatalog();
    return payload?.meta || null;
  }

  async function syncCatalog() {
    if (readyPromise) return readyPromise;

    readyPromise = (async () => {
      const embedded = await buildEmbeddedCatalog();
      activeCatalog = embedded;

      const local = await loadLocalCatalog();
      const sameHash = local?.meta?.hash && local.meta.hash === embedded.meta.hash;

      if (sameHash) {
        activeCatalog = { ...local, source: local.source || "local" };
        return activeCatalog;
      }

      await saveLocalCatalog(embedded);
      activeCatalog = embedded;
      return activeCatalog;
    })().catch((error) => {
      U.err("[SelectorCatalog] Falha no sync; mantendo catalogo embutido:", error);
      return activeCatalog;
    });

    return readyPromise;
  }

  function getActiveCatalog() {
    return activeCatalog;
  }

  function getReferenceForPath(path) {
    return activeCatalog.references?.[path] || null;
  }

  function resolvePath(object, path) {
    if (!path || !isObject(object)) return null;
    const parts = String(path).split(".").filter(Boolean);
    let current = object;
    for (const part of parts) {
      if (!isObject(current) || !(part in current)) return null;
      current = current[part];
    }
    return current;
  }

  function getSelectorEntry(path) {
    const raw = resolvePath(activeCatalog.selectors, path);
    if (!isObject(raw)) return null;

    const refBlock = getReferenceForPath(path) || {};
    return {
      ...deepClone(raw),
      reference: raw.reference || refBlock.reference || null,
      anchors: raw.anchors || refBlock.anchors || { ids: [], classes: [], textNearby: [] },
      path,
    };
  }

  function normalizeSelectorCandidate(candidate) {
    if (typeof candidate === "string") return candidate.trim();
    if (isObject(candidate) && typeof candidate.value === "string") return candidate.value.trim();
    return "";
  }

  function normalizeContainer(entry) {
    if (!entry?.container) return [];
    if (typeof entry.container === "string") return [entry.container];
    if (Array.isArray(entry.container)) return entry.container.map(normalizeSelectorCandidate).filter(Boolean);
    if (isObject(entry.container) && Array.isArray(entry.container.selectors)) {
      return entry.container.selectors.map(normalizeSelectorCandidate).filter(Boolean);
    }
    return [];
  }

  function resolveContainer(entry, root = document) {
    const containerSelectors = normalizeContainer(entry);
    if (!containerSelectors.length) return root;

    for (const selector of containerSelectors) {
      try {
        const node = root.querySelector(selector);
        if (node) return node;
      } catch (error) {
        U.debug("[SelectorCatalog] Container invalido:", selector, error);
      }
    }

    return root;
  }

  function validateCatalogEntry(entry) {
    const errors = [];

    if (!isObject(entry)) errors.push("Entrada ausente ou invalida.");
    if (!entry?.label) errors.push("Campo label obrigatorio.");
    if (!entry?.description) errors.push("Campo description obrigatorio.");
    if (!entry?.type) errors.push("Campo type obrigatorio.");
    if (!Array.isArray(entry?.selectors) || !entry.selectors.length) errors.push("Campo selectors deve conter ao menos um seletor.");
    if (!entry?.status) errors.push("Campo status obrigatorio.");
    if (!entry?.lastValidated) errors.push("Campo lastValidated obrigatorio.");

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  function queryByCatalog(path, root = document) {
    const entry = getSelectorEntry(path);
    const validation = validateCatalogEntry(entry);
    if (!validation.valid) {
      U.debug("[SelectorCatalog] Entrada invalida:", path, validation.errors);
      return null;
    }

    const scope = resolveContainer(entry, root);
    const selectors = entry.selectors.map(normalizeSelectorCandidate).filter(Boolean);

    for (const selector of selectors) {
      try {
        const found = scope.querySelector(selector);
        if (found) return found;
      } catch (error) {
        U.debug("[SelectorCatalog] Seletor invalido:", path, selector, error);
      }
    }

    return null;
  }

  function queryAllByCatalog(path, root = document) {
    const entry = getSelectorEntry(path);
    const validation = validateCatalogEntry(entry);
    if (!validation.valid) {
      U.debug("[SelectorCatalog] Entrada invalida:", path, validation.errors);
      return [];
    }

    const scope = resolveContainer(entry, root);
    const selectors = entry.selectors.map(normalizeSelectorCandidate).filter(Boolean);
    const seen = new Set();
    const items = [];

    for (const selector of selectors) {
      try {
        scope.querySelectorAll(selector).forEach((node) => {
          if (seen.has(node)) return;
          seen.add(node);
          items.push(node);
        });
      } catch (error) {
        U.debug("[SelectorCatalog] Seletor invalido:", path, selector, error);
      }
    }

    return items;
  }

  function debugSelectorResolution(path, root = document) {
    const entry = getSelectorEntry(path);
    const validation = validateCatalogEntry(entry);
    const scope = entry ? resolveContainer(entry, root) : root;
    const attempts = [];

    if (entry && validation.valid) {
      for (const selector of entry.selectors.map(normalizeSelectorCandidate).filter(Boolean)) {
        try {
          const node = scope.querySelector(selector);
          attempts.push({
            selector,
            matched: Boolean(node),
            tagName: node?.tagName || null,
          });
        } catch (error) {
          attempts.push({
            selector,
            matched: false,
            error: String(error?.message || error),
          });
        }
      }
    }

    const result = {
      path,
      validation,
      entry,
      scope,
      attempts,
      found: attempts.find((item) => item.matched) || null,
    };

    U.debug("[SelectorCatalog] debugSelectorResolution", result);
    return result;
  }

  function exportCatalogJSON(space = 2) {
    return JSON.stringify(activeCatalog, null, space);
  }

  const api = {
    loadLocalCatalog,
    saveLocalCatalog,
    getLocalCatalogMeta,
    syncCatalog,
    getActiveCatalog,
    getSelectorEntry,
    queryByCatalog,
    queryAllByCatalog,
    validateCatalogEntry,
    debugSelectorResolution,
    exportCatalogJSON,
    stableStringify,
  };

  syncCatalog();

  return api;
})();

const loadLocalCatalog = (...args) => SelectorCatalog.loadLocalCatalog(...args);
const saveLocalCatalog = (...args) => SelectorCatalog.saveLocalCatalog(...args);
const getLocalCatalogMeta = (...args) => SelectorCatalog.getLocalCatalogMeta(...args);
const syncCatalog = (...args) => SelectorCatalog.syncCatalog(...args);
const getActiveCatalog = (...args) => SelectorCatalog.getActiveCatalog(...args);
const getSelectorEntry = (...args) => SelectorCatalog.getSelectorEntry(...args);
const queryByCatalog = (...args) => SelectorCatalog.queryByCatalog(...args);
const queryAllByCatalog = (...args) => SelectorCatalog.queryAllByCatalog(...args);
const validateCatalogEntry = (...args) => SelectorCatalog.validateCatalogEntry(...args);
const debugSelectorResolution = (...args) => SelectorCatalog.debugSelectorResolution(...args);

if (typeof window !== "undefined") {
  window.SelectorCatalog = SelectorCatalog;
  window.loadLocalCatalog = loadLocalCatalog;
  window.saveLocalCatalog = saveLocalCatalog;
  window.getLocalCatalogMeta = getLocalCatalogMeta;
  window.syncCatalog = syncCatalog;
  window.getActiveCatalog = getActiveCatalog;
  window.getSelectorEntry = getSelectorEntry;
  window.queryByCatalog = queryByCatalog;
  window.queryAllByCatalog = queryAllByCatalog;
  window.validateCatalogEntry = validateCatalogEntry;
  window.debugSelectorResolution = debugSelectorResolution;
}



/* ===== core/selectorCapture.js ===== */
const SelectorCapture = (() => {
  const NOISY_CLASSES = new Set([
    "ui-state-hover",
    "ui-state-focus",
    "ui-state-active",
    "rf-ddm-itm-sel",
    "select2-hidden-accessible",
    "focus",
    "hover",
    "active",
  ]);
  const DEFAULT_SCAN_SELECTOR = [
    "input",
    "select",
    "textarea",
    "button",
    "a",
    "table",
    "fieldset",
    'div[id]',
    'span[id]',
  ].join(", ");
  const PJE_KEYWORDS = [
    "processo",
    "destinatario",
    "destinatarios",
    "prazo",
    "expediente",
    "intimacao",
    "comunicacao",
    "comunicacao",
    "diario",
    "dj",
    "advogado",
    "advogados",
    "polo",
    "endereco",
    "enderecos",
    "documento",
    "expediente",
    "infoppe",
    "select2",
    "rich",
    "rf-",
  ];

  function cssEscape(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
  }

  function norm(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function normLower(text) {
    return norm(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function normIdLike(value) {
    return String(value || "")
      .replace(/\d+/g, "*")
      .replace(/:[*]+/g, ":*");
  }

  function attrMap(element) {
    const out = {};
    for (const attr of Array.from(element?.attributes || [])) {
      if (!attr?.name) continue;
      const name = attr.name;
      const value = attr.value || "";
      if (
        name === "id" ||
        name === "class" ||
        name === "style" ||
        name.startsWith("on")
      ) continue;
      if (
        name === "name" ||
        name === "role" ||
        name === "title" ||
        name === "type" ||
        name === "aria-label" ||
        name === "placeholder" ||
        name.startsWith("data-")
      ) out[name] = value;
    }
    return out;
  }

  function getElementTextFingerprint(element) {
    return norm([
      element?.textContent,
      element?.getAttribute?.("title"),
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("placeholder"),
    ].filter(Boolean).join(" "));
  }

  function getStableClasses(element) {
    return Array.from(element?.classList || []).filter((name) => {
      if (!name) return false;
      if (NOISY_CLASSES.has(name)) return false;
      if (/^\d+$/.test(name)) return false;
      if (/\b(?:selected|opened|closed|highlight)\b/i.test(name)) return false;
      return true;
    });
  }

  function buildIdCandidates(idValue) {
    if (!idValue) return [];
    const out = [`#${cssEscape(idValue)}`];

    if (idValue.includes(":")) {
      const parts = idValue.split(":").filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) {
        out.push(`[id$=":${last}"]`);
        out.push(`[id*="${last}"]`);
      }

      if (parts.length >= 2) {
        const tail = parts.slice(-2).join(":");
        out.push(`[id$=":${tail}"]`);
      }
    }

    const normalized = normIdLike(idValue);
    if (normalized && normalized !== idValue) out.push(`[id*="${normalized.split(":").pop()}"]`);
    return out;
  }

  function buildNameCandidates(nameValue) {
    if (!nameValue) return [];
    const out = [`[name="${nameValue}"]`];
    if (nameValue.includes(":")) {
      const parts = nameValue.split(":").filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) out.push(`[name$=":${last}"]`);
    }
    return out;
  }

  function buildClassCandidates(tagName, classes) {
    if (!classes.length) return [];
    const tag = tagName.toLowerCase();
    const out = [];
    out.push(`${tag}.${classes[0]}`);
    if (classes.length >= 2) out.push(`${tag}.${classes[0]}.${classes[1]}`);
    return out;
  }

  function buildAttrCandidates(tagName, attrs) {
    const tag = tagName.toLowerCase();
    const out = [];
    Object.entries(attrs).forEach(([name, value]) => {
      if (!value) return;
      if (name === "type") out.push(`${tag}[type="${value}"]`);
      else out.push(`${tag}[${name}="${value}"]`);
    });
    return out;
  }

  function getElementIdentity(element) {
    return [
      element?.tagName || "",
      element?.id || "",
      element?.getAttribute?.("name") || "",
      Array.from(element?.classList || []).join("."),
      getElementTextFingerprint(element).slice(0, 120),
    ].join("|");
  }

  function isVisibleElement(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.hidden) return false;
    if (element.getAttribute("aria-hidden") === "true" && !element.matches("select")) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
    if (style) {
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  }

  function scoreElementRelevance(element) {
    if (!element || element.nodeType !== 1) return 0;

    let score = 0;
    const tag = element.tagName.toLowerCase();
    const idLower = normLower(element.id);
    const nameLower = normLower(element.getAttribute("name"));
    const classLower = normLower(Array.from(element.classList || []).join(" "));
    const textLower = normLower(getElementTextFingerprint(element));
    const role = normLower(element.getAttribute("role"));
    const type = normLower(element.getAttribute("type"));

    if (tag === "select") score += 40;
    if (tag === "input") score += 32;
    if (tag === "textarea") score += 28;
    if (tag === "table") score += 26;
    if (tag === "button") score += 18;
    if (tag === "a") score += 12;
    if (tag === "div" && element.id) score += 10;
    if (tag === "span" && element.id) score += 8;

    if (element.id) score += 18;
    if (element.getAttribute("name")) score += 14;
    if (element.matches("select.select2-hidden-accessible, [role='combobox'], .select2-hidden-accessible")) score += 20;
    if (classLower.includes("rich-") || classLower.includes("rf-")) score += 16;
    if (role.includes("combobox")) score += 16;
    if (type === "hidden") score -= 25;
    if (type === "submit" || type === "button") score += 4;

    for (const keyword of PJE_KEYWORDS) {
      if (idLower.includes(keyword)) score += 10;
      if (nameLower.includes(keyword)) score += 8;
      if (classLower.includes(keyword)) score += 5;
      if (textLower.includes(keyword)) score += 3;
    }

    if (/:\d+:/.test(element.id || "")) score += 8;
    if (/destinatariosTable|quantidadePrazoAto|comboAgrupar|infoPPE|regionDestinatarios/.test(element.id || "")) score += 22;
    if (textLower.includes("diario eletronico")) score += 14;
    if (textLower.includes("mostrar todos") || textLower.includes("intimar todos")) score += 10;

    if (!isVisibleElement(element)) score -= 12;
    return score;
  }

  function inferModuleFromElement(element) {
    const fingerprint = normLower([
      element?.id,
      element?.getAttribute?.("name"),
      Array.from(element?.classList || []).join(" "),
      getElementTextFingerprint(element),
      element?.closest("table, form, div, section")?.id || "",
    ].join(" "));

    if (fingerprint.includes("prazo") || fingerprint.includes("destinatariostable") || fingerprint.includes("comboagrupar")) {
      return "prepararExpediente";
    }
    if (fingerprint.includes("regiondestinatarios") || fingerprint.includes("polo") || fingerprint.includes("advogado")) {
      return "definirEnderecos";
    }
    if (fingerprint.includes("infoppe") || fingerprint.includes("diario") || fingerprint.includes("comunic")) {
      return "analisarProcessos";
    }
    if (fingerprint.includes("pac")) return "pac";
    return "comuns";
  }

  function inferLogicalKey(element) {
    const idValue = element?.id || "";
    const nameValue = element?.getAttribute?.("name") || "";
    const source = idValue || nameValue || "";
    if (source.includes(":")) return source.split(":").filter(Boolean).slice(-1)[0] || "elemento";
    if (source) return source.replace(/[^\w]+/g, "_");

    const text = normLower(getElementTextFingerprint(element));
    if (text.includes("prazo")) return "prazo";
    if (text.includes("diario")) return "diario";
    if (text.includes("advogado")) return "advogados";
    return element?.tagName?.toLowerCase() || "elemento";
  }

  function inferPath(element, options = {}) {
    if (options.path) return options.path;
    const moduleName = options.module || inferModuleFromElement(element);
    const key = inferLogicalKey(element);
    return `${moduleName}.${key}`;
  }

  function detectContainer(element) {
    let node = element?.parentElement || null;
    while (node) {
      const classes = getStableClasses(node);
      if (node.id) {
        return {
          selectors: buildIdCandidates(node.id).slice(0, 3),
          strategy: "first-match",
        };
      }
      if (classes.length) {
        return {
          selectors: buildClassCandidates(node.tagName, classes).slice(0, 2),
          strategy: "first-match",
        };
      }
      if (/^(TABLE|FORM|SECTION|ARTICLE)$/.test(node.tagName)) {
        return {
          selectors: [node.tagName.toLowerCase()],
          strategy: "first-match",
        };
      }
      node = node.parentElement;
    }
    return null;
  }

  function collectNearbyText(element) {
    const texts = [];
    const pushText = (value) => {
      const clean = norm(value);
      if (clean && !texts.includes(clean)) texts.push(clean);
    };

    pushText(element?.getAttribute?.("aria-label"));
    pushText(element?.getAttribute?.("title"));

    const label = element?.id ? document.querySelector(`label[for="${cssEscape(element.id)}"]`) : null;
    pushText(label?.textContent);
    pushText(element?.closest("td, th, div, span, label")?.textContent);
    pushText(element?.previousElementSibling?.textContent);
    pushText(element?.parentElement?.previousElementSibling?.textContent);

    return texts.slice(0, 5);
  }

  function getHtmlSnippet(element) {
    return norm(element?.outerHTML || "").slice(0, 1000);
  }

  function getNormalizedSnippet(element) {
    return getHtmlSnippet(element)
      .replace(/\bid="[^"]+"/g, (match) => {
        const idValue = match.slice(4, -1);
        return `id="${normIdLike(idValue)}"`;
      })
      .replace(/\bname="[^"]+"/g, (match) => {
        const nameValue = match.slice(6, -1);
        return `name="${normIdLike(nameValue)}"`;
      })
      .replace(/\bvalue="[^"]{8,}"/g, 'value="..."');
  }

  function unique(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function inferType(element) {
    const tag = element?.tagName?.toLowerCase() || "element";
    if (tag === "input" || tag === "select" || tag === "textarea" || tag === "button") return tag;
    if (tag === "table" || tag === "form") return tag;
    return "container";
  }

  function buildCatalogEntry(element, options = {}) {
    if (!element || element.nodeType !== 1) throw new Error("Elemento DOM invalido.");

    const tagName = element.tagName.toLowerCase();
    const idValue = element.id || "";
    const nameValue = element.getAttribute("name") || "";
    const classes = getStableClasses(element);
    const attrs = attrMap(element);
    const container = detectContainer(element);
    const selectors = unique([
      ...buildIdCandidates(idValue),
      ...buildNameCandidates(nameValue),
      ...buildClassCandidates(tagName, classes),
      ...buildAttrCandidates(tagName, attrs),
    ]).slice(0, 8);
    const nearbyText = collectNearbyText(element);

    const catalogEntry = {
      label: options.label || `${tagName} ${idValue || nameValue || classes[0] || "sem-id"}`,
      description: options.description || "Entrada capturada automaticamente a partir do DOM atual.",
      type: options.type || inferType(element),
      selectors,
      status: options.status || "mapped",
      notes: options.notes || "Revisar antes de promover para o catalogo oficial.",
      lastValidated: new Date().toISOString(),
      container,
      reference: {
        screen: options.screen || document.title || window.location.pathname,
        source: options.source || "SelectorCapture.capture",
        capturedAt: new Date().toISOString(),
        htmlSnippet: getHtmlSnippet(element),
        normalizedSnippet: getNormalizedSnippet(element),
      },
      anchors: {
        ids: unique([
          ...selectors.filter((item) => item.startsWith("[id")).map((item) => item.replace(/^[^\"]+"?/, "")),
          ...(idValue ? idValue.split(":").filter(Boolean) : []),
          ...(container?.selectors || []).filter((item) => /\[id/.test(item)),
        ]).slice(0, 6),
        classes: classes.slice(0, 6),
        textNearby: nearbyText,
      },
    };

    return {
      path: inferPath(element, options),
      catalogEntry,
      selectorEntry: {
        label: catalogEntry.label,
        description: catalogEntry.description,
        type: catalogEntry.type,
        selectors: catalogEntry.selectors,
        status: catalogEntry.status,
        notes: catalogEntry.notes,
        lastValidated: catalogEntry.lastValidated,
        container: catalogEntry.container,
      },
      referenceEntry: {
        reference: catalogEntry.reference,
        anchors: catalogEntry.anchors,
      },
      diagnostics: {
        tagName,
        id: idValue,
        name: nameValue,
        classes,
        attributes: attrs,
        textNearby: nearbyText,
        container,
        relevanceScore: scoreElementRelevance(element),
      },
    };
  }

  function capture(target, options = {}) {
    const element = typeof target === "string" ? document.querySelector(target) : target;
    if (!element) throw new Error("Nao encontrei o elemento informado.");
    return buildCatalogEntry(element, options);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }

  function toJSON(result, space = 2) {
    return JSON.stringify(result, null, space);
  }

  function shouldIncludeInScan(element, options = {}) {
    const minScore = Number.isFinite(options.minScore) ? options.minScore : 18;
    if (!element || element.nodeType !== 1) return false;
    if (options.onlyVisible !== false && !isVisibleElement(element)) return false;
    if (element.matches('input[type="hidden"], script, style, noscript')) return false;
    return scoreElementRelevance(element) >= minScore;
  }

  function scanDOM(options = {}) {
    const root = options.root || document;
    const selector = options.selector || DEFAULT_SCAN_SELECTOR;
    const maxEntries = Number.isFinite(options.maxEntries) ? options.maxEntries : 40;
    const nodes = Array.from(root.querySelectorAll(selector));
    const seen = new Set();
    const results = [];

    for (const element of nodes) {
      if (!shouldIncludeInScan(element, options)) continue;

      const identity = getElementIdentity(element);
      if (seen.has(identity)) continue;
      seen.add(identity);

      try {
        const result = buildCatalogEntry(element, options);
        results.push(result);
      } catch (error) {
        console.error("[SelectorCapture] Falha ao varrer elemento:", error, element);
      }
    }

    results.sort((a, b) => {
      const scoreDiff = (b.diagnostics?.relevanceScore || 0) - (a.diagnostics?.relevanceScore || 0);
      if (scoreDiff) return scoreDiff;
      return String(a.path).localeCompare(String(b.path));
    });

    return {
      scannedAt: new Date().toISOString(),
      screen: options.screen || document.title || window.location.pathname,
      totalNodes: nodes.length,
      totalRelevant: results.length,
      entries: results.slice(0, maxEntries),
    };
  }

  function scanPje(options = {}) {
    const root = options.root || document;
    const selector = options.selector || [
      'input[id], input[name]',
      'select[id], select[name], select.select2-hidden-accessible',
      'textarea[id], textarea[name]',
      'table[id*="destinatarios"], table[id], table.rich-table',
      'div[id*="infoPPE"], div[id*="regionDestinatarios"], div.rich-tree',
      'span[id*="meioCom"], span.select2, span.select2-container',
      'a[title], a.btn.btn-default, a[href*="documento/download"]',
      'button[id], button[name]',
    ].join(", ");

    return scanDOM({
      ...options,
      root,
      selector,
      minScore: Number.isFinite(options.minScore) ? options.minScore : 16,
      maxEntries: Number.isFinite(options.maxEntries) ? options.maxEntries : 80,
    });
  }

  function scanToCatalogObject(options = {}) {
    const scan = scanPje(options);
    const selectors = {};
    const references = {};

    scan.entries.forEach((item) => {
      const parts = String(item.path || "").split(".").filter(Boolean);
      if (!parts.length) return;

      let cursor = selectors;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) cursor[part] = {};
        cursor = cursor[part];
      }

      cursor[parts[parts.length - 1]] = item.selectorEntry;
      references[item.path] = item.referenceEntry;
    });

    return {
      meta: {
        version: options.version || "0.1.0-scan",
        hash: "",
        updatedAt: new Date().toISOString(),
      },
      selectors,
      references,
      scan,
    };
  }

  function toJS(result) {
    if (result?.entries && Array.isArray(result.entries)) {
      return result.entries.map((entry) => toJS(entry)).join("\n\n");
    }

    const path = result?.path || "modulo.campo";
    const selectorJson = JSON.stringify(result?.selectorEntry || {}, null, 2)
      .split("\n")
      .map((line, index) => index === 0 ? line : `  ${line}`)
      .join("\n");
    const referenceJson = JSON.stringify(result?.referenceEntry || {}, null, 2)
      .split("\n")
      .map((line, index) => index === 0 ? line : `  ${line}`)
      .join("\n");

    return [
      `// selectors.js`,
      `"${path}": ${selectorJson},`,
      "",
      `// selector-references.js`,
      `"${path}": ${referenceJson},`,
    ].join("\n");
  }

  async function copyResult(result, mode = "json") {
    const text = mode === "js" ? toJS(result) : toJSON(result);
    await copyToClipboard(text);
    return text;
  }

  function pickNextClick(options = {}) {
    const handler = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      document.removeEventListener("click", handler, true);

      try {
        const result = capture(event.target, options);
        console.log("[SelectorCapture] Resultado:", result);
        if (options.copy !== false) await copyResult(result, options.mode || "json");
      } catch (error) {
        console.error("[SelectorCapture] Falha ao capturar:", error);
      }
    };

    document.addEventListener("click", handler, true);
    console.log("[SelectorCapture] Clique no elemento que deseja mapear.");
    return () => document.removeEventListener("click", handler, true);
  }

  return {
    capture,
    buildCatalogEntry,
    scanDOM,
    scanPje,
    scanToCatalogObject,
    copyResult,
    pickNextClick,
    toJSON,
    toJS,
  };
})();

if (typeof window !== "undefined") window.SelectorCapture = SelectorCapture;



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

  return {
    scanAndAttach,
    __testing: {
      getOptionsSignature,
      stableSignatureCheck,
      canAutoFix,
      tryFix,
      attach,
      anyTargetExists,
      listOptionsTop,
      getRowHint,
    },
  };
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
    BTN_APPLIED_FLAG: "tmDjBtnsApplied",
    CERT_APPLIED_FLAG: "tmDjCertBtnApplied",
    ADV_BLOCK_ATTR: "data-adv-publicacao",
    CERT_STATE_KEY: "__tmDjState",
    MODAL_ID: "tmDjCertidaoModal",
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

  function formatarDataExtensoBR(dateObj) {
    const meses = [
      "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    ];
    const d = dateObj.getDate();
    const m = meses[dateObj.getMonth()];
    const a = dateObj.getFullYear();
    return `${d} de ${m} de ${a}`;
  }

  function hojeFortalezaExtenso() {
    return `Fortaleza, ${formatarDataExtensoBR(new Date())}.`;
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
        timeout: 20000,
        headers: { Accept: "application/json" },
        onload: (res) => {
          try {
            resolve(JSON.parse(res.responseText));
          } catch (e) {
            reject(e);
          }
        },
        onerror: (err) => reject(err),
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

  function extrairPartes(item) {
    const ds = Array.isArray(item?.destinatarios) ? item.destinatarios : [];
    return dedup(ds.map(d => d?.nome).filter(Boolean));
  }

  function extrairAdvogadosDoItem(item) {
    const lista = Array.isArray(item?.destinatarioadvogados) ? item.destinatarioadvogados : [];
    const labels = [];

    for (const da of lista) {
      const a = da?.advogado;
      if (!a?.nome) continue;
      const oab = (a.numero_oab && a.uf_oab) ? `OAB/${a.uf_oab} ${a.numero_oab}` : null;
      labels.push(oab ? `${a.nome} - ${oab}` : a.nome);
    }

    return dedup(labels);
  }

  function escolherItemDaResposta(json, numeroProcesso) {
    const items = Array.isArray(json?.items) ? json.items : [];
    if (!items.length) return null;
    return items.find(it => String(it?.numero_processo) === String(numeroProcesso)) || items[0] || null;
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

  function acharDivDiario(infoPPE) {
    return U.qsa("div", infoPPE).find((d) => {
      const t = U.normUpper(d.textContent || "");
      return CFG.DIARIO_RE.test(t);
    });
  }

  function getOrCreateAdvBlock(divDiario) {
    let bloco = divDiario.nextElementSibling;

    if (!bloco || bloco.getAttribute(CFG.ADV_BLOCK_ATTR) !== "1") {
      bloco = document.createElement("div");
      bloco.setAttribute(CFG.ADV_BLOCK_ATTR, "1");
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
      "Consultar advogados (API)",
      handlers.onFetchAdv
    );

    divDiario.appendChild(spanTexto);
    divDiario.appendChild(btnAbrir);
    divDiario.appendChild(btnAdv);

    divDiario.__tmBtnAdvRef = btnAdv;
  }

  function inserirBotaoCertidaoDepoisDoAdv(divDiario, onClickCertidao) {
    if (divDiario.dataset[CFG.CERT_APPLIED_FLAG] === "1") return;
    const btnAdvRef = divDiario.__tmBtnAdvRef;
    if (!btnAdvRef || !btnAdvRef.parentNode) return;

    const btnCert = criarBotao(
      '<i class="fa fa-file-text-o" aria-hidden="true"></i>',
      "Gerar certidao",
      onClickCertidao
    );

    btnAdvRef.parentNode.insertBefore(btnCert, btnAdvRef.nextSibling);
    divDiario.dataset[CFG.CERT_APPLIED_FLAG] = "1";
    divDiario.__tmBtnCertRef = btnCert;
  }

  function montarCertidaoTexto(state) {
    const procMasc = state?.numeroProcessoMasc || state?.numeroProcesso || "";
    const dataDisp = state?.dataDisponibilizacaoExtenso || state?.dataDisponibilizacaoISO || "";
    const partes = Array.isArray(state?.partes) ? state.partes : [];
    const advs = Array.isArray(state?.advogados) ? state.advogados : [];

    const linhas = [];
    linhas.push("");
    linhas.push(`Certifico que, na data de ${dataDisp}, foi publicada no Diario de Justica Eletronico comunicacao referente ao processo n. ${procMasc || "[numero nao identificado]"}.`);
    linhas.push("");

    if (state?.publicacaoEncontrada === false) {
      linhas.length = 0;
      linhas.push("");
      linhas.push(`Certifico que realizei consulta ao Diario de Justica Eletronico referente ao processo n. ${procMasc || "[numero nao identificado]"}.`);
      linhas.push("");
      linhas.push("Apos a consulta, nao foi localizada publicacao correspondente no Diario de Justica Eletronico.");
      linhas.push("");
      linhas.push("O referido e verdade. Dou fe.");
      linhas.push("");
      return linhas.join("\n");
    }

    if (advs.length) {
      if (partes.length) {
        linhas.push("Parte(s) ou Advogado(s) destinataria(s):");
        for (const p of partes) linhas.push(`- ${p}`);
        linhas.push("");
      }
      linhas.push("Advogado(s) intimado(s):");
      for (const a of advs) linhas.push(`- ${a}`);
      linhas.push("");
      linhas.push("O referido e verdade. Dou fe.");
      linhas.push("");
      return linhas.join("\n");
    }

    linhas.push("Entretanto, nenhum advogado foi intimado na referida publicacao.");
    linhas.push("");

    if (partes.length) {
      linhas.push("Parte(s) ou Advogado(s) destinataria(s):");
      for (const p of partes) linhas.push(`- ${p}`);
      linhas.push("");
    }

    linhas.push("O referido e verdade. Dou fe.");
    linhas.push("");
    return linhas.join("\n");
  }

  function fecharModal() {
    const old = document.getElementById(CFG.MODAL_ID);
    if (old) old.remove();
  }

  function abrirModalCertidao(textoPuro) {
    fecharModal();

    const overlay = document.createElement("div");
    overlay.id = CFG.MODAL_ID;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.45)";
    overlay.style.zIndex = "999999";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) fecharModal();
    });

    const box = document.createElement("div");
    box.style.position = "absolute";
    box.style.top = "50%";
    box.style.left = "50%";
    box.style.transform = "translate(-50%, -50%)";
    box.style.width = "min(820px, 92vw)";
    box.style.maxHeight = "82vh";
    box.style.background = "#fff";
    box.style.borderRadius = "10px";
    box.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
    box.style.padding = "14px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "10px";

    const title = document.createElement("div");
    title.textContent = "Certidao";
    title.style.fontWeight = "bold";
    title.style.fontSize = "14px";

    const btnX = document.createElement("button");
    btnX.type = "button";
    btnX.textContent = "x";
    btnX.style.border = "0";
    btnX.style.background = "transparent";
    btnX.style.cursor = "pointer";
    btnX.style.fontSize = "16px";
    btnX.addEventListener("click", fecharModal);

    header.appendChild(title);
    header.appendChild(btnX);

    const textarea = document.createElement("textarea");
    textarea.value = textoPuro;
    textarea.readOnly = true;
    textarea.style.width = "100%";
    textarea.style.height = "52vh";
    textarea.style.resize = "vertical";
    textarea.style.fontFamily = "monospace";
    textarea.style.fontSize = "12px";
    textarea.style.lineHeight = "1.35";
    textarea.style.padding = "10px";
    textarea.style.borderRadius = "8px";
    textarea.style.border = "1px solid #d0d0d0";
    textarea.style.boxSizing = "border-box";

    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.justifyContent = "flex-end";
    footer.style.gap = "8px";
    footer.style.marginTop = "10px";

    const btnCopiar = document.createElement("button");
    btnCopiar.type = "button";
    btnCopiar.textContent = "Copiar certidao";
    btnCopiar.style.cursor = "pointer";

    const btnFechar = document.createElement("button");
    btnFechar.type = "button";
    btnFechar.textContent = "Fechar";
    btnFechar.style.cursor = "pointer";
    btnFechar.addEventListener("click", fecharModal);

    const toast = document.createElement("div");
    toast.style.position = "absolute";
    toast.style.right = "14px";
    toast.style.bottom = "14px";
    toast.style.padding = "8px 10px";
    toast.style.borderRadius = "8px";
    toast.style.background = "rgba(0,0,0,0.78)";
    toast.style.color = "#fff";
    toast.style.fontSize = "12px";
    toast.style.display = "none";

    function showToast(msg) {
      toast.textContent = msg;
      toast.style.display = "block";
      setTimeout(() => { toast.style.display = "none"; }, 1400);
    }

    function textoPrincipalParaCopia(texto) {
      const linhas = String(texto || "").split(/\r?\n/);
      const filtradas = linhas.filter((ln) => {
        const t = U.normUpper(ln);
        if (!t) return false;
        if (t === "CERTIDAO") return false;
        if (/^FORTALEZA,\s+.+\.$/i.test(ln.trim())) return false;
        return true;
      });
      return filtradas.join("\n").trim();
    }

    btnCopiar.addEventListener("click", async () => {
      const textoCopiar = textoPrincipalParaCopia(textoPuro);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textoCopiar);
        } else {
          const prev = textarea.value;
          textarea.value = textoCopiar;
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
          textarea.value = prev;
        }
        showToast("Texto principal copiado.");
      } catch (e) {
        U.err("[ComunicaDJ] Falha ao copiar certidao:", e);
        showToast("Falha ao copiar.");
      }
    });

    footer.appendChild(btnCopiar);
    footer.appendChild(btnFechar);

    box.appendChild(header);
    box.appendChild(textarea);
    box.appendChild(footer);
    box.appendChild(toast);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function lerDataDoDivDiario(divDiario) {
    const m = (divDiario.textContent || "").match(/(\d{2}\/\d{2}\/\d{4})/);
    return m ? m[1] : null;
  }

  function dataISOParaExtenso(dataISO) {
    const m = String(dataISO || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return dataISO || "";
    const dt = new Date(+m[1], +m[2] - 1, +m[3]);
    return formatarDataExtensoBR(dt);
  }

  async function consultarApiEAtualizarEstado({ divDiario, urlApi, numeroProcesso }) {
    const bloco = getOrCreateAdvBlock(divDiario);
    const state = (divDiario[CFG.CERT_STATE_KEY] ||= {
      consultado: false,
      publicacaoEncontrada: null,
      dataDisponibilizacaoISO: null,
      dataDisponibilizacaoExtenso: null,
      numeroProcesso,
      numeroProcessoMasc: null,
      partes: [],
      advogados: [],
      erro: null,
    });

    try {
      renderAdvogadosEmLinhas(bloco, [], "Advogados da comunicacao: consultando...");
      state.consultado = false;
      state.erro = null;

      const json = await requestJSON(urlApi);
      const item = escolherItemDaResposta(json, numeroProcesso);

      if (!item) {
        state.consultado = true;
        state.publicacaoEncontrada = false;
        state.partes = [];
        state.advogados = [];
        state.dataDisponibilizacaoISO = null;
        state.dataDisponibilizacaoExtenso = null;

        renderAdvogadosEmLinhas(bloco, [], "Advogados da comunicacao: nao encontrados.");
      } else {
        const advs = extrairAdvogadosDoItem(item);
        const partes = extrairPartes(item);

        state.consultado = true;
        state.publicacaoEncontrada = true;
        state.advogados = advs;
        state.partes = partes;
        state.dataDisponibilizacaoISO = item.data_disponibilizacao || null;
        state.dataDisponibilizacaoExtenso = state.dataDisponibilizacaoISO ? dataISOParaExtenso(state.dataDisponibilizacaoISO) : "";
        state.numeroProcessoMasc = item.numeroprocessocommascara || null;

        if (!advs.length) {
          renderAdvogadosEmLinhas(bloco, [], "Advogados da comunicacao: nao encontrados.");
        } else {
          renderAdvogadosEmLinhas(bloco, advs, "Advogados da comunicacao:");
        }
      }

      inserirBotaoCertidaoDepoisDoAdv(divDiario, () => {
        const st = divDiario[CFG.CERT_STATE_KEY];
        const texto = montarCertidaoTexto(st || {});
        abrirModalCertidao(texto);
      });
    } catch (e) {
      U.err("[ComunicaDJ] Erro API:", e);

      state.consultado = true;
      state.publicacaoEncontrada = false;
      state.advogados = [];
      state.partes = [];
      state.erro = "erro_api";

      renderAdvogadosEmLinhas(bloco, [], "Advogados da comunicacao: erro ao consultar a API.");

      inserirBotaoCertidaoDepoisDoAdv(divDiario, () => {
        const st = divDiario[CFG.CERT_STATE_KEY];
        const texto = montarCertidaoTexto(st || {});
        abrirModalCertidao(texto);
      });
    }
  }

  function processarItem(infoPPE) {
    const divDiario = acharDivDiario(infoPPE);
    if (!divDiario) return;

    const dataBR = lerDataDoDivDiario(divDiario);
    if (!dataBR) return;

    const dataIniISO = dataBRparaISO(dataBR);
    const dataFimISO = dataIniISO ? calcDataFimISO(dataIniISO) : null;
    const numeroProcesso = extrairNumeroProcessoDoItem(infoPPE) || extrairNumeroProcessoDoDOM();
    if (!dataIniISO || !dataFimISO || !numeroProcesso) return;

    const urlWeb = montarUrlComunicaWeb({ dataIniISO, dataFimISO, numeroProcesso });
    const urlApi = montarUrlComunicaApi({ dataIniISO, dataFimISO, numeroProcesso });

    const state = (divDiario[CFG.CERT_STATE_KEY] ||= {});
    state.numeroProcesso = numeroProcesso;

    aplicarBotoesInline(divDiario, {
      onOpenWeb: () => window.open(urlWeb, "_blank", "noopener"),
      onFetchAdv: () => { consultarApiEAtualizarEstado({ divDiario, urlApi, numeroProcesso }); },
    });
  }

  function apply() {
    try { U.qsa(CFG.ITEM_SELECTOR).forEach(processarItem); }
    catch (e) { Toast.failure(NAME, e, "apply"); }
  }

  function init() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fecharModal();
    });
  }

  return { NAME, init, apply };
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

