/* reports/productRevenueDropReport.js
   ---------------------------------- */

window.buildProductRevenueDropReport = function buildProductRevenueDropReport(modalEl, reportId) {
  return new Promise((resolve, reject) => {
    /* ---------- locate list item ---------- */
    const item = modalEl.querySelector(`#item-${reportId}`);
    if (!item) {
      console.error(`LI #item-${reportId} not found`);
      return reject({ reportId, error: 'List item not found' });
    }

    /* we yield the UI thread so the spinner paints */
    setTimeout(() => {
      try {
        const raw = window.dataStore?.Sales?.dataframe || [];
        if (raw.length === 0) {
          item.querySelector('.spinner-border')?.remove();
          item.insertAdjacentHTML('beforeend',
            ' <small class="text-muted">(No sales data available)</small>');
          return resolve({ reportId, status: 'success', message: 'No data' });
        }

        /* ---------- helpers ---------- */
        const parseDate = s => {
          if (typeof s !== 'string') return null;
          const [m, d, y] = s.split('/').map(t => +t.trim());
          return (m && d && y) ? new Date(y, m - 1, d) : null;
        };
        const msPerYr = 365.25 * 864e5;

        /* ---------- reshape ---------- */
        const parsed = raw.map(r => {
          const dt = parseDate(r.Date);
          if (!dt) return null;
          return {
            product : r.Product_Service,
            descr   : r.Memo_Description || r.Description || '',
            date    : dt,
            rev     : +String(r.Total_Amount).replace(/\s/g,'') || 0
          };
        }).filter(Boolean);

        if (!parsed.length) {
          item.querySelector('.spinner-border')?.remove();
          item.insertAdjacentHTML('beforeend',
            ' <small class="text-muted">(No valid sales rows)</small>');
          return resolve({ reportId, status: 'success', message: 'No rows' });
        }

        /* ---------- aggregates ---------- */
        const skus      = [...new Set(parsed.map(r => r.product))];
        const yearsList = [...new Set(parsed.map(r => r.date.getFullYear()))].sort();

        const totalRev  = {};
        const revByYr   = {};
        const minDate   = {};
        const maxDate   = {};
        yearsList.forEach(y => revByYr[y] = {});

        parsed.forEach(r => {
          totalRev[r.product] = (totalRev[r.product] || 0) + r.rev;
          const yr = r.date.getFullYear();
          revByYr[yr][r.product] = (revByYr[yr][r.product] || 0) + r.rev;
          minDate[r.product] = minDate[r.product] ? Math.min(minDate[r.product], r.date) : r.date;
          maxDate[r.product] = maxDate[r.product] ? Math.max(maxDate[r.product], r.date) : r.date;
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

        /* ---------- utility: percent change ---------- */
        function pctChange(prior, last) {
          if (prior === 0 && last === 0) return 0;
          if (prior === 0)               return 100; // went from 0 → some
          return ((last - prior) / prior) * 100;
        }

        /* ---------- build rows ---------- */
        const reportRows = skus.map(sku => {
          const prior = revPrior12[sku] || 0;
          const last  = revLast12[sku]  || 0;
          const pct   = pctChange(prior, last);

          const histYrs = (maxDate[sku] - minDate[sku]) / msPerYr;

          return {
            Product         : sku,
            Description     : parsed.find(r => r.product === sku)?.descr || '',
            historyYears    : histYrs,
            Total_Revenue   : totalRev[sku] || 0,
            Revenue_Last12  : last,
            Revenue_Prior12 : prior,
            Pct_Change      : pct,
            score           : (-pct / 100)                      // turn %-drop into 0–1 scale
                            * (totalRev[sku] || 0)              // weight by lifetime revenue
                            / Math.max(histYrs, 0.1)            // divide by years of history
          };
        });

        /* ---------- filter ---------- */
        const filtered = reportRows
                          .filter(r => r.Pct_Change < -20);

        /* ---------- sort by composite score ---------- */
        filtered.sort((a,b) => b.score - a.score);

        /* ---------- format for display ---------- */
        const currency = v => `$${v.toLocaleString(undefined,{minimumFractionDigits:0})}`;
        const percent  = v => `${v.toFixed(1)}%`;

        const formatted = filtered.map(r => {
          const row = {
            Product     : r.Product,
            Description : r.Description
          };
          yearsList.forEach(y => row[`Y${y}`] = currency(revByYr[y][r.Product] || 0));
          row.Total_Revenue   = currency(r.Total_Revenue);
          row.Revenue_Prior12 = currency(r.Revenue_Prior12);
          row.Revenue_Last12  = currency(r.Revenue_Last12);
          row.Pct_Change      = percent(r.Pct_Change);
          return row;
        });

        /* ---------- CSV helper ---------- */
        const toCSV = rows => {
          if (!rows.length) return '';
          const cols = Object.keys(rows[0]);
          const esc  = v => `"${String(v).replace(/"/g,'""')}"`;
          return [cols.join(',')]
            .concat(rows.map(r => cols.map(c => esc(r[c])).join(',')))
            .join('\n');
        };

        /* ---------- update UI ---------- */
        item.querySelector('.spinner-border')?.remove();

        if (formatted.length) {
          const csv   = toCSV(formatted);
          const btn   = document.createElement('button');
          btn.className = 'report-download-btn';
          btn.title     = 'Download Product Rev-Drop Report';
          btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368">
              <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>`;
          btn.onclick = () =>
            saveAs(new Blob([csv],{type:'text/csv;charset=utf-8'}),
                   'product_revenue_drop_report.csv');
          item.appendChild(btn);
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
    }, 0); // setTimeout
  }); // Promise
};
