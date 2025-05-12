/* reports.js  –  ALL reporting logic + modal driver + CSV downloader
   ---------------------------------------------------------------
   DEPENDS ON:
     – window.dataStore  (populated by your existing dataLoader.js)  :contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1}
     – FileSaver.min.js  (saveAs global)
     – Bootstrap JS      (for modal)
*/

window.initReports = function initReports() {
  /* =============  GUARDS  ============= */
  if (!window.dataStore) {
    console.error("[reports] dataStore missing – reports disabled");
    return;
  }
  const { Sales, DB } = window.dataStore;
  if (!Sales?.dataframe || !DB?.dataframe) {
    console.error("[reports] Sales / DB sheets not loaded – reports disabled");
    return;
  }
  console.debug("[reports] Data sheets ready; rows:", {
    sales: Sales.dataframe.length,
    db:    DB.dataframe.length
  });

  /* =============  UTILS  ============= */
  const parseDate  = d => new Date(d);
  const daysDiff   = (d1, d2) => (d2 - d1) / 86_400_000; // ms→days
  const median = arr => {
    const a = [...arr].sort((x, y) => x - y);
    const m = a.length / 2 | 0;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const toCSV = rows => {
    if (!rows.length) return "";
    const cols = Object.keys(rows[0]);
    const esc  = v => `"${String(v).replace(/"/g, '""')}"`;
    return [cols.join(",")]
      .concat(rows.map(r => cols.map(c => esc(r[c])).join(",")))
      .join("\n");
  };
  const dl = (filename, rows) => {
    saveAs(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }), filename);
  };

  /* =============  REPORT BUILDERS  ============= */
  function buildLapsedCustomers(daysCutoff = 180) {
    console.debug("[reports] Building Lapsed-Customers…");
    const map = {};
    Sales.dataframe.forEach(r => {
      const c  = String(r.Customer).trim();
      const dt = parseDate(r.Date);
      (map[c] ||= []).push(dt);
    });
    const rows  = [];
    const today = new Date();
    Object.entries(map).forEach(([cust, dates]) => {
      dates.sort((a, b) => a - b);
      const gaps  = dates.slice(1).map((d, i) => daysDiff(dates[i], d));
      const medGap = gaps.length ? median(gaps) : null;
      const lastDt = dates[dates.length - 1];
      const since  = daysDiff(lastDt, today);
      if (medGap && since > medGap && since >= daysCutoff) {
        rows.push({
          Customer: cust,
          LastOrder: lastDt.toISOString().slice(0, 10),
          DaysSinceLast: Math.round(since),
          ExpectedCadence: Math.round(medGap)
        });
      }
    });
    console.log(`[reports] Lapsed-Customers built (${rows.length} rows)`);
    return rows.sort((a, b) => b.DaysSinceLast - a.DaysSinceLast);
  }

  function buildSilentProducts(dropPct = 20, lookBackYears = 3) {
    console.debug("[reports] Building Silent-Products…");
    const revBySkuYear = {};
    Sales.dataframe.forEach(r => {
      const sku  = String(r.Product_Service).trim();
      const yr   = parseDate(r.Date).getFullYear();
      const key  = sku + "|" + yr;
      revBySkuYear[key] = (revBySkuYear[key] || 0) + Number(r.Total_Amount || 0);
    });
    const thisYear  = new Date().getFullYear();
    const baseYears = [];
    for (let y = thisYear - lookBackYears; y < thisYear; y++) baseYears.push(y);
    const rows = [];
    const skus = new Set(Sales.dataframe.map(r => String(r.Product_Service).trim()));
    skus.forEach(sku => {
      const hist    = baseYears.map(y => revBySkuYear[sku + "|" + y] || 0);
      const baseMax = Math.max(...hist);
      const thisRev = revBySkuYear[sku + "|" + thisYear] || 0;
      if (!baseMax) return;
      const pctDrop = ((baseMax - thisRev) / baseMax) * 100;
      if (pctDrop >= dropPct) {
        rows.push({
          Product: sku,
          PeakYearRevenue: baseMax,
          CurrentYearRevenue: thisRev,
          PercentDrop: Math.round(pctDrop)
        });
      }
    });
    console.log(`[reports] Silent-Products built (${rows.length} rows)`);
    return rows.sort((a, b) =>
      (a.CurrentYearRevenue - a.PeakYearRevenue) -
      (b.CurrentYearRevenue - b.PeakYearRevenue)
    );
  }

  function buildProfitLeaderboard(topN = 5) {
    console.debug("[reports] Building Profit-Leaderboard…");
    const costMap = {};
    DB.dataframe.forEach(r => {
      costMap[String(r.PartNumber).trim()] = Number(r.UnitCost || 0);
    });
    const custAgg = {}, prodAgg = {};
    Sales.dataframe.forEach(r => {
      const sku   = String(r.Product_Service).trim();
      const cust  = String(r.Customer).trim();
      const qty   = Number(r.Quantity || 0);
      const rev   = Number(r.Total_Amount || 0);
      const cost  = costMap[sku] ?? 0;
      const profit = rev - qty * cost;
      custAgg[cust] = (custAgg[cust] || 0) + profit;
      prodAgg[sku]  = (prodAgg[sku]  || 0) + profit;
    });
    const topCust = Object.entries(custAgg)
      .sort((a, b) => b[1] - a[1]).slice(0, topN)
      .map(([Customer, Profit]) => ({ Customer, Profit }));
    const topProd = Object.entries(prodAgg)
      .sort((a, b) => b[1] - a[1]).slice(0, topN)
      .map(([Product, Profit]) => ({ Product, Profit }));
    console.log("[reports] Profit-Leaderboard built");
    return { topCust, topProd };
  }

  /* expose builders for dev console */
  window.reports = { buildLapsedCustomers, buildSilentProducts, buildProfitLeaderboard };

  /* =============  MODAL / UI DRIVER  ============= */
  const modalEl   = document.getElementById("reportsModal");
  const btnGen    = document.getElementById("btnGenerateReports");
  if (!modalEl || !btnGen) {
    console.error("[reports] Modal or trigger button missing in HTML");  // design-time hint
    return;
  }
  const bsModal   = new bootstrap.Modal(modalEl);
  const footer    = modalEl.querySelector(".modal-footer");
  const spinnerOf = id => modalEl.querySelector(`#${id} .spinner-border`);
  const makeBtn   = (label, blob, file) => {
    const b = document.createElement("button");
    b.className = "btn btn-sm btn-success me-2";
    b.textContent = label;
    b.onclick = () => saveAs(blob, file);
    return b;
  };

  btnGen.onclick = () => {
    console.debug("[reports] Generate-Reports clicked");
    footer.innerHTML = "";                 // reset downloads
    ["item-lapsed", "item-silent", "item-profit"].forEach(id =>
      spinnerOf(id).classList.remove("d-none")
    );
    bsModal.show();

    /* 1. Lapsed customers */
    setTimeout(() => {
      const rows  = buildLapsedCustomers();
      const blob  = new Blob([toCSV(rows)], { type: "text/csv" });
      footer.appendChild(makeBtn("Download Inactive", blob, "lapsed_customers.csv"));
      spinnerOf("item-lapsed").classList.add("d-none");
    }, 50);

    /* 2. Silent products */
    setTimeout(() => {
      const rows  = buildSilentProducts();
      const blob  = new Blob([toCSV(rows)], { type: "text/csv" });
      footer.appendChild(makeBtn("Download Quiet SKUs", blob, "silent_products.csv"));
      spinnerOf("item-silent").classList.add("d-none");
    }, 150);

    /* 3. Profit leaderboard */
    setTimeout(() => {
      const { topCust, topProd } = buildProfitLeaderboard();
      footer.appendChild(
        makeBtn("Download Top Customers",
          new Blob([toCSV(topCust)], { type: "text/csv" }),
          "top_customers.csv")
      );
      footer.appendChild(
        makeBtn("Download Top Products",
          new Blob([toCSV(topProd)], { type: "text/csv" }),
          "top_products.csv")
      );
      spinnerOf("item-profit").classList.add("d-none");
    }, 250);
  };

  console.debug("[reports] Modal driver attached");
};
