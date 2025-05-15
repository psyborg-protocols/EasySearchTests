/* reports/productLapsedReport.js ------------------------------------------ */

window.buildProductLapsedReport = function buildProductLapsedReport(modalEl, reportId) {
  return new Promise((resolve, reject) => {
    const liId = `item-${reportId}`;
    const item = modalEl.querySelector(`#${liId}`);
    if (!item) return reject({ reportId, error: `List item #${liId} not found` });

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

        const today        = new Date();
        const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(today.getMonth() - 6);
        const MIN_PERIOD_DAYS = 180;

        /* ---------- group rows by product ---------- */
        const salesByProd = raw.reduce((acc, row) => {
          const prodNum = row.Product_Service;
          const descr   = row.Memo_Description || '';
          const saleDt  = parseDate(row.Date);
          if (!saleDt || isNaN(saleDt)) return acc;

          (acc[prodNum] ||= { descr, rows: [] }).rows.push({
            date: saleDt,
            qty : +row.Quantity  || 0,
            rev : +row.Total_Amount?.toString().replace(/\s/g, '') || 0
          });
          return acc;
        }, {});

        /* ---------- derive lapsed products ---------- */
        const outRows = [];

        Object.entries(salesByProd).forEach(([prodNum, { descr, rows }]) => {
          rows.sort((a, b) => b.date - a.date);          // most-recent first
          const lastSale = rows[0].date;
          if (lastSale >= sixMonthsAgo) return;          // still active

          if (rows.length < 2) return;                   // need history
          const firstSale   = rows[rows.length - 1].date;
          const spanDays    = (lastSale - firstSale) / 86_400_000; // ms→days
          if (spanDays < MIN_PERIOD_DAYS) return;        // history too short

          const avgPer180 = (rows.length / spanDays) * 180;
          if (avgPer180 <= 1) return;                    // not frequent enough

          outRows.push({
            'Product Number'                 : prodNum,
            'Description'                    : descr,
            'Avg Sales Freq (orders/6mo)'    : avgPer180.toFixed(2),
            'Date of Last Sale'              : lastSale.toLocaleDateString('en-US',
                                                { year:'numeric', month:'2-digit', day:'2-digit' })
          });
        });

        outRows.sort((a, b) =>
          new Date(b['Date of Last Sale']) - new Date(a['Date of Last Sale']));

        item.querySelector('.spinner-border')?.remove();

        if (outRows.length) {
          /* CSV helper copied from customer version */
          const toCSV = rows => {
            const esc = v => `"${String(v).replace(/"/g,'""')}"`;
            const cols = Object.keys(rows[0]);
            return [cols.join(',')]
              .concat(rows.map(r => cols.map(c => esc(r[c])).join(',')))
              .join('\n');
          };

          const csv = toCSV(outRows);
          const btn = document.createElement('button');
          btn.className = 'report-download-btn';
          btn.title     = 'Download Lapsed Products Report';
          btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368">
              <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>`;
          btn.onclick = () =>
            saveAs(new Blob([csv], { type:'text/csv;charset=utf-8' }),
                   'lapsed_products_report.csv');
          item.appendChild(btn);
          resolve({ reportId, status:'success', count: outRows.length });
        } else {
          item.insertAdjacentHTML('beforeend',
            ' <small class="text-muted">(No products matching criteria)</small>');
          resolve({ reportId, status:'success', message:'No matches' });
        }

      } catch (err) {
        console.error('Lapsed Products error', err);
        item.querySelector('.spinner-border')?.remove();
        item.insertAdjacentHTML('beforeend',
          ' <small class="text-danger">(Error)</small>');
        reject({ reportId, error: err });
      }
    }, 0);
  });
};
