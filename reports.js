/* reports.js ------------------------------------------------------- */

/* ── 1. ONE shared Bootstrap modal handle ───────────────────────── */
let _reportsWired   = false;
let _bsReportsModal = null;   // <-- make it module-level so helpers can see it

window.initReports = function initReports () {
  if (_reportsWired) return;
  _reportsWired = true;

  const btnGen  = document.getElementById('generateReportsBtn');
  const modalEl = document.getElementById('reportsModal');
  if (!btnGen || !modalEl) return;

  _bsReportsModal = new bootstrap.Modal(modalEl);

  /* ── MAIN CLICK ──────────────────────────────────────────────── */
  btnGen.onclick = () => {
    /* reset modal each time */
    modalEl.querySelector('.list-group').innerHTML = `
      <li id="item-drop"
          class="list-group-item d-flex justify-content-between align-items-center">
        Revenue Drop &gt; 20%
        <span class="spinner-border spinner-border-sm text-primary" role="status"></span>
      </li>`;
    modalEl.querySelector('.modal-footer').innerHTML = '';
    _bsReportsModal.show();

    /* build now or when data arrive */
    const run = () => buildRevenueDropReport(modalEl);
    if (window.reportsReady) {
      run();
    } else {
      document.addEventListener('reports-ready', run, { once: true });
    }
  };
};

/* ── 2. the heavy-lifter ------------------------------------------------ */
function buildRevenueDropReport (modalEl) {
  const list   = modalEl.querySelector('.list-group');
  const footer = modalEl.querySelector('.modal-footer');

  /* (a) still show spinner while we number-crunch */
  list.innerHTML   = '';
  footer.innerHTML = '';

  const li = document.createElement('li');
  li.id        = 'item-drop';
  li.className = 'list-group-item d-flex justify-content-between align-items-center';
  li.innerHTML = `Revenue Drop &gt; 20%
      <span class="spinner-border spinner-border-sm text-primary" role="status"></span>`;
  list.appendChild(li);

  setTimeout(() => {
    const raw = window.dataStore.Sales.dataframe;
      const parsed = raw.map(r => {
        const [m, d, y] = r.Date.split('/').map(s => s.trim());
        return {
          customer: r.Customer,
          date: new Date(+y, +m - 1, +d),
          revenue: parseFloat(r.Total_Amount)
        };
      });

      const customers = Array.from(new Set(parsed.map(r => r.customer)));
      const years = Array.from(new Set(parsed.map(r => r.date.getFullYear()))).sort();

      const totalRev = parsed.reduce((acc, r) => {
        acc[r.customer] = (acc[r.customer] || 0) + r.revenue;
        return acc;
      }, {});

      const revByYear = years.reduce((outer, year) => {
        const byCust = parsed
          .filter(r => r.date.getFullYear() === year)
          .reduce((acc, r) => {
            acc[r.customer] = (acc[r.customer] || 0) + r.revenue;
            return acc;
          }, {});
        outer[year] = byCust;
        return outer;
      }, {});

      const now = new Date();
      const last12Start = new Date(now); last12Start.setFullYear(now.getFullYear() - 1);
      const prior12Start = new Date(now); prior12Start.setFullYear(now.getFullYear() - 2);

      const sumWindow = (start, end) =>
        parsed
          .filter(r => r.date >= start && r.date < end)
          .reduce((acc, r) => {
            acc[r.customer] = (acc[r.customer] || 0) + r.revenue;
            return acc;
          }, {});

      const revLast12 = sumWindow(last12Start, now);
      const revPrior12 = sumWindow(prior12Start, last12Start);

      const formatCurrency = val => `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      const formatPercent = val => `${val.toFixed(1)}%`;

      const reportRows = customers.map(cust => {
        const prior = revPrior12[cust] || 0;
        const last = revLast12[cust] || 0;
        const pctChange = prior > 0 ? ((last - prior) / prior) * 100 : null;

        const row = {
          Customer: cust,
          Total_Revenue: totalRev[cust] || 0,
          Revenue_Last12: last,
          Revenue_Prior12: prior,
          Pct_Change: pctChange
        };

        // Add Y2021, Y2022, etc.
        years.forEach(y => {
          row[`Y${y}`] = revByYear[y][cust] || 0;
        });

        return row;
      });

      const filtered = reportRows
        .filter(r => r.Pct_Change !== null && r.Pct_Change < -20)
        .sort((a, b) => b.Total_Revenue - a.Total_Revenue);

      // Format all currency fields and percent
      const formatted = filtered.map(r => {
        const formattedRow = { Customer: r.Customer };

        // Format revenue columns
        Object.entries(r).forEach(([k, v]) => {
          if (k === 'Customer') return;
          if (k === 'Pct_Change') {
            formattedRow[k] = formatPercent(v);
          } else {
            formattedRow[k] = formatCurrency(v);
          }
        });

        return formattedRow;
      });

      // CSV serialization
      const toCSV = rows => {
        if (!rows.length) return "";
        const cols = Object.keys(rows[0]);
        const esc = v => `"${String(v).replace(/"/g, '""')}"`;
        return [cols.join(",")]
          .concat(rows.map(r => cols.map(c => esc(r[c])).join(",")))
          .join("\n");
      };
      const csv = toCSV(formatted);

    const item = modalEl.querySelector('#item-drop');
    item.querySelector('.spinner-border')?.remove();

    const btn = document.createElement('button');
    btn.className = 'report-download-btn';
    btn.title     = 'Download CSV';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg"
           viewBox="0 -960 960 960" width="20" height="20">
        <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104
                 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120
                 h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
      </svg>`;
    btn.onclick = () =>
      saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
             'revenue_drop_report.csv');
    item.appendChild(btn);
  }, 0);
}

/* ── fire the initial wiring on page-ready ─────────────────────── */
document.addEventListener('DOMContentLoaded', initReports);