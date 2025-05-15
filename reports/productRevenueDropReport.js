/* reports/productRevenueDropReport.js
   ---------------------------------- */

window.buildProductRevenueDropReport = function buildProductRevenueDropReport(modalEl, reportId) {
  return new Promise((resolve, reject) => {
    const item = modalEl.querySelector(`#item-${reportId}`);
    if (!item) {
      console.error(`LI #item-${reportId} not found`);
      return reject({ reportId, error: 'List item not found' });
    }

    setTimeout(() => {
      try {
        const raw = window.dataStore.Sales.dataframe;
        if (!raw || raw.length === 0) {
          item.querySelector('.spinner-border')?.remove();
          item.insertAdjacentHTML('beforeend',
            ' <small class="text-muted">(No sales data available)</small>');
          return resolve({ reportId, status: 'success', message: 'No data' });
        }

        /* ----------  Parse & reshape ---------- */
        const parsed = raw.map(r => {
          const [m, d, y] = (r.Date || '').split('/').map(s => +s.trim());
          const dt = new Date(y, m - 1, d);
          if (isNaN(dt)) return null;

          return {
            product: r.Product_Service,               // Product number / SKU
            descr  : r.Description || '',             // Human-readable description
            date   : dt,
            rev    : +String(r.Total_Amount).replace(/\s/g, '') || 0
          };
        }).filter(Boolean);

        if (!parsed.length) {
          item.querySelector('.spinner-border')?.remove();
          item.insertAdjacentHTML('beforeend',
            ' <small class="text-muted">(No valid sales rows)</small>');
          return resolve({ reportId, status: 'success', message: 'No rows' });
        }

        /* ----------  Derive aggregates ---------- */
        const skus     = [...new Set(parsed.map(r => r.product))];
        const years    = [...new Set(parsed.map(r => r.date.getFullYear()))].sort();

        const totalRev = {};
        const revByYr  = {};
        years.forEach(y => revByYr[y] = {});

        parsed.forEach(r => {
          totalRev[r.product] = (totalRev[r.product] || 0) + r.rev;
          const yr = r.date.getFullYear();
          revByYr[yr][r.product] = (revByYr[yr][r.product] || 0) + r.rev;
        });

        const now          = new Date();
        const last12Start  = new Date(now);  last12Start.setFullYear(now.getFullYear() - 1);
        const prior12Start = new Date(now);  prior12Start.setFullYear(now.getFullYear() - 2);

        const sumWindow = (start, end) =>
          parsed.filter(r => r.date >= start && r.date < end)
                .reduce((acc, r) => {
                  acc[r.product] = (acc[r.product] || 0) + r.rev;
                  return acc;
                }, {});

        const revLast12  = sumWindow(last12Start, now);
        const revPrior12 = sumWindow(prior12Start, last12Start);

        /* ----------  Build rows ---------- */
        const reportRows = skus.map(sku => {
          const prior = revPrior12[sku] || 0;
          const last  = revLast12[sku]  || 0;
          const pct   = prior > 0 ? ((last - prior) / prior) * 100
                                  : (last > 0 ? 100 : -100);

          const row = {
            Product          : sku,
            Description      : parsed.find(r => r.product === sku)?.descr || '',
            Total_Revenue    : totalRev[sku] || 0,
            Revenue_Last12   : last,
            Revenue_Prior12  : prior,
            Pct_Change       : pct
          };

          years.forEach(y => row[`Y${y}`] = revByYr[y][sku] || 0);
          return row;
        });

        /* ----------  Filter, format & sort ---------- */
        const currency = v => `$${v.toLocaleString(undefined,{minimumFractionDigits:0})}`;
        const percent  = v => `${v.toFixed(1)}%`;

        const filtered  = reportRows
                           .filter(r => r.Pct_Change < -20)
                           .sort((a,b) => b.Total_Revenue - a.Total_Revenue);

        const formatted = filtered.map(r => {
          const o = { Product: r.Product, Description: r.Description };
          Object.entries(r).forEach(([k,v]) => {
            if (k === 'Product' || k === 'Description') return;
            o[k] = k === 'Pct_Change' ? percent(v) : currency(v);
          });
          return o;
        });

        /* ----------  CSV & UI plumbing ---------- */
        const toCSV = rows => {
          if (!rows.length) return '';
          const cols = Object.keys(rows[0]);
          const esc  = v => `"${String(v).replace(/"/g,'""')}"`;
          return [cols.join(',')]
                 .concat(rows.map(r => cols.map(c => esc(r[c])).join(',')))
                 .join('\n');
        };

        item.querySelector('.spinner-border')?.remove();

        if (formatted.length) {
          const csv     = toCSV(formatted);
          const dlBtn   = document.createElement('button');
          dlBtn.className = 'report-download-btn';
          dlBtn.title     = 'Download Product Rev-Drop Report';
          dlBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368">
              <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>`;
          dlBtn.onclick = () =>
            saveAs(new Blob([csv],{type:'text/csv;charset=utf-8'}),
                   'product_revenue_drop_report.csv');
          item.appendChild(dlBtn);
          resolve({ reportId, status:'success', count: formatted.length });
        } else {
          item.insertAdjacentHTML('beforeend',
            ' <small class="text-muted">(No products with >20 % drop)</small>');
          resolve({ reportId, status:'success', message:'No matches' });
        }
      } catch (err) {
        console.error('Product Rev-Drop error', err);
        item.querySelector('.spinner-border')?.remove();
        item.insertAdjacentHTML('beforeend',
          ' <small class="text-danger">(Error)</small>');
        reject({ reportId, error: err });
      }
    }, 0);
  });
};
