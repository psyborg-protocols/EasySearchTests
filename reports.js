/* reports.js  –  Revenue-drop report only
   --------------------------------------
   DEPENDS ON
     • window.dataStore   (populated by dataLoader.js)
     • FileSaver.min.js   (saveAs global)
     • Bootstrap JS
*/
window.initReports = function initReports () {
  /* ---------- guards ---------- */
  if (!window.dataStore?.Sales?.dataframe) {
    console.error('[reports] Sales sheet not loaded – reports disabled');
    return;
  }
  const rows = window.dataStore.Sales.dataframe;

  /* ---------- helpers ---------- */
  const toCSV = rows => {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc  = v => `"${String(v).replace(/"/g, '""')}"`;
    return [cols.join(',')]
      .concat(rows.map(r => cols.map(c => esc(r[c])).join(',')))
      .join('\n');
  };

  /* ---------- report builder ---------- */
  function buildRevenueDropReport () {
    // 1. parse dates & amounts
    rows.forEach(r => {
      r.dateObj = new Date(r.Date);
      r.amount  = parseFloat(String(r.Total_Amount || '0').trim());
    });

    // 2. two 12-month windows
    const now          = new Date();
    const startCurrent = new Date(now);
    startCurrent.setFullYear(startCurrent.getFullYear() - 1);
    const startPrev    = new Date(startCurrent);
    startPrev.setFullYear(startPrev.getFullYear() - 1);

    // 3. revenue per customer per window
    const rev = { current: {}, previous: {} };
    rows.forEach(r => {
      const c = r.Customer;
      if (r.dateObj >= startCurrent && r.dateObj <= now) {
        rev.current[c]  = (rev.current[c]  || 0) + r.amount;
      } else if (r.dateObj >= startPrev && r.dateObj < startCurrent) {
        rev.previous[c] = (rev.previous[c] || 0) + r.amount;
      }
    });

    // 4. build metrics
    const allCustomers = [...new Set(rows.map(r => r.Customer))];
    const metrics = allCustomers.map(c => {
      const cur = rev.current[c]  || 0;
      const prev = rev.previous[c] || 0;
      const highest = Math.max(cur, prev);
      const pctDrop = prev > 0 ? ((prev - cur) / prev) * 100 : 0;
      return { c, cur, prev, highest, pctDrop };
    });

    // 5. top-20 lists
    const top20 = {};
    ['previous', 'current'].forEach(win => {
      top20[win] = metrics
        .slice()
        .sort((a, b) => b[win] - a[win])
        .slice(0, 20)
        .map(m => m.c);
    });

    // 6. annotate
    metrics.forEach(m => {
      m.periodsInTop20  = ['previous', 'current'].filter(win => top20[win].includes(m.c));
      m.numPeriodsTop20 = m.periodsInTop20.length;
      m.inTop20Current  = top20.current.includes(m.c);
    });

    // 7. final rows (>20 % drop)
    return metrics
      .filter(m => m.pctDrop > 20)
      .map(m => ({
        Customer:                        m.c,
        periods_in_top_20:               m.numPeriodsTop20,
        highest_grossing_period_revenue: m.highest,
        revenue_previous_12m:            m.prev,
        revenue_last_12m:                m.cur,
        percent_decrease:                +m.pctDrop.toFixed(2),
        in_top_20_current:               m.inTop20Current
      }));
  }

  /* expose for console */
  window.reports = { buildRevenueDropReport };

  /* ---------- modal driver ---------- */
  const modalEl = document.getElementById('reportsModal');
  const trigger = document.getElementById('generateReportsBtn');
  if (!modalEl || !trigger) {
    console.error('[reports] Modal or trigger missing');
    return;
  }
  const bsModal = new bootstrap.Modal(modalEl);
  const spinner = modalEl.querySelector('#item-revdrop .spinner-border');
  const iconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#5f6368">
      <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
    </svg>`;
  const li = modalEl.querySelector('#item-revdrop');

  function makeIconButton (blob, fileName) {
    const btn = document.createElement('button');
    btn.className = 'btn p-1 border-0 bg-transparent';
    btn.innerHTML = iconSvg;
    btn.title = 'Download CSV';
    btn.onclick = () => saveAs(blob, fileName);
    return btn;
  }

  trigger.onclick = () => {
    spinner.classList.remove('d-none');
    // hide any previous icon
    li.querySelector('button')?.remove();
    bsModal.show();

    setTimeout(() => {
      const rows = buildRevenueDropReport();
      const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' });
      spinner.classList.add('d-none');
      li.appendChild(makeIconButton(blob, 'revenue_drop_report.csv'));
      console.log('[reports] Revenue-drop report ready:', rows.length, 'rows');
    }, 50);
  };
};
