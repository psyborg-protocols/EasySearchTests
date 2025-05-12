/* reports.js */

// ─── PART 1: report builders ─────────────────────────────────────────────────

(function () {
  if (!window.dataStore) { console.error("dataStore missing"); return; }
  const { Sales, DB } = window.dataStore;
  if (!Sales?.dataframe || !DB?.dataframe) return;

  const parseDate = d => new Date(d);
  const daysDiff  = (a,b) => (b - a) / 86_400_000;
  const median    = arr => {
    const a = [...arr].sort((x,y)=>x-y);
    const m = a.length/2|0;
    return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
  };

  function buildLapsedCustomers(daysCutoff = 180) {
    const map = {};
    Sales.dataframe.forEach(r => {
      const c  = String(r.Customer).trim();
      const dt = parseDate(r.Date);
      (map[c] ||= []).push(dt);
    });
    const today = new Date(), rows = [];
    Object.entries(map).forEach(([cust, dates]) => {
      dates.sort((x,y)=>x-y);
      const gaps = dates.slice(1).map((d,i)=>daysDiff(dates[i], d));
      const medGap = gaps.length ? median(gaps) : null;
      const lastDt = dates.at(-1);
      const daysSince = daysDiff(lastDt, today);
      if (medGap && daysSince > medGap && daysSince >= daysCutoff) {
        rows.push({
          Customer: cust,
          LastOrder: lastDt.toISOString().slice(0,10),
          DaysSinceLast: Math.round(daysSince),
          ExpectedCadence: Math.round(medGap)
        });
      }
    });
    return rows.sort((a,b)=>b.DaysSinceLast - a.DaysSinceLast);
  }

  function buildSilentProducts(dropPct=20, lookBackYears=3) {
    const revBySkuYear = {};
    Sales.dataframe.forEach(r => {
      const sku = String(r.Product_Service).trim();
      const yr  = parseDate(r.Date).getFullYear();
      const key = sku + "|" + yr;
      revBySkuYear[key] = (revBySkuYear[key]||0) + Number(r.Total_Amount||0);
    });
    const thisYear = new Date().getFullYear();
    const baseYears = Array.from({length:lookBackYears},(_,i)=>thisYear-lookBackYears+i);
    const rows = [];
    new Set(Sales.dataframe.map(r=>String(r.Product_Service).trim()))
      .forEach(sku => {
        const hist = baseYears.map(y=>revBySkuYear[sku+"|"+y]||0);
        const peak = Math.max(...hist);
        const now  = revBySkuYear[sku+"|"+thisYear]||0;
        if (peak>0) {
          const pct = (peak-now)/peak*100;
          if (pct>=dropPct) {
            rows.push({
              Product: sku,
              PeakYearRevenue: peak,
              CurrentYearRevenue: now,
              PercentDrop: Math.round(pct)
            });
          }
        }
      });
    return rows.sort((a,b)=>(a.CurrentYearRevenue - a.PeakYearRevenue)
                             - (b.CurrentYearRevenue - b.PeakYearRevenue));
  }

  function buildProfitLeaderboard(topN=5) {
    const costMap = {};
    DB.dataframe.forEach(r => costMap[String(r.PartNumber).trim()] = Number(r.UnitCost||0));
    const custAgg = {}, prodAgg = {};
    Sales.dataframe.forEach(r => {
      const sku = String(r.Product_Service).trim();
      const cust= String(r.Customer).trim();
      const qty = Number(r.Quantity||0);
      const rev = Number(r.Total_Amount||0);
      const cost= costMap[sku]||0;
      const prf = rev - qty*cost;
      custAgg[cust] = (custAgg[cust]||0) + prf;
      prodAgg[sku]  = (prodAgg[sku] ||0) + prf;
    });
    const topCust = Object.entries(custAgg)
                     .sort((a,b)=>b[1]-a[1]).slice(0,topN)
                     .map(([Customer,Profit])=>({Customer,Profit}));
    const topProd = Object.entries(prodAgg)
                     .sort((a,b)=>b[1]-a[1]).slice(0,topN)
                     .map(([Product,Profit])=>({Product,Profit}));
    return {topCust, topProd};
  }

  window.reports = { buildLapsedCustomers, buildSilentProducts, buildProfitLeaderboard };
})();


// ─── PART 2: UI & CSV download ────────────────────────────────────────────────

(function(){
  if (!window.reports) return;
  const modalEl = document.getElementById('reportsModal');
  const bsModal = new bootstrap.Modal(modalEl);

  const items = {
    lapsed: { id:'item-lapsed', fn:'buildLapsedCustomers', file:'lapsed_customers.csv' },
    silent: { id:'item-silent', fn:'buildSilentProducts',  file:'silent_products.csv' },
    profit: { id:'item-profit', fn:'buildProfitLeaderboard', file:null }
  };

  function toCSV(rows) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc  = v => `"${String(v).replace(/"/g,'""')}"`;
    return [cols.join(',')]
      .concat(rows.map(r=>cols.map(c=>esc(r[c])).join(','))).join('\n');
  }

  function makeBtn(txt, onClick) {
    const b = document.createElement('button');
    b.className = 'btn btn-sm btn-success me-2';
    b.textContent = txt;
    b.onclick = onClick;
    return b;
  }

  document.getElementById('btnGenerateReports').onclick = () => {
    const footer = modalEl.querySelector('.modal-footer');
    footer.innerHTML = '';
    Object.values(items).forEach(it =>
      modalEl.querySelector(`#${it.id} .spinner-border`).classList.remove('d-none')
    );
    bsModal.show();

    // small delays to let spinner render
    Object.entries(items).forEach(([key,it], idx) => {
      setTimeout(() => {
        const result = window.reports[it.fn]();
        if (key==='profit') {
          const {topCust, topProd} = result;
          const b1 = new Blob([toCSV(topCust)], {type:'text/csv'});
          const b2 = new Blob([toCSV(topProd)], {type:'text/csv'});
          footer.appendChild(makeBtn('Download Top Customers', ()=>saveAs(b1,'top_customers.csv')));
          footer.appendChild(makeBtn('Download Top Products',  ()=>saveAs(b2,'top_products.csv')));
        } else {
          const blob = new Blob([toCSV(result)], {type:'text/csv'});
          footer.appendChild(makeBtn(
            `Download ${idx===0?'Inactive':'Quiet'} List`,
            ()=>saveAs(blob, it.file)
          ));
        }
        modalEl.querySelector(`#${it.id} .spinner-border`).classList.add('d-none');
      }, (idx+1)*150);
    });
  };
})();
