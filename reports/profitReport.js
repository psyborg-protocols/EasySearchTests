/* --------------------------------------------------------------------------
   profitReport.js – fixed numeric parsing
   -------------------------------------------------------------------------- */

window.buildProfitReport = function buildProfitReport (modalEl, reportId, topN = 5) {

  /* ---------- helpers ---------- */
  const currency = v => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
  const pct      = f => `${(f * 100).toFixed(1)}%`;

  /* robust numeric parser: "1,234.56" → 1234.56 */
  const parseNumber = val => {
    if (val == null) return NaN;
    return parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
  };

  const parseDate = ReportUtils.parseDate;

  /* ---------- promise wrapper ---------- */
  return new Promise((resolve, reject) => {
    const item = modalEl.querySelector(`#item-${reportId}`);
    if (!item) return reject({ reportId, error: 'list-item not found' });

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
          return resolve({ reportId, status: 'error' });
        }

        /* ---------- SKU → unit cost ---------- */
        const costBySku = dbDF.reduce((acc, r) => {
          const sku  = r.PartNumber || r.Product_Service;
          const cost = parseNumber(r.UnitCost ?? r.Unit_Cost);
          if (sku) acc[sku] = isFinite(cost) ? cost : 0;
          return acc;
        }, {});

        /* ---------- profit rows ---------- */
        const rows = [];
        const skuDescriptions = {};

        salesDF.forEach(r => {
          const dt = parseDate(r.Date);
          if (!dt) return;

          const sku   = r.Product_Service;
          const qty   = isFinite(parseNumber(r.Quantity)) ? parseNumber(r.Quantity) : 1;
          const rev   = parseNumber(r.Total_Amount);
          const cost  = (costBySku[sku] || 0) * qty;
          const profit = rev - cost;

          if (!isFinite(profit)) return;          // still malformed

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
          item.insertAdjacentHTML('beforeend',' <small class="text-muted">(No calculable rows)</small>');
          return resolve({ reportId, status: 'success', message: 'empty' });
        }

        /* ---------- display label per SKU ---------- */
        const labelForSku = {};
        for (const [sku, counts] of Object.entries(skuDescriptions)) {
          const best = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
          labelForSku[sku] = best ? `${sku}: ${best}` : sku;
        }

        /* ---------- aggregator ---------- */
        function topBy (bucketKey, yearFilter = null) {
          const totals = {};
          rows.forEach(r => {
            if (yearFilter !== null && r.year !== yearFilter) return;
            const key = bucketKey === 'customer'
              ? (r.customer || '(no customer)')
              : (labelForSku[r.sku] || r.sku || '(no SKU)');
            totals[key] = (totals[key] || 0) + r.profit;
          });
          return Object.entries(totals)
                       .sort((a, b) => b[1] - a[1])
                       .slice(0, topN)
                       .map(([label, total]) => ({ label, total }));
        }

        /* ---------- time scopes ---------- */
        const years = [...new Set(rows.map(r => r.year))].sort((a, b) => b - a);
        const companyTotalAll = rows.reduce((a, r) => a + r.profit, 0);

        const overallCust = topBy('customer');
        const overallProd = topBy('product');

        const custByYear   = {};
        const prodByYear   = {};
        const companyByYear = {};
        years.forEach(y => {
          custByYear[y]    = topBy('customer', y);
          prodByYear[y]    = topBy('product' , y);
          companyByYear[y] = rows.filter(r => r.year === y)
                                 .reduce((a, r) => a + r.profit, 0);
        });

        /* ---------- header ---------- */
        const header = [
          'All-Time Customer/Product', 'All-Time Profit', 'All-Time % of Profit', ''
        ];
        years.forEach((y, idx) => {
          header.push(`${y} Customer/Product`, `${y} Profit`, `${y} % of Profit`);
          if (idx < years.length - 1) header.push('');
        });

        /* ---------- section builder ---------- */
        function makeSection (overallArr, yearlyDict) {
          const out = [];
          for (let i = 0; i < topN; i++) {
            const row = [];
            const o = overallArr[i] || {};
            row.push(
              o.label || '',
              o.label ? currency(o.total) : '',
              o.label ? pct(o.total / companyTotalAll) : '',
              ''
            );
            years.forEach((y, idx) => {
              const v = yearlyDict[y][i] || {};
              const den = companyByYear[y] || 0;
              row.push(
                v.label || '',
                v.label ? currency(v.total) : '',
                (v.label && den) ? pct(v.total / den) : ''
              );
              if (idx < years.length - 1) row.push('');
            });
            out.push(row);
          }
          return out;
        }

        const csvRows = [
          header,
          ...makeSection(overallCust, custByYear),
          [],
          ...makeSection(overallProd, prodByYear)
        ];

        /* ---------- CSV ---------- */
        const toCSV = arr =>
          arr.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

        const csv = toCSV(csvRows);

        /* ---------- UI ---------- */
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
          item.insertAdjacentHTML('beforeend',' <small class="text-muted">(No profit rows)</small>');
        }

        resolve({ reportId, status: 'success', rows: csvRows.length });

      } catch (err) {
        console.error('Profit report error', err);
        item.querySelector('.spinner-border')?.remove();
        item.insertAdjacentHTML('beforeend',' <small class="text-danger">(Error)</small>');
        reject({ reportId, error: err });
      }
    }, 0);
  });
};
