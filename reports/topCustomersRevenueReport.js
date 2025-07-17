/* reports/topCustomersRevenueReport.js
   --------------------------------------------------------------- */

window.buildTopCustomersByRevenueReport = function buildTopCustomersByRevenueReport(
        modalEl,
        reportId         // “top20cust”
) {
  return new Promise((resolve, reject) => {

    /* --- locate our <li> in the modal --- */
    const liId  = `item-${reportId}`;
    const li    = modalEl.querySelector(`#${liId}`);
    if (!li) {
      console.error(`[${reportId}] list-item not found`);
      return reject({ reportId, error : 'list-item not found' });
    }

    /* --- little helpers --- */
    const parseDate = (str) => {
      if (!str) return null;

      // 1️⃣ strip commas and normalise M/D/YY → M/D/YYYY
      const cleaned = str.trim()
                        .replace(/,/g, '')
                        .replace(/(\d{1,2})\/(\d{1,2})\/(\d{2})$/, '$1/$2/20$3');

      // 2️⃣ allow “Jul 9 2025” or “2025‑07‑09”
      const ts = Date.parse(cleaned);
      return isNaN(ts) ? null : new Date(ts);
    };

    const cleanAmount = v =>
      parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0;

    const toCSV = (rows) => {
      if (!rows.length) return '';
      const cols = Object.keys(rows[0]);
      const esc  = v => `"${String(v).replace(/"/g,'""')}"`;
      return [cols.join(',')]
             .concat(rows.map(r => cols.map(c => esc(r[c])).join(',')))
             .join('\n');
    };

    /* --- crunch the numbers (async-friendly 0 ms slot) --- */
    setTimeout(() => {
      try {
        const salesDF = window.dataStore?.Sales?.dataframe || [];
        if (!salesDF.length) {
          li.querySelector('.spinner-border')?.remove();
          li.insertAdjacentHTML('beforeend',
            ' <small class="text-muted">(no sales data)</small>');
          return resolve({ reportId, status : 'success', count : 0 });
        }

        const today          = new Date();
        const twelveMoAgo    = new Date();
        twelveMoAgo.setMonth(today.getMonth() - 12);

        /* --- aggregate revenue per customer --- */
        const totals = {};  // { customer → { revenue, orders } }
        for (const row of salesDF) {
          const saleDate = parseDate(row.Date);
          if (!saleDate || saleDate < twelveMoAgo) continue;

          const cust   = row.Customer?.trim();
          if (!cust) continue;

          const amount = cleanAmount(row.Total_Amount);
          if (!totals[cust]) totals[cust] = { revenue:0, orders:0 };
          totals[cust].revenue += amount;
          totals[cust].orders  += 1;
        }

        const top20 = Object.entries(totals)
          .sort((a,b) => b[1].revenue - a[1].revenue)
          .slice(0, 20)
          .map(([cust,stats], idx) => ({
            '#': idx+1,
            'Customer Name' : cust,
            'Total Revenue ($)' : `$${stats.revenue.toFixed(2)}`,
            'Orders (12 mo)'    : stats.orders
          }));

        li.querySelector('.spinner-border')?.remove();

        if (!top20.length) {
          li.insertAdjacentHTML('beforeend',
            ' <small class="text-muted">(no sales in last 12 mo)</small>');
          return resolve({ reportId, status:'success', count:0 });
        }

        /* --- download-button --- */
        const csv   = toCSV(top20);
        const btn   = document.createElement('button');
        btn.className = 'report-download-btn';
        btn.title     = 'Download Top-20 Customers CSV';
        btn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"
               width="24" height="24" fill="#5f6368">
            <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56
                     58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480
                     v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
          </svg>`;
        btn.onclick = () => saveAs(new Blob([csv],
          {type:'text/csv;charset=utf-8'}),
          'top20_customers_12mo.csv');
        li.appendChild(btn);

        resolve({ reportId, status:'success', count:top20.length });

      } catch (err) {
        console.error(`[${reportId}]`, err);
        li.querySelector('.spinner-border')?.remove();
        li.insertAdjacentHTML('beforeend',
          ' <small class="text-danger">(error)</small>');
        reject({ reportId, error:err });
      }
    }, 0);
  });
};
