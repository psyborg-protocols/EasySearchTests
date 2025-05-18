/* --------------------------------------------------------------------------
   profitReport.js
   --------------------------------------------------------------------------
   Registers window.buildProfitReport(modalEl, reportId, topN = 5)
   – Generates a CSV ranking the top-N customers and products by profit.
   – Columns:   All-Time block  │  blank │  Year blocks (newest → oldest)
   – Rows   :   Customers 1-N   │ blank row │ Products 1-N
   -------------------------------------------------------------------------- */

window.buildProfitReport = function buildProfitReport (modalEl, reportId, topN = 5) {

  /* ---------- tiny helpers ---------- */
  const currency = v => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
  const pct      = frac => `${(frac * 100).toFixed(1)}%`;          // 0.274 → “27.4%”
  const parseDate = s => {
    if (typeof s !== 'string') return null;
    const [m, d, y] = s.split('/').map(t => +t.trim());
    return (m && d && y) ? new Date(y, m - 1, d) : null;
  };

  /* ---------- promise wrapper matches other reports ---------- */
  return new Promise((resolve, reject) => {
    const item = modalEl.querySelector(`#item-${reportId}`);
    if (!item) return reject({ reportId, error: 'list-item not found' });

    /* let the spinner show for a frame */
    setTimeout(() => {
      try {
        /* ---------- pull datasets ---------- */
        const salesDF = window.dataStore?.Sales?.dataframe || [];
        const dbDF    = window.dataStore?.DB?.dataframe    || [];

        if (!salesDF.length || !dbDF.length) {
          item.querySelector('.spinner-border')?.remove();
          item.insertAdjacentHTML(
            'beforeend',
            ' <small class="text-danger">(Sales and/or DB data missing)</small>'
          );
          return resolve({ reportId, status: 'error', message: 'no data' });
        }

        /* ---------- SKU → unit-cost map ---------- */
        const costBySku = dbDF.reduce((acc, r) => {
          const sku = r.PartNumber || r.Product_Service;
          const cost = +r.UnitCost || +r.Unit_Cost || 0;
          if (sku) acc[sku] = cost;
          return acc;
        }, {});

        /* ---------- loop through sales; compute profit per line ---------- */
        const rows = [];
        const skuDescriptions = {};          // { sku: { descr: count, … }, … }

        salesDF.forEach(r => {
          const dt  = parseDate(r.Date);
          if (!dt) return;                   // skip bad dates

          const sku = r.Product_Service;
          const qty = +r.Quantity || 1;
          const rev = +String(r.Total_Amount).replace(/\s/g, '') || 0;
          const cost = (costBySku[sku] || 0) * qty;
          const profit = rev - cost;

          if (!isFinite(profit)) return;

          /* track the description text frequency for each SKU */
          const descr = r.Memo_Description || r.Description || '';
          if (sku) {
            const bucket = skuDescriptions[sku] ||= {};
            bucket[descr] = (bucket[descr] || 0) + 1;
          }

          rows.push({
            year    : dt.getFullYear(),
            customer: r.Customer,
            sku,
            profit
          });
        });

        if (!rows.length) {
          item.querySelector('.spinner-border')?.remove();
          item.insertAdjacentHTML('beforeend', ' <small class="text-muted">(No calculable profit rows)</small>');
          return resolve({ reportId, status: 'success', message: 'empty' });
        }

        /* ---------- pick ONE display description per SKU (most common) ---------- */
        const labelForSku = {};
        Object.entries(skuDescriptions).forEach(([sku, counts]) => {
          const best = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
          labelForSku[sku] = best ? `${sku}: ${best}` : sku;
        });

        /* ---------- handy aggregators ---------- */
        function topBy (bucketKey, yearFilter = null) {
          const totals = {};                         // name → profit
          rows.forEach(r => {
            if (yearFilter !== null && r.year !== yearFilter) return;

            const key = bucketKey === 'customer'
              ? (r.customer || '(no customer)')
              : (labelForSku[r.sku] || r.sku || '(no SKU)');

            totals[key] = (totals[key] || 0) + r.profit;
          });

          /* convert to sorted list of { label, total } */
          return Object.entries(totals)
                       .sort((a, b) => b[1] - a[1])
                       .slice(0, topN)
                       .map(([label, total]) => ({ label, total }));
        }

        /* ---------- time scopes ---------- */
        const years = [...new Set(rows.map(r => r.year))].sort((a, b) => b - a); // newest first
        const companyTotalAll = rows.reduce((a, r) => a + r.profit, 0);

        /* overall (all-time) */
        const overallCust = topBy('customer');
        const overallProd = topBy('product');

        /* per-year results & company totals */
        const custByYear   = {};
        const prodByYear   = {};
        const companyByYear = {};

        years.forEach(y => {
          custByYear[y]   = topBy('customer', y);
          prodByYear[y]   = topBy('product' , y);
          companyByYear[y] = rows.filter(r => r.year === y)
                                 .reduce((a, r) => a + r.profit, 0);
        });

        /* ---------- header row ---------- */
        const header = [
          'All-Time Customer/Product',
          'All-Time Profit',
          'All-Time % of Profit',
          ''   // blank column after all-time block
        ];
        years.forEach((y, idx) => {
          header.push(
            `${y} Customer/Product`,
            `${y} Profit`,
            `${y} % of Profit`
          );
          if (idx < years.length - 1) header.push('');   // blank between year blocks
        });

        /* ---------- section builder (customers then products) ---------- */
        function makeSection (overallArr, yearlyDict) {
          const out = [];
          for (let i = 0; i < topN; i++) {
            const row = [];

            /* ---- all-time block ---- */
            const o = overallArr[i] || {};
            row.push(
              o.label || '',
              o.label ? currency(o.total) : '',
              o.label ? pct(o.total / companyTotalAll) : '',
              ''       // blank between all-time and first year block
            );

            /* ---- one block per year ---- */
            years.forEach((y, idx) => {
              const v   = yearlyDict[y][i] || {};
              const den = companyByYear[y] || 0;
              row.push(
                v.label || '',
                v.label ? currency(v.total) : '',
                (v.label && den) ? pct(v.total / den) : ''
              );
              if (idx < years.length - 1) row.push('');   // blank between year blocks
            });

            out.push(row);
          }
          return out;
        }

        const csvRows = [
          header,
          ...makeSection(overallCust, custByYear),
          [],  // blank row between customers & products
          ...makeSection(overallProd, prodByYear)
        ];

        /* ---------- CSV stringify ---------- */
        const toCSV = arr =>
          arr.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
             .join('\n');
        const csv = toCSV(csvRows);

        /* ---------- UI finish ---------- */
        item.querySelector('.spinner-border')?.remove();
        if (csv) {
          const btn = document.createElement('button');
          btn.className = 'report-download-btn';
          btn.title = 'Download Profit Report';
          btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#5f6368">
              <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>`;
          btn.onclick = () =>
            saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'profit_report.csv');
          item.appendChild(btn);
        } else {
          item.insertAdjacentHTML('beforeend', ' <small class="text-muted">(No profit rows)</small>');
        }

        resolve({ reportId, status: 'success', lines: csvRows.length });

      } catch (err) {
        console.error('Profit report error', err);
        item.querySelector('.spinner-border')?.remove();
        item.insertAdjacentHTML('beforeend', ' <small class="text-danger">(Error)</small>');
        reject({ reportId, error: err });
      }
    }, 0);    // end setTimeout
  });         // end Promise
};
