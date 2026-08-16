// ============================================================================
// INVENTORY TRANSITION MODULE (Access -> Odoo)
// ----------------------------------------------------------------------------
// Standalone, temporary module used while inventory management moves from the
// old Access DB export to Odoo. While this module is loaded it:
//
//   1. Shows a banner explaining that live inventory now lives in Odoo.
//   2. Replaces any on-hand / inventory figure the app renders with
//      "Check Odoo", so nobody trusts the stale spreadsheet numbers.
//   3. Shows the list of stock moves that were still pending in Access at
//      cutover (seeded in transition-data.js). Searching for a part that has
//      pending moves shows them, with running totals, right in the inventory
//      cell - and the full checklist lives in its own panel where each move
//      can be checked off as it actually ships / arrives.
//   4. Persists the check-off state to a small JSON file in the signed-in
//      user's OneDrive (created automatically on first use), so state
//      survives refreshes, new sessions and redeploys.
//
// REMOVAL: see src/transition/README.md - delete this folder, remove the
// marked script block from index.html and revert the marked scope change in
// src/auth.js. Nothing else in the app depends on this module.
// ============================================================================

(function () {
  "use strict";

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------
  var CONFIG = {
    // Master switch. Set to false to disable the module without removing it.
    enabled: true,

    // Where check-off state is stored, relative to the drive root. 
    // Created automatically if it does not exist.
    stateFolder: "Brandywine Collaborate Team Site Folder/Inventory",
    stateFileName: "pending-adjustments-state.json",

    // Shared document library to share one checklist between several users.
    driveId: "b!XkahBxqjN0Ssog7-Ybfyxhy9GkvGCHRFs1BlQ3ah6VTHnmI16yPPQofBa949Ai-j",

    // Optional: URL of your Odoo inventory page. When set, "Check Odoo"
    // becomes a link that opens it in a new tab.
    odooUrl: "https://brandywine-materials.odoo.com/odoo/products?view_type=list",

    // How the module finds inventory cells rendered by the app: for each row
    // of the tables matched by tableSelector, the text of column
    // partColumnIndex is treated as the part number and the contents of
    // column inventoryColumnIndex are replaced.
    tableSelector: "#productTable",
    partColumnIndex: 0,
    inventoryColumnIndex: 2
  };

  var GRAPH_BASE = "https://graph.microsoft.com/v1.0";

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  var seed = (window.TRANSITION_SEED && window.TRANSITION_SEED.adjustments) || [];
  // doneMap: { [adjustmentId]: { doneAt: ISO string, doneBy: username } }
  var doneMap = {};
  var stateLoaded = false;
  var saveInFlight = false;
  var saveQueued = false;
  var panelFilter = "";
  var showCompleted = false;

  function normalizePart(s) {
    return String(s || "").trim().toUpperCase().replace(/\s+/g, " ");
  }

  function itemsForPart(partNumber) {
    var key = normalizePart(partNumber);
    return seed.filter(function (a) { return normalizePart(a.partNumber) === key; });
  }

  function openItemsForPart(partNumber) {
    return itemsForPart(partNumber).filter(function (a) { return !doneMap[a.id]; });
  }

  function totals(items) {
    var t = { inQty: 0, outQty: 0, count: items.length };
    items.forEach(function (a) {
      if (a.type === "in") t.inQty += a.qty; else t.outQty += a.qty;
    });
    t.net = t.inQty - t.outQty;
    return t;
  }

  function fmtQty(n) { return Number(n).toLocaleString("en-US"); }

  // --------------------------------------------------------------------------
  // Auth + Microsoft Graph persistence
  // --------------------------------------------------------------------------
  // msalInstance is created in src/auth.js; access it defensively so the
  // module never breaks the page if MSAL failed to load.
  function getMsal() {
    try { return typeof msalInstance !== "undefined" ? msalInstance : null; }
    catch (e) { return null; }
  }

  function getAccount() {
    var m = getMsal();
    if (!m) return null;
    try {
      var accounts = m.getAllAccounts();
      return accounts && accounts.length ? accounts[0] : null;
    } catch (e) { return null; }
  }

  async function getGraphToken() {
    var m = getMsal();
    var account = getAccount();
    if (!m || !account) throw new Error("Not signed in");
    var request = { scopes: ["Files.ReadWrite"], account: account };
    try {
      return (await m.acquireTokenSilent(request)).accessToken;
    } catch (e) {
      // Silent acquisition can fail on first use (consent) - fall back to popup.
      return (await m.acquireTokenPopup(request)).accessToken;
    }
  }

  function stateFileUrl(suffix) {
    var base = CONFIG.driveId
      ? GRAPH_BASE + "/drives/" + encodeURIComponent(CONFIG.driveId) + "/root:"
      : GRAPH_BASE + "/me/drive/root:";
    var path = "/" + CONFIG.stateFolder + "/" + CONFIG.stateFileName;
    return base + encodeURI(path) + ":" + suffix;
  }

  async function loadState() {
    var token = await getGraphToken();
    var res = await fetch(stateFileUrl("/content"), {
      headers: { Authorization: "Bearer " + token }
    });
    if (res.status === 404) {
      // First use: create the state file so it shows up in OneDrive right away.
      doneMap = {};
      await persistState();
      return;
    }
    if (!res.ok) throw new Error("Graph read failed: " + res.status);
    var data = await res.json();
    doneMap = (data && data.items) || {};
  }

  async function persistState() {
    var token = await getGraphToken();
    var body = JSON.stringify({
      version: 1,
      app: "BWEasySearch inventory transition module",
      note: "Check-off state for pending Access->Odoo stock moves. Safe to delete once the transition is finished.",
      seedGeneratedAt: window.TRANSITION_SEED && window.TRANSITION_SEED.generatedAt,
      updatedAt: new Date().toISOString(),
      items: doneMap
    }, null, 2);
    var res = await fetch(stateFileUrl("/content"), {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: body
    });
    if (!res.ok) throw new Error("Graph write failed: " + res.status);
  }

  // Serialized save with a simple status indicator; re-runs if changes queued
  // up while a save was in flight. Last write wins.
  async function saveState() {
    if (saveInFlight) { saveQueued = true; return; }
    saveInFlight = true;
    setSaveStatus("saving");
    try {
      await persistState();
      setSaveStatus("saved");
    } catch (e) {
      console.error("Transition module: failed to save state", e);
      setSaveStatus("error");
    }
    saveInFlight = false;
    if (saveQueued) { saveQueued = false; saveState(); }
  }

  // --------------------------------------------------------------------------
  // UI - banner
  // --------------------------------------------------------------------------
  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function checkOdooHtml() {
    if (CONFIG.odooUrl) {
      return '<a href="' + escapeHtml(CONFIG.odooUrl) + '" target="_blank" rel="noopener">Check Odoo</a>';
    }
    return '<strong>Check Odoo</strong>';
  }

  function buildBanner() {
    var banner = el("div", {
      id: "transitionBanner",
      class: "alert alert-warning d-flex justify-content-between align-items-center flex-wrap mb-0",
      role: "alert"
    });
    banner.innerHTML =
      '<div><strong>Inventory transition in progress.</strong> ' +
      'Live on-hand counts now live in Odoo' +
      'Moves that were still pending in the old system are tracked below.</div>' +
      '<div class="mt-1"><span id="transitionOpenCount" class="badge bg-warning text-dark me-2"></span>' +
      '<a href="#transitionPanel" class="alert-link">View pending adjustments</a></div>';
    return banner;
  }

  // --------------------------------------------------------------------------
  // UI - pending adjustments panel
  // --------------------------------------------------------------------------
  function buildPanel() {
    var panel = el("div", { id: "transitionPanel", class: "card bg-white p-4 rounded shadow mt-4" });
    panel.innerHTML =
      '<div class="d-flex justify-content-between align-items-center flex-wrap mb-2">' +
      '  <h4 class="mb-0">Pending Inventory Adjustments <small class="text-muted fs-6">(Access &rarr; Odoo transition)</small></h4>' +
      '  <span id="transitionSaveStatus" class="text-muted small"></span>' +
      '</div>' +
      '<p class="text-muted small mb-3">These stock moves were still open in the old Access system at cutover and are ' +
      '<em>not</em> reflected in Odoo\'s starting inventory. When one actually ships or arrives, record it in Odoo and check it off here.</p>' +
      '<div class="row g-2 mb-3">' +
      '  <div class="col-md-5"><input type="text" id="transitionSearch" class="form-control" placeholder="Filter by part, order ref..."></div>' +
      '  <div class="col-md-7 d-flex align-items-center gap-3">' +
      '    <div class="form-check"><input class="form-check-input" type="checkbox" id="transitionShowDone">' +
      '    <label class="form-check-label" for="transitionShowDone">Show completed</label></div>' +
      '    <span id="transitionCounts" class="text-muted small"></span>' +
      '  </div>' +
      '</div>' +
      '<div class="table-responsive" style="max-height: 420px;">' +
      '  <table class="table table-bordered table-sm align-middle">' +
      '    <thead class="table-light" style="position: sticky; top: 0;"><tr>' +
      '      <th style="width:4rem;">Done</th><th>Type</th><th>Part</th><th class="text-end">Qty</th>' +
      '      <th>Order Ref</th><th>Order Date</th><th>Expected</th>' +
      '    </tr></thead>' +
      '    <tbody id="transitionTableBody"></tbody>' +
      '  </table>' +
      '</div>' +
      '<div id="transitionSignInHint" class="text-muted small" style="display:none;">' +
      'Sign in to load and save check-off progress (stored in OneDrive).</div>';
    return panel;
  }

  function matchesFilter(a) {
    if (!panelFilter) return true;
    var hay = (a.partNumber + " " + (a.description || "") + " " + (a.orderRef || "") + " " + (a.custPO || "")).toUpperCase();
    return panelFilter.toUpperCase().split(/\s+/).every(function (term) {
      return hay.indexOf(term) !== -1;
    });
  }

  function renderPanel() {
    var tbody = document.getElementById("transitionTableBody");
    if (!tbody) return;

    var visible = seed.filter(function (a) {
      if (!showCompleted && doneMap[a.id]) return false;
      return matchesFilter(a);
    });

    // Group by part number, keep alphabetical order (seed is pre-sorted).
    var groups = {};
    var order = [];
    visible.forEach(function (a) {
      var key = normalizePart(a.partNumber);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(a);
    });

    var html = "";
    order.forEach(function (key) {
      var items = groups[key];
      var open = items.filter(function (a) { return !doneMap[a.id]; });
      var t = totals(open);
      var partLabel = escapeHtml(items[0].partNumber);
      var desc = escapeHtml(items[0].description || "");
      var summary = [];
      if (t.inQty) summary.push('<span class="text-success">+' + fmtQty(t.inQty) + " incoming</span>");
      if (t.outQty) summary.push('<span class="text-danger">&minus;' + fmtQty(t.outQty) + " outgoing</span>");
      var net = t.count ? " &middot; net " + (t.net >= 0 ? "+" : "&minus;") + fmtQty(Math.abs(t.net)) : "all done";
      html += '<tr class="table-secondary"><td colspan="7"><strong>' + partLabel + "</strong>" +
        (desc ? ' <span class="text-muted">&mdash; ' + desc + "</span>" : "") +
        ' <span class="small ms-2">' + (summary.length ? summary.join(" / ") + net : "all done") + "</span></td></tr>";

      items.forEach(function (a) {
        var done = !!doneMap[a.id];
        var typeBadge = a.type === "in"
          ? '<span class="badge bg-success">IN</span>'
          : '<span class="badge bg-danger">OUT</span>';
        var doneInfo = done && doneMap[a.id].doneAt
          ? '<div class="small text-muted">' + escapeHtml(String(doneMap[a.id].doneAt).slice(0, 10)) + "</div>" : "";
        html += '<tr class="' + (done ? "text-decoration-line-through text-muted" : "") + '">' +
          '<td class="text-center"><input type="checkbox" class="form-check-input transition-check" data-adj-id="' +
          escapeHtml(a.id) + '"' + (done ? " checked" : "") + ">" + doneInfo + "</td>" +
          "<td>" + typeBadge + "</td>" +
          "<td>" + escapeHtml(a.partNumber) + "</td>" +
          '<td class="text-end">' + (a.type === "in" ? "+" : "&minus;") + fmtQty(a.qty) + "</td>" +
          "<td>" + escapeHtml(a.orderRef || "") + (a.custPO ? ' <span class="text-muted small">(' + escapeHtml(a.custPO) + ")</span>" : "") + "</td>" +
          "<td>" + escapeHtml(a.orderDate || "") + "</td>" +
          "<td>" + escapeHtml(a.expectedDate || "") + "</td>" +
          "</tr>";
      });
    });

    if (!html) {
      html = '<tr><td colspan="7" class="text-center text-muted py-3">' +
        (seed.length ? "No pending adjustments match." : "No pending adjustments.") + "</td></tr>";
    }
    tbody.innerHTML = html;

    var openCount = seed.filter(function (a) { return !doneMap[a.id]; }).length;
    var counts = document.getElementById("transitionCounts");
    if (counts) counts.textContent = openCount + " open / " + (seed.length - openCount) + " done";
    var bannerCount = document.getElementById("transitionOpenCount");
    if (bannerCount) bannerCount.textContent = openCount + " pending adjustment" + (openCount === 1 ? "" : "s");
    var hint = document.getElementById("transitionSignInHint");
    if (hint) hint.style.display = getAccount() ? "none" : "";

    // Re-decorate any product rows already on screen (totals may have changed).
    redecorateInventoryCells();
  }

  function setSaveStatus(status) {
    var node = document.getElementById("transitionSaveStatus");
    if (!node) return;
    if (status === "saving") { node.className = "text-muted small"; node.textContent = "Saving…"; }
    else if (status === "saved") { node.className = "text-success small"; node.textContent = "✓ Saved to OneDrive"; }
    else if (status === "error") {
      node.className = "text-danger small";
      node.innerHTML = 'Save failed &mdash; <a href="#" id="transitionRetrySave">retry</a>';
      var retry = document.getElementById("transitionRetrySave");
      if (retry) retry.addEventListener("click", function (e) { e.preventDefault(); saveState(); });
    } else { node.textContent = ""; }
  }

  function onToggle(id, checked) {
    if (checked) {
      var account = getAccount();
      doneMap[id] = { doneAt: new Date().toISOString(), doneBy: account ? account.username : "unknown" };
    } else {
      delete doneMap[id];
    }
    renderPanel();
    if (getAccount()) saveState();
    else setSaveStatus("error");
  }

  // --------------------------------------------------------------------------
  // UI - intercept inventory cells rendered by the app
  // --------------------------------------------------------------------------
  function decorateRow(tr) {
    var cells = tr.children;
    if (cells.length <= Math.max(CONFIG.partColumnIndex, CONFIG.inventoryColumnIndex)) return;
    if (cells[CONFIG.partColumnIndex].tagName === "TH") return; // header row
    var part = cells[CONFIG.partColumnIndex].textContent;
    if (!normalizePart(part)) return;

    var invCell = cells[CONFIG.inventoryColumnIndex];
    invCell.setAttribute("data-transition-part", normalizePart(part));

    var open = openItemsForPart(part);
    var html = checkOdooHtml();
    if (open.length) {
      var t = totals(open);
      var bits = [];
      if (t.inQty) bits.push("+" + fmtQty(t.inQty) + " in");
      if (t.outQty) bits.push("&minus;" + fmtQty(t.outQty) + " out");
      html += '<br><a href="#transitionPanel" class="badge bg-warning text-dark text-decoration-none transition-part-badge" ' +
        'data-part="' + escapeHtml(part.trim()) + '" title="Pending moves not yet in Odoo - click for details">' +
        open.length + " pending: " + bits.join(" / ") + "</a>";
    }
    // Only write when the content actually changes - our own rewrites fire the
    // MutationObserver, and an unconditional write would loop forever. Compare
    // against what we last wrote (the browser re-serializes innerHTML, so
    // reading it back would never match the source string).
    if (lastWrittenHtml.get(invCell) !== html) {
      lastWrittenHtml.set(invCell, html);
      invCell.innerHTML = html;
    }
  }
  var lastWrittenHtml = new WeakMap();

  function redecorateInventoryCells() {
    document.querySelectorAll(CONFIG.tableSelector + " tr").forEach(decorateRow);
  }

  function watchInventoryTable() {
    var target = document.querySelector(CONFIG.tableSelector);
    if (!target) return;
    var scheduled = false;
    var observer = new MutationObserver(function (mutations) {
      // Only react to structural changes (rows added), not to our own cell
      // rewrites, and coalesce bursts into one pass per frame.
      var structural = mutations.some(function (m) { return m.type === "childList"; });
      if (!structural || scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        redecorateInventoryCells();
      });
    });
    observer.observe(target, { childList: true, subtree: true });
    redecorateInventoryCells();
  }

  // --------------------------------------------------------------------------
  // Wiring
  // --------------------------------------------------------------------------
  function onSignedIn() {
    if (stateLoaded) return;
    stateLoaded = true;
    loadState().then(renderPanel).catch(function (e) {
      stateLoaded = false; // allow retry on next sign-in event
      console.error("Transition module: could not load state from OneDrive", e);
      setSaveStatus("error");
    });
  }

  function init() {
    if (!CONFIG.enabled) return;

    var container = document.querySelector(".container") || document.body;
    var header = container.firstElementChild;
    var banner = buildBanner();
    if (header && header.nextSibling) container.insertBefore(banner, header.nextSibling);
    else container.appendChild(banner);
    container.appendChild(buildPanel());

    document.getElementById("transitionSearch").addEventListener("input", function (e) {
      panelFilter = e.target.value; renderPanel();
    });
    document.getElementById("transitionShowDone").addEventListener("change", function (e) {
      showCompleted = e.target.checked; renderPanel();
    });
    document.getElementById("transitionTableBody").addEventListener("change", function (e) {
      var box = e.target.closest(".transition-check");
      if (box) onToggle(box.getAttribute("data-adj-id"), box.checked);
    });
    // Clicking a pending badge in the product table filters the panel to that part.
    document.addEventListener("click", function (e) {
      var badge = e.target.closest(".transition-part-badge");
      if (!badge) return;
      var search = document.getElementById("transitionSearch");
      search.value = badge.getAttribute("data-part");
      panelFilter = search.value;
      showCompleted = false;
      var showDone = document.getElementById("transitionShowDone");
      if (showDone) showDone.checked = false;
      renderPanel();
    });

    renderPanel();
    watchInventoryTable();

    // Load persisted state once signed in - now if a session is cached,
    // otherwise when the login completes.
    if (getAccount()) onSignedIn();
    var m = getMsal();
    if (m && m.addEventCallback) {
      m.addEventCallback(function (event) {
        if (event && (event.eventType === "msal:loginSuccess" ||
                      event.eventType === "msal:acquireTokenSuccess")) {
          onSignedIn();
        }
      });
    }
  }

  // Public API for the rest of the app (and the browser console).
  window.InventoryTransition = {
    isActive: function () { return CONFIG.enabled; },
    getPendingForPart: function (partNumber) { return openItemsForPart(partNumber); },
    getTotalsForPart: function (partNumber) { return totals(openItemsForPart(partNumber)); },
    refresh: renderPanel,
    config: CONFIG
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
